import { ERROR_CODES } from '@repo/shared';

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
 * Parses an HTTP response + JSON payload cleanly without leaking stack traces.
 *
 * @param status - HTTP response status code.
 * @param json - Parsed JSON envelope (if available).
 * @param fallbackMessage - Message to surface when no server error message is present.
 */
export function extractApiError(
  status: number,
  json: unknown,
  fallbackMessage: string,
): ParsedApiError {
  const payload =
    json && typeof json === 'object' ? (json as { error?: { code?: string; message?: string } }) : null;
  const code = payload?.error?.code || (status === 503 ? ERROR_CODES.SERVICE_UNAVAILABLE : 'HTTP_ERROR');
  const message =
    payload?.error?.message ||
    (status === 503
      ? 'Layanan backend atau database PostgreSQL sedang tidak tersedia.'
      : fallbackMessage);

  return {
    isServiceUnavailable: status === 503 || code === ERROR_CODES.SERVICE_UNAVAILABLE,
    code,
    message,
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

