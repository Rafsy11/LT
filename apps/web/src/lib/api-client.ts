import {
  ERROR_CODES,
  STANDARD_ERROR_MESSAGES,
  ApiResponse,
} from '@repo/shared';
import { clearServiceUnavailable, reportServiceUnavailable } from '@/lib/api-error';
import {
  normalizeAppError,
  parseRetryAfterSeconds,
  extractFieldErrors,
  type AppError,
} from '@/lib/error-normalizer';
import { ERROR_CATEGORY_DICTIONARY } from '@/lib/error-dictionary';
import { clearQueryCache } from '@/lib/query-cache';

export type ApiClientError = AppError;

export interface RequestOptions extends RequestInit {
  onConflict?: () => void | Promise<void>;
  skipAuthRedirect?: boolean;
  /** Request timeout in milliseconds using AbortSignal.timeout(). Defaults to 15000ms. */
  timeoutMs?: number;
  /** Optional Fetch Priority hint ('high' | 'low' | 'auto') for progressive enhancement. */
  priority?: 'high' | 'low' | 'auto';
}

const DEFAULT_TIMEOUT_MS = 15_000;

class WebApiClient {
  private isRedirecting = false;

  /**
   * Centralized HTTP fetch wrapper with strict TypeScript `AppError` normalization:
   * - Offline detection (`navigator.onLine === false`) -> OFFLINE
   * - Request Timeout (`AbortController`) -> 408 TIMEOUT
   * - 401 Unauthorized -> Clears local session and redirects to `/login?next=<path+search>`
   * - 403 Forbidden -> Throws FORBIDDEN without logging the user out
   * - 409 Conflict -> Triggers `onConflict` refetch callback
   * - 413 Payload Too Large / 415 Unsupported File -> Explicit file limit/format guidance
   * - 429 Too Many Requests -> Extracts `Retry-After` cooldown seconds
   * - 503 Service Unavailable -> Emits maintenance/overload state to persistent ToastNotification
   * - 5xx Server Error -> Masks internals and attaches `Ref: #ERR-XXXX`
   */
  public async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const {
      onConflict,
      skipAuthRedirect = false,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      priority,
      signal: externalSignal,
      ...fetchOptions
    } = options;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw normalizeAppError(null, {
        statusCode: 0,
        code: ERROR_CODES.NETWORK_OFFLINE,
      });
    }

    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
    let fallbackController: AbortController | null = null;
    let fallbackTimedOut = false;
    let handleExternalAbort: (() => void) | null = null;
    let handleTimeoutAbort: (() => void) | null = null;
    let signal: AbortSignal | undefined;

    if (externalSignal && timeoutSignal) {
      if (typeof AbortSignal.any === 'function') {
        signal = AbortSignal.any([externalSignal, timeoutSignal]);
      } else {
        fallbackController = new AbortController();
        handleExternalAbort = () => fallbackController?.abort(externalSignal.reason);
        handleTimeoutAbort = () => {
          fallbackTimedOut = true;
          fallbackController?.abort(timeoutSignal.reason);
        };
        if (externalSignal.aborted) {
          handleExternalAbort();
        } else {
          externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
        }
        if (timeoutSignal.aborted) {
          handleTimeoutAbort();
        } else {
          timeoutSignal.addEventListener('abort', handleTimeoutAbort, { once: true });
        }
        signal = fallbackController.signal;
      }
    } else {
      signal = timeoutSignal ?? externalSignal ?? undefined;
    }

    const requestInit: RequestInit & { priority?: 'high' | 'low' | 'auto' } = {
      ...fetchOptions,
      credentials: fetchOptions.credentials ?? 'include',
      headers,
      signal,
    };
    if (priority) {
      requestInit.priority = priority;
    }

    try {
      const response = await fetch(endpoint, requestInit);

      const retryAfterHeader = response.headers.get('Retry-After');

      let json: ApiResponse<T>;
      try {
        json = (await response.json()) as ApiResponse<T>;
      } catch {
        json = {
          success: false,
          error: {
            code: response.ok ? 'SUCCESS' : ERROR_CODES.INTERNAL_ERROR,
            message: response.ok ? 'OK' : STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
          },
        };
      }

      const errPayload = !json.success ? json.error : undefined;
      const fieldErrors = extractFieldErrors(json);

      // 1. HTTP 401 Unauthorized Interceptor
      if (response.status === 401) {
        clearQueryCache();
        if (typeof window !== 'undefined' && !skipAuthRedirect && !this.isRedirecting) {
          this.isRedirecting = true;
          try {
            localStorage.removeItem('fiberops_user');
            localStorage.removeItem('fiberops_auth_user');
            localStorage.removeItem('fiberops_access_token');
            sessionStorage.clear();
            document.cookie = 'fiberops_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          } catch {
            // Storage access safeguard
          }

          const currentPath = `${window.location.pathname}${window.location.search}`;
          if (window.location.pathname !== '/login') {
            window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
          } else {
            this.isRedirecting = false;
          }

          globalThis.setTimeout(() => {
            this.isRedirecting = false;
          }, 4000);
        }

        throw normalizeAppError(errPayload, {
          statusCode: 401,
          code: errPayload?.code || ERROR_CODES.UNAUTHORIZED,
        });
      }

      // 2. HTTP 403 Forbidden Interceptor (Never log out; surface access restriction)
      if (response.status === 403) {
        throw normalizeAppError(errPayload, {
          statusCode: 403,
          code: errPayload?.code || ERROR_CODES.FORBIDDEN,
          details: errPayload?.details,
        });
      }

      // 3. HTTP 408 Request Timeout from Gateway/Server
      if (response.status === 408 || response.status === 504) {
        throw normalizeAppError(errPayload, {
          statusCode: 408,
          code: ERROR_CODES.REQUEST_TIMEOUT,
        });
      }

      // 4. HTTP 409 Conflict Interceptor
      if (response.status === 409) {
        if (typeof onConflict === 'function') {
          try {
            await onConflict();
          } catch (refetchErr) {
            console.warn('[WebApiClient] onConflict refetch callback failed:', refetchErr);
          }
        }

        throw normalizeAppError(errPayload, {
          statusCode: 409,
          code: errPayload?.code || 'CONFLICT',
          fallbackMessage: ERROR_CATEGORY_DICTIONARY.CONFLICT.message,
          details: errPayload?.details,
        });
      }

      // 5. HTTP 413 Payload Too Large & 415 Unsupported Media Type
      if (response.status === 413) {
        throw normalizeAppError(errPayload, {
          statusCode: 413,
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
          fallbackMessage: ERROR_CATEGORY_DICTIONARY.PAYLOAD_TOO_LARGE.message,
        });
      }

      if (response.status === 415) {
        throw normalizeAppError(errPayload, {
          statusCode: 415,
          code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          fallbackMessage: ERROR_CATEGORY_DICTIONARY.UNSUPPORTED_FILE.message,
        });
      }

      // 6. HTTP 429 Too Many Requests Interceptor
      if (response.status === 429) {
        const rawJsonMeta = json as { meta?: { retryAfterMs?: number }; error?: { retryAfter?: number } };
        const payloadRetry =
          typeof rawJsonMeta.error?.retryAfter === 'number' && rawJsonMeta.error.retryAfter > 0
            ? rawJsonMeta.error.retryAfter
            : typeof rawJsonMeta.meta?.retryAfterMs === 'number' && rawJsonMeta.meta.retryAfterMs > 0
              ? Math.ceil(rawJsonMeta.meta.retryAfterMs / 1000)
              : undefined;
        const retryAfterSeconds = payloadRetry ?? parseRetryAfterSeconds(retryAfterHeader, 60);

        throw normalizeAppError(errPayload, {
          statusCode: 429,
          code: errPayload?.code || ERROR_CODES.RATE_LIMIT_EXCEEDED,
          retryAfterSeconds,
        });
      }

      // 7. HTTP 503 Service Unavailable Interceptor
      if (response.status === 503 || errPayload?.code === ERROR_CODES.SERVICE_UNAVAILABLE) {
        const maintenanceMessage = ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.message;
        const category = endpoint.includes('/admin/ai/') ? 'service' : 'database';
        reportServiceUnavailable(maintenanceMessage, category, endpoint);

        throw normalizeAppError(errPayload, {
          statusCode: 503,
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          fallbackMessage: maintenanceMessage,
          details: errPayload?.details,
        });
      }

      if (!response.ok) {
        throw normalizeAppError(errPayload, {
          statusCode: response.status,
          code: response.status >= 500 ? ERROR_CODES.INTERNAL_ERROR : errPayload?.code,
          fieldErrors,
          details: errPayload?.details,
        });
      }

      if (!endpoint.includes('/admin/ai/')) {
        clearServiceUnavailable('database');
      }
      return json;
    } catch (err: unknown) {
      const isTimeoutError =
        fallbackTimedOut ||
        (err instanceof DOMException && err.name === 'TimeoutError') ||
        (err instanceof Error && err.name === 'TimeoutError');

      if (isTimeoutError) {
        throw normalizeAppError(err, {
          statusCode: 408,
          code: ERROR_CODES.REQUEST_TIMEOUT,
        });
      }

      if (err && typeof err === 'object' && (err as Partial<AppError>).isAppError) {
        throw err;
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw normalizeAppError(err, {
          statusCode: 0,
          code: ERROR_CODES.NETWORK_OFFLINE,
        });
      }

      const method = (fetchOptions.method || 'GET').toUpperCase();
      throw normalizeAppError(err, {
        statusCode: 0,
        code: 'NETWORK_ERROR',
        fallbackMessage:
          method === 'GET'
            ? STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED
            : STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      });
    } finally {
      if (externalSignal && handleExternalAbort) {
        externalSignal.removeEventListener('abort', handleExternalAbort);
      }
      if (timeoutSignal && handleTimeoutAbort) {
        timeoutSignal.removeEventListener('abort', handleTimeoutAbort);
      }
    }
  }

  public get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const webApiClient = new WebApiClient();
