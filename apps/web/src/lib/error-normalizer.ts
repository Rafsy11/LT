import { ERROR_CODES, STANDARD_ERROR_MESSAGES, sanitizeUiErrorMessage } from '@repo/shared';
import {
  ERROR_CATEGORY_DICTIONARY,
  ERROR_CODE_FRIENDLY_TITLES,
  formatRetryCountdownMessage,
  type AppErrorCategory,
} from './error-dictionary';

export interface AppError extends Error {
  readonly isAppError: true;
  category: AppErrorCategory;
  statusCode: number;
  code: string;
  title: string;
  message: string;
  actionLabel: string;
  refCode: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
  details?: unknown;
}

export interface NormalizeErrorOptions {
  statusCode?: number;
  code?: string;
  fallbackMessage?: string;
  digest?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
  details?: unknown;
}

export interface FileValidationRule {
  maxSizeBytes: number;
  maxSizeLabel: string;
  allowedExtensions: readonly string[];
  allowedMimeTypes?: readonly string[];
  formatLabel: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: AppError;
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a short human-readable incident reference code (`#ERR-XXXX`)
 * suitable for calm UI error states and support escalation logs.
 *
 * @param seed - Optional Next.js error digest or identifier for deterministic hashing.
 * @returns Formatted reference token like `#ERR-7K4M`.
 * @example
 * const ref = generateErrorRefCode(error.digest); // "#ERR-8A2F"
 */
export function generateErrorRefCode(seed?: string): string {
  if (seed && seed.trim()) {
    const clean = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length >= 4) {
      return `#ERR-${clean.slice(0, 4)}`;
    }
  }

  let suffix = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 4; i++) {
      suffix += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
    }
  } else {
    const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.toUpperCase();
    for (let i = 0; i < 4; i++) {
      const code = entropy.charCodeAt(i % entropy.length) || 65;
      suffix += REF_ALPHABET[code % REF_ALPHABET.length];
    }
  }

  return `#ERR-${suffix}`;
}

/**
 * Parses an HTTP `Retry-After` header (integer seconds or HTTP-Date) into whole seconds.
 *
 * @param headerValue - Raw `Retry-After` response header value.
 * @param fallbackSeconds - Default cooldown when header is absent or unparseable.
 * @returns Positive wait duration in seconds.
 */
export function parseRetryAfterSeconds(
  headerValue: string | null | undefined,
  fallbackSeconds = 60,
): number {
  if (!headerValue) return fallbackSeconds;
  const trimmed = headerValue.trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (/^\d+$/.test(trimmed) && !Number.isNaN(asInt) && asInt > 0) {
    return asInt;
  }

  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    const deltaSeconds = Math.ceil((parsedDate - Date.now()) / 1000);
    if (deltaSeconds > 0) return deltaSeconds;
  }

  return fallbackSeconds;
}

/**
 * Extracts sanitized field-level validation messages from an API error payload.
 *
 * @param payload - Raw error object or JSON response body.
 * @returns Key-value map of field name to user-safe Indonesian correction hint.
 */
