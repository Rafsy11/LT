import {
  ERROR_CODES,
  STANDARD_ERROR_MESSAGES,
  ApiResponse,
  sanitizeUiErrorMessage,
} from '@repo/shared';
import { clearServiceUnavailable, reportServiceUnavailable } from '@/lib/api-error';

export interface ApiClientError extends Error {
  code: string;
  statusCode: number;
  retryAfterSeconds?: number;
  details?: unknown;
}

export interface RequestOptions extends RequestInit {
  onConflict?: () => void | Promise<void>;
  skipAuthRedirect?: boolean;
}

class WebApiClient {
  private isRedirecting = false;

  /**
   * Centralized HTTP fetch wrapper with response state interceptors:
   * - 401 Unauthorized: Clears local session and redirects to /login.
   * - 403 Forbidden: Returns user-friendly message without leaking Prisma/system traces.
   * - 409 Conflict: Triggers refetch callback and provides clear conflict explanation.
   * - 429 Too Many Requests: Extracts Retry-After and informs user about cooldown.
   */
  public async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const { onConflict, skipAuthRedirect = false, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      const response = await fetch(endpoint, {
        ...fetchOptions,
        headers,
      });

      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

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

      // 1. HTTP 401 Unauthorized Interceptor
      if (response.status === 401) {
        if (typeof window !== 'undefined' && !skipAuthRedirect && !this.isRedirecting) {
          this.isRedirecting = true;
          // Clear any client stored session
          try {
            localStorage.removeItem('fiberops_user');
            localStorage.removeItem('fiberops_auth_user');
            localStorage.removeItem('fiberops_access_token');
            sessionStorage.clear();
            document.cookie = 'fiberops_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          } catch {
            // Storage access error safeguard
          }

          const currentPath = window.location.pathname;
          if (currentPath !== '/login') {
            window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
          }
        }

        const sanitized401 = sanitizeUiErrorMessage({
          code: errPayload?.code || ERROR_CODES.UNAUTHORIZED,
          message: errPayload?.message,
        });
        const err: ApiClientError = new Error(sanitized401.message) as ApiClientError;
        err.code = errPayload?.code || ERROR_CODES.UNAUTHORIZED;
        err.statusCode = 401;
        throw err;
      }

      // 2. HTTP 403 Forbidden Interceptor (Anti-Information Leakage)
      if (response.status === 403) {
        const sanitized = sanitizeUiErrorMessage({
          code: errPayload?.code || ERROR_CODES.FORBIDDEN,
          message: errPayload?.message,
        });
        const err: ApiClientError = new Error(sanitized.message) as ApiClientError;
        err.code = errPayload?.code || ERROR_CODES.FORBIDDEN;
        err.statusCode = 403;
        err.details = errPayload?.details;
        throw err;
      }

      // 3. HTTP 409 Conflict Interceptor (Port Occupied / Ticket Closed / Action Token Replayed)
      if (response.status === 409) {
        if (typeof onConflict === 'function') {
          try {
            await onConflict();
          } catch (refetchErr) {
            console.warn('[WebApiClient] onConflict refetch callback failed:', refetchErr);
          }
        }

        const sanitized409 = sanitizeUiErrorMessage({
          code: errPayload?.code,
          message:
            errPayload?.message ||
            'Konflik mutasi: Data telah berubah di server. Halaman telah diperbarui.',
        });
        const err: ApiClientError = new Error(sanitized409.message) as ApiClientError;
        err.code = errPayload?.code || 'CONFLICT';
        err.statusCode = 409;
        err.details = errPayload?.details;
        throw err;
      }

      // 4. HTTP 429 Too Many Requests Interceptor (Rate Limit Cooldown)
      if (response.status === 429) {
        const cooldownMsg = retryAfterSeconds
          ? `Terlalu banyak permintaan. Silakan tunggu ${retryAfterSeconds} detik sebelum mencoba lagi.`
          : sanitizeUiErrorMessage({
              code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
              message: errPayload?.message,
            }).message;

        const err: ApiClientError = new Error(cooldownMsg) as ApiClientError;
        err.code = ERROR_CODES.RATE_LIMIT_EXCEEDED;
        err.statusCode = 429;
        err.retryAfterSeconds = retryAfterSeconds;
        throw err;
      }

      // 5. HTTP 503 Service Unavailable Interceptor (Strict Live Mode Fail-Fast)
      if (response.status === 503 || errPayload?.code === ERROR_CODES.SERVICE_UNAVAILABLE) {
        const sanitizedUnavailable = sanitizeUiErrorMessage({
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
        });
        const category = endpoint.includes('/admin/ai/') ? 'service' : 'database';
        reportServiceUnavailable(sanitizedUnavailable.message, category, endpoint);

        const err: ApiClientError = new Error(sanitizedUnavailable.message) as ApiClientError;
        err.code = ERROR_CODES.SERVICE_UNAVAILABLE;
        err.statusCode = 503;
        err.details = errPayload?.details;
        throw err;
      }

      if (!response.ok) {
        const isServerError = response.status >= 500;
        const sanitized = sanitizeUiErrorMessage(
          isServerError
            ? { code: ERROR_CODES.INTERNAL_ERROR }
            : {
                code: errPayload?.code,
                message: errPayload?.message || STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
              },
        );
        const err: ApiClientError = new Error(sanitized.message) as ApiClientError;
        err.code = isServerError
          ? ERROR_CODES.INTERNAL_ERROR
          : errPayload?.code || sanitized.code || 'HTTP_ERROR';
        err.statusCode = response.status;
        err.details = errPayload?.details;
        throw err;
      }

      if (!endpoint.includes('/admin/ai/')) {
        clearServiceUnavailable('database');
      }
      return json;
    } catch (err: unknown) {
      if ((err as ApiClientError).statusCode) {
        throw err;
      }

      const method = (fetchOptions.method || 'GET').toUpperCase();
      const safeNet = sanitizeUiErrorMessage(err);
      const networkMsg =
        safeNet.code === ERROR_CODES.INTERNAL_ERROR &&
        safeNet.message === STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR
          ? method === 'GET'
            ? STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED
            : STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR
          : safeNet.message;
      const networkErr: ApiClientError = new Error(networkMsg) as ApiClientError;
      networkErr.code = 'NETWORK_ERROR';
      networkErr.statusCode = 0;
      throw networkErr;
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
