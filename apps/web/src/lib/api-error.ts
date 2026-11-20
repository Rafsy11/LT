import { ERROR_CODES, STANDARD_ERROR_MESSAGES, sanitizeUiErrorMessage } from '@repo/shared';
import {
  extractFieldErrors,
  generateErrorRefCode,
  parseRetryAfterSeconds,
} from './error-normalizer';
import { ERROR_CATEGORY_DICTIONARY } from './error-dictionary';

export type OutageCategory = 'database' | 'service';

export interface ServiceUnavailableState {
  active: boolean;
  message: string;
  category: OutageCategory;
  source?: string;
  updatedAt: number;
}

export interface ParsedApiError {
  isServiceUnavailable: boolean;
  code: string;
  message: string;
  statusCode?: number;
  refCode?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
}

export interface SafeUiErrorDetails {
  code: string;
  refId: string;
  message: string;
}

const SERVICE_UNAVAILABLE_EVENT = 'fiberops:service-unavailable';

let currentOutageState: ServiceUnavailableState = {
  active: false,
  message: '',
  category: 'database',
  updatedAt: 0,
};

function emitOutageState(nextState: ServiceUnavailableState): void {
  currentOutageState = nextState;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ServiceUnavailableState>(SERVICE_UNAVAILABLE_EVENT, {
        detail: nextState,
      }),
    );
  }
}

/**
 * Returns the latest backend connectivity status recorded by the client.
 *
 * @example
 * const state = getServiceUnavailableState();
 */
export function getServiceUnavailableState(): ServiceUnavailableState {
  return currentOutageState;
}

/**
 * Marks a required backend dependency (PostgreSQL, Redis, MinIO, or Ollama) as unavailable
 * and notifies active ConnectionBanner subscribers.
 *
 * @param message - Human-readable Indonesian diagnostic returned by HTTP 503.
 * @param category - Distinction between core database outage and optional service outage.
 * @param source - Endpoint path or subsystem identifier that triggered the 503.
 */
export function reportServiceUnavailable(
  message: string,
  category: OutageCategory = 'database',
  source?: string,
): void {
  emitOutageState({
    active: true,
    message,
    category,
    source,
    updatedAt: Date.now(),
  });
}

/**
 * Clears the service outage banner state when connectivity is verified healthy again.
 *
 * @param category - When provided, only clears outages matching that category.
 */
export function clearServiceUnavailable(category?: OutageCategory): void {
  if (!currentOutageState.active) return;
  if (category && currentOutageState.category !== category) return;

  emitOutageState({
    active: false,
    message: '',
    category: 'database',
    updatedAt: Date.now(),
  });
}

/**
 * Subscribes to live HTTP 503 service-unavailable notifications on the client.
 *
 * @param listener - Callback invoked whenever outage state changes.
 * @returns Unsubscribe function for React effect cleanup.
 */
export function subscribeServiceUnavailable(
  listener: (state: ServiceUnavailableState) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ServiceUnavailableState>;
    listener(customEvent.detail || currentOutageState);
  };

  window.addEventListener(SERVICE_UNAVAILABLE_EVENT, handler);
  return () => window.removeEventListener(SERVICE_UNAVAILABLE_EVENT, handler);
}

/**
 * Converts any raw error, HTTP payload, or exception into a strictly non-informative
 * client-safe object plus an opaque reference code for internal incident tracking.
 */
export function formatSafeUiError(
  rawError: unknown,
  options: { fallbackMessage?: string; digest?: string } = {},
): SafeUiErrorDetails {
  const sanitized = sanitizeUiErrorMessage(rawError);
  const rawObj =
    typeof rawError === 'object' && rawError !== null
      ? (rawError as { code?: unknown; errorCode?: unknown; error?: { code?: unknown } })
      : null;
  const rawCode = String(
    rawObj?.code || rawObj?.errorCode || rawObj?.error?.code || '',
  ).toUpperCase();
  const hasExplicitServerSystemCode =
    rawCode === ERROR_CODES.INTERNAL_ERROR || rawCode === ERROR_CODES.SERVICE_UNAVAILABLE;

  // Prefer explicit caller fallback when sanitized fell back to the generic internal message
  const genericInternal = STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR;
  const safeFallback = options.fallbackMessage
    ? sanitizeUiErrorMessage(options.fallbackMessage).message
    : '';

  const message =
    safeFallback &&
    !hasExplicitServerSystemCode &&
    sanitized.code === ERROR_CODES.INTERNAL_ERROR &&
    sanitized.message === genericInternal
      ? safeFallback
      : sanitized.message;

  const refId = generateErrorRefCode(options.digest);

  return {
    code: sanitized.code,
    refId,
    message,
  };
}