export function extractFieldErrors(payload: unknown): Record<string, string> | undefined {
  if (!payload || typeof payload !== 'object') return undefined;

  const root = payload as {
    fieldErrors?: unknown;
    error?: { fieldErrors?: unknown; details?: { fieldErrors?: unknown } };
    details?: { fieldErrors?: unknown };
  };

  const candidate =
    root.fieldErrors ??
    root.error?.fieldErrors ??
    root.error?.details?.fieldErrors ??
    root.details?.fieldErrors;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, rawVal] of Object.entries(candidate as Record<string, unknown>)) {
    const rawStr = Array.isArray(rawVal)
      ? typeof rawVal[0] === 'string'
        ? rawVal[0]
        : ''
      : typeof rawVal === 'string'
        ? rawVal
        : '';
    if (!rawStr.trim()) continue;
    const sanitized = sanitizeUiErrorMessage(rawStr);
    result[key] = sanitized.message;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function resolveCategory(statusCode: number, code: string): AppErrorCategory {
  const upperCode = code.toUpperCase();

  if (upperCode === ERROR_CODES.NETWORK_OFFLINE || upperCode === 'OFFLINE') return 'OFFLINE';
  if (statusCode === 408 || upperCode === ERROR_CODES.REQUEST_TIMEOUT || upperCode === 'TIMEOUT') {
    return 'TIMEOUT';
  }
  if (
    statusCode === 401 ||
    upperCode === ERROR_CODES.UNAUTHORIZED ||
    upperCode === ERROR_CODES.SESSION_REVOKED ||
    upperCode === ERROR_CODES.TOKEN_EXPIRED ||
    upperCode === ERROR_CODES.TOKEN_REUSE_DETECTED ||
    upperCode === ERROR_CODES.INVALID_CREDENTIALS
  ) {
    return 'UNAUTHORIZED';
  }
  if (
    statusCode === 403 ||
    upperCode === ERROR_CODES.FORBIDDEN ||
    upperCode === ERROR_CODES.HIERARCHY_VIOLATION ||
    upperCode === ERROR_CODES.IDOR_VIOLATION ||
    upperCode === ERROR_CODES.CLUSTER_ACCESS_DENIED
  ) {
    return 'FORBIDDEN';
  }
  if (statusCode === 404 || upperCode.endsWith('_NOT_FOUND') || upperCode === 'NOT_FOUND') {
    return 'NOT_FOUND';
  }
  if (statusCode === 413 || upperCode === ERROR_CODES.PAYLOAD_TOO_LARGE) {
    return 'PAYLOAD_TOO_LARGE';
  }
  if (statusCode === 415 || upperCode === ERROR_CODES.UNSUPPORTED_MEDIA_TYPE) {
    return 'UNSUPPORTED_FILE';
  }
  if (
    statusCode === 429 ||
    upperCode === ERROR_CODES.RATE_LIMITED ||
    upperCode === ERROR_CODES.RATE_LIMIT_EXCEEDED ||
    upperCode === ERROR_CODES.OTP_COOLDOWN_ACTIVE
  ) {
    return 'RATE_LIMITED';
  }
  if (statusCode === 503 || upperCode === ERROR_CODES.SERVICE_UNAVAILABLE) {
    return 'SERVICE_UNAVAILABLE';
  }
  if (
    statusCode === 409 ||
    upperCode === 'CONFLICT' ||
    upperCode === ERROR_CODES.PORT_OCCUPIED ||
    upperCode === ERROR_CODES.TICKET_ALREADY_CLOSED ||
    upperCode === ERROR_CODES.ACTION_TOKEN_REPLAYED
  ) {
    return 'CONFLICT';
  }
  if (statusCode >= 500 || upperCode === ERROR_CODES.INTERNAL_ERROR) {
    return 'SERVER_ERROR';
  }
  if (statusCode === 400 || statusCode === 422 || upperCode === ERROR_CODES.VALIDATION_ERROR) {
    return 'VALIDATION';
  }

  return 'SERVER_ERROR';
}

export function isAppError(err: unknown): err is AppError {
  return Boolean(
    err &&
      typeof err === 'object' &&
      (err as Partial<AppError>).isAppError === true &&
      typeof (err as Partial<AppError>).category === 'string',
  );
}

/**
 * Normalizes any thrown error, fetch failure, or API JSON payload into a strict,
 * humane, jargon-free `AppError` with an incident reference code (`#ERR-XXXX`).
 *
 * @param rawError - Unknown caught exception or API error payload.
 * @param options - Optional HTTP status, digest, cooldown, or field errors.
 * @returns Strictly typed `AppError`.
 * @example
 * const appErr = normalizeAppError(err, { statusCode: 408 });
 */
export function normalizeAppError(rawError: unknown, options: NormalizeErrorOptions = {}): AppError {
  if (isAppError(rawError) && !options.statusCode && !options.code && !options.fallbackMessage) {
    return rawError;
  }

  const errObj =
    typeof rawError === 'object' && rawError !== null
      ? (rawError as {
          name?: unknown;
          code?: unknown;
          statusCode?: unknown;
          status?: unknown;
          message?: unknown;
          retryAfterSeconds?: unknown;
          retryAfter?: unknown;
          fieldErrors?: unknown;
          details?: unknown;
          digest?: unknown;
          error?: { code?: unknown; message?: unknown; retryAfter?: unknown; fieldErrors?: unknown };
        })
      : null;

  const isOfflineBrowser =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  const isAbortOrTimeout =
    (typeof errObj?.name === 'string' && errObj.name === 'AbortError') ||
    options.statusCode === 408 ||
    options.code === ERROR_CODES.REQUEST_TIMEOUT;

  const rawStatus =
    options.statusCode ??
    (typeof errObj?.statusCode === 'number'
      ? errObj.statusCode
      : typeof errObj?.status === 'number'
        ? errObj.status
        : isAbortOrTimeout
          ? 408
          : isOfflineBrowser
            ? 0
            : 500);

  const rawCode = String(
    options.code ??
      (isAbortOrTimeout
        ? ERROR_CODES.REQUEST_TIMEOUT
        : isOfflineBrowser && rawStatus === 0
          ? ERROR_CODES.NETWORK_OFFLINE
          : errObj?.code ?? errObj?.error?.code ?? (rawStatus === 503 ? ERROR_CODES.SERVICE_UNAVAILABLE : ERROR_CODES.INTERNAL_ERROR)),
  ).toUpperCase();

  const category = resolveCategory(rawStatus, rawCode);
  const spec = ERROR_CATEGORY_DICTIONARY[category];
  const retryAfterSeconds =
    options.retryAfterSeconds ??
    (typeof errObj?.retryAfterSeconds === 'number'
      ? errObj.retryAfterSeconds
      : typeof errObj?.retryAfter === 'number'
        ? errObj.retryAfter
        : typeof errObj?.error?.retryAfter === 'number'
          ? errObj.error.retryAfter
          : undefined);

  const fieldErrors = options.fieldErrors ?? extractFieldErrors(rawError);
  const refCode = generateErrorRefCode(
    options.digest ?? (typeof errObj?.digest === 'string' ? errObj.digest : undefined),
  );

  let message: string;
  if (category === 'OFFLINE' || category === 'TIMEOUT' || category === 'SERVICE_UNAVAILABLE') {
    message = spec.message;
  } else if (category === 'SERVER_ERROR') {
    message = spec.message;
  } else if (category === 'RATE_LIMITED') {
    message = retryAfterSeconds
      ? formatRetryCountdownMessage(retryAfterSeconds)
      : spec.message;
  } else {
    const sanitized = sanitizeUiErrorMessage(
      typeof rawError === 'string'
        ? rawError
        : {
            code: rawCode,
            message:
              typeof errObj?.message === 'string'
                ? errObj.message
                : typeof errObj?.error?.message === 'string'
                  ? errObj.error.message
                  : options.fallbackMessage,
          },
    );
    const isGenericFallback = sanitized.message === STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR;
    message = isGenericFallback ? options.fallbackMessage || spec.message : sanitized.message;
  }

  const title = ERROR_CODE_FRIENDLY_TITLES[rawCode] || spec.title;

  const appError = new Error(message) as AppError;
  Object.defineProperty(appError, 'isAppError', { value: true, enumerable: true });
  appError.name = 'AppError';
  appError.category = category;
  appError.statusCode = rawStatus;
  appError.code = rawCode;
  appError.title = title;
  appError.actionLabel = spec.actionLabel;
  appError.refCode = refCode;
  appError.retryable = spec.retryable;
  appError.retryAfterSeconds = retryAfterSeconds;
  appError.fieldErrors = fieldErrors;
  appError.details = options.details ?? errObj?.details;

  return appError;
}

/**
 * Formats bytes into human-readable Indonesian KB/MB text.
 */
export function formatFileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Validates file existence, non-zero size, max size limit (413), and extension/MIME type (415)
 * before uploading to the server, producing humane, explicit error messages.
 *
 * @param file - Browser `File` object selected or dropped by the user.
 * @param rule - Explicit size limit and accepted formats specification.
 * @returns Validation result with optional normalized `AppError`.
 * @example
 * const check = validateUploadFile(file, DATEK_UPLOAD_RULE);
 */
export function validateUploadFile(file: File | null | undefined, rule: FileValidationRule): FileValidationResult {
  if (!file) {
    return {
      valid: false,
      error: normalizeAppError('Silakan pilih berkas terlebih dahulu sebelum mengunggah.', {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
      }),
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: normalizeAppError(
        `Berkas yang dipilih kosong (0 B). Pilih berkas berisi data (${rule.formatLabel}).`,
        {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION_ERROR,
        },
      ),
    };
  }

  const lowerName = file.name.toLowerCase();
  const extAllowed = rule.allowedExtensions.some((ext) => lowerName.endsWith(ext.toLowerCase()));
  const mimeAllowed =
    !rule.allowedMimeTypes ||
    rule.allowedMimeTypes.length === 0 ||
    !file.type ||
    rule.allowedMimeTypes.includes(file.type.toLowerCase());

  if (!extAllowed || !mimeAllowed) {
    return {
      valid: false,
      error: normalizeAppError(
        `Format berkas belum didukung. Unggah format ${rule.formatLabel} (maks. ${rule.maxSizeLabel}).`,
        {
          statusCode: 415,
          code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        },
      ),
    };
  }

  if (file.size > rule.maxSizeBytes) {
    return {
      valid: false,
      error: normalizeAppError(
        `Ukuran berkas (${formatFileSizeLabel(file.size)}) melebihi batas maksimal ${rule.maxSizeLabel}.`,
        {
          statusCode: 413,
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        },
      ),
    };
  }

  return { valid: true };
}

export const DATEK_UPLOAD_RULE: FileValidationRule = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxSizeLabel: '10 MB',
  allowedExtensions: ['.xlsx', '.csv'],
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'text/plain',
    'application/octet-stream',
  ],
  formatLabel: '.xlsx atau .csv',
};

export const PHOTO_UPLOAD_RULE: FileValidationRule = {
  maxSizeBytes: 5 * 1024 * 1024,
  maxSizeLabel: '5 MB',
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  formatLabel: 'JPG, PNG, atau WEBP',
};

export const AI_ATTACHMENT_RULE: FileValidationRule = {
  maxSizeBytes: 1 * 1024 * 1024,
  maxSizeLabel: '1 MB',
  allowedExtensions: ['.csv', '.txt', '.log', '.json', '.md'],
  allowedMimeTypes: [
    'text/csv',
    'application/csv',
    'text/plain',
    'application/json',
    'text/markdown',
    'text/x-markdown',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  formatLabel: '.csv, .txt, .log, .json, atau .md',
};