/**
 * Parses an HTTP response + JSON payload cleanly without leaking stack traces or DB internals.
 *
 * @param status - HTTP response status code.
 * @param json - Parsed JSON envelope (if available).
 * @param fallbackMessage - Message to surface when no safe server error message is present.
 * @param retryAfterHeader - Optional HTTP `Retry-After` header string.
 */
export function extractApiError(
  status: number,
  json: unknown,
  fallbackMessage: string,
  retryAfterHeader?: string | null,
): ParsedApiError {
  const payload =
    json && typeof json === 'object'
      ? (json as {
          error?: {
            code?: string;
            message?: string;
            retryAfter?: number;
            fieldErrors?: Record<string, string>;
          };
          meta?: { retryAfterMs?: number };
        })
      : null;

  const fieldErrors = extractFieldErrors(payload);
  const code =
    payload?.error?.code ||
    (status === 503
      ? ERROR_CODES.SERVICE_UNAVAILABLE
      : status >= 500
        ? ERROR_CODES.INTERNAL_ERROR
        : status === 401
          ? ERROR_CODES.UNAUTHORIZED
          : status === 403
            ? ERROR_CODES.FORBIDDEN
            : status === 408
              ? ERROR_CODES.REQUEST_TIMEOUT
              : status === 409
                ? 'CONFLICT'
                : status === 413
                  ? ERROR_CODES.PAYLOAD_TOO_LARGE
                  : status === 415
                    ? ERROR_CODES.UNSUPPORTED_MEDIA_TYPE
                    : status === 429
                      ? ERROR_CODES.RATE_LIMIT_EXCEEDED
                      : 'HTTP_ERROR');

  if (status === 503 || code === ERROR_CODES.SERVICE_UNAVAILABLE) {
    return {
      isServiceUnavailable: true,
      statusCode: 503,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      refCode: generateErrorRefCode(),
      message: ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.message,
    };
  }

  if (status === 429 || code === ERROR_CODES.RATE_LIMITED || code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
    const retrySeconds =
      typeof payload?.error?.retryAfter === 'number' && payload.error.retryAfter > 0
        ? payload.error.retryAfter
        : typeof payload?.meta?.retryAfterMs === 'number' && payload.meta.retryAfterMs > 0
          ? Math.ceil(payload.meta.retryAfterMs / 1000)
          : parseRetryAfterSeconds(retryAfterHeader, 60);

    return {
      isServiceUnavailable: false,
      statusCode: 429,
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      retryAfterSeconds: retrySeconds,
      message: `Terlalu banyak permintaan dalam waktu singkat. Mohon tunggu ${retrySeconds} detik sebelum mencoba kembali.`,
    };
  }

  // Always suppress raw server error messages on 5xx responses to guarantee non-informative UI
  if (status >= 500) {
    return {
      isServiceUnavailable: false,
      statusCode: status,
      code: ERROR_CODES.INTERNAL_ERROR,
      refCode: generateErrorRefCode(),
      message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
    };
  }

  const sanitized = sanitizeUiErrorMessage({
    code,
    message: payload?.error?.message || fallbackMessage,
  });

  return {
    isServiceUnavailable: false,
    statusCode: status,
    code:
      sanitized.code === ERROR_CODES.INTERNAL_ERROR && code !== ERROR_CODES.INTERNAL_ERROR
        ? code
        : sanitized.code,
    message: sanitized.message,
    fieldErrors,
  };
}

/**
 * Inspects a fetch Response and emits the global ConnectionBanner outage alert when HTTP 503 is received.
 *
 * @returns Parsed API error details for local view error state rendering.
 */
export function notifyApiResponseError(
  status: number,
  json: unknown,
  fallbackMessage: string,
  options: { category?: OutageCategory; source?: string } = {},
): ParsedApiError {
  const parsed = extractApiError(status, json, fallbackMessage);
  if (parsed.isServiceUnavailable) {
    reportServiceUnavailable(
      parsed.message,
      options.category || 'database',
      options.source,
    );
  }
  return parsed;
}

