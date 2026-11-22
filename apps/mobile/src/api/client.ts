import { CURRENT_MOBILE_APP_VERSION, ERROR_CODES, ApiResponse } from '@repo/shared';
import { storeSecureToken, removeSecureToken } from '../security/deviceIntegrity';
import { setEncryptedItem, removeEncryptedItem, StorageAdapter } from '../storage/persistentStorage';

export interface MobileSessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UpgradeRequiredDetails {
  minVersion: string;
  currentVersion: string;
  downloadUrl?: string;
  message: string;
}

export type UpgradeRequiredCallback = (details: UpgradeRequiredDetails) => void;
export type SessionRevokedCallback = (reason: string) => void;
export type TokensRefreshedCallback = (tokens: MobileSessionTokens) => void;

const JWT_SCRUB_REGEX = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g;
const BEARER_SCRUB_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

function scrubSensitiveValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return val
      .replace(BEARER_SCRUB_REGEX, '[REDACTED_BEARER]')
      .replace(JWT_SCRUB_REGEX, '[REDACTED_JWT]');
  }
  if (Array.isArray(val)) {
    return val.map(scrubSensitiveValue);
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === 'userId' || k.toLowerCase() === 'authorization' || k.toLowerCase() === 'token') {
        continue;
      }
      out[k] = scrubSensitiveValue(v);
    }
    return out;
  }
  return val;
}

export class ApiClient {
  private baseUrl: string;
  private deviceId: string;
  private appVersion: string;
  private tokens: MobileSessionTokens | null = null;
  private storage?: StorageAdapter;
  private onUpgradeRequiredListener?: UpgradeRequiredCallback;
  private onSessionRevokedListener?: SessionRevokedCallback;
  private onTokensRefreshedListener?: TokensRefreshedCallback;
  private isAppLocked = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(options: {
    baseUrl?: string;
    deviceId: string;
    appVersion?: string;
    storage?: StorageAdapter;
    onUpgradeRequired?: UpgradeRequiredCallback;
    onSessionRevoked?: SessionRevokedCallback;
    onTokensRefreshed?: TokensRefreshedCallback;
  }) {
    const defaultUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://ftth-ops.lintasarta.co.id'
        : 'http://localhost:3000';
    this.baseUrl = this.validateTransportUrl(options.baseUrl || defaultUrl);
    this.deviceId = options.deviceId;
    this.appVersion = options.appVersion || CURRENT_MOBILE_APP_VERSION;
    this.storage = options.storage;
    this.onUpgradeRequiredListener = options.onUpgradeRequired;
    this.onSessionRevokedListener = options.onSessionRevoked;
    this.onTokensRefreshedListener = options.onTokensRefreshed;
  }

  private validateTransportUrl(rawUrl: string): string {
    const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('INVALID_SERVER_URL: Format URL server tidak valid.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('INVALID_SERVER_URL: Protokol URL hanya mendukung HTTPS.');
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error(
        'INSECURE_CLEARTEXT_HTTP_BLOCKED: Koneksi HTTP tanpa enkripsi TLS ditolak pada mode produksi.',
      );
    }
    return trimmed;
  }

  private isSameTrustedOrigin(targetUrl: string): boolean {
    try {
      const baseOrigin = new URL(this.baseUrl).origin;
      const targetOrigin = new URL(targetUrl, this.baseUrl).origin;
      return baseOrigin === targetOrigin;
    } catch {
      return false;
    }
  }

  private sanitizeUpgradeDownloadUrl(rawDownloadUrl: unknown): string | undefined {
    if (typeof rawDownloadUrl !== 'string' || !rawDownloadUrl.trim()) {
      return undefined;
    }
    try {
      const parsed = new URL(rawDownloadUrl.trim(), this.baseUrl);
      if (parsed.protocol !== 'https:') {
        return undefined;
      }
      const baseHost = new URL(this.baseUrl).hostname.toLowerCase();
      const targetHost = parsed.hostname.toLowerCase();
      if (targetHost !== baseHost && targetHost !== 'ftth-ops.lintasarta.co.id') {
        return undefined;
      }
      return parsed.toString();
    } catch {
      return undefined;
    }
  }

  public setTokens(tokens: MobileSessionTokens | null): void {
    this.tokens = tokens;
  }

  public getTokens(): MobileSessionTokens | null {
    return this.tokens;
  }

  public setBaseUrl(url: string): void {
    const defaultUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://ftth-ops.lintasarta.co.id'
        : 'http://localhost:3000';
    this.baseUrl = this.validateTransportUrl(url || defaultUrl);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public isLocked(): boolean {
    return this.isAppLocked;
  }

  public onUpgradeRequired(callback: UpgradeRequiredCallback): void {
    this.onUpgradeRequiredListener = callback;
  }

  public onSessionRevoked(callback: SessionRevokedCallback): void {
    this.onSessionRevokedListener = callback;
  }

  /**
   * Performs a health check against the server /api/v1/health endpoint with a 5s timeout.
   */
  public async checkHealth(customUrl?: string): Promise<{ ok: boolean; message: string; details?: unknown }> {
    let targetBase: string;
    try {
      targetBase = this.validateTransportUrl(customUrl || this.baseUrl);
    } catch (err) {
      return {
        ok: false,
        message: (err as Error).message,
      };
    }
    const healthUrl = `${targetBase}/api/v1/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Device-ID': this.deviceId,
          'X-App-Version': this.appVersion,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;

      if (res.ok && (data.status === 'ok' || data.success === true || res.status === 200)) {
        const systemName = data.system || 'FiberOps On-Premise';
        return {
          ok: true,
          message: `Terhubung: ${systemName}`,
          details: data,
        };
      }

      return {
        ok: false,
        message: data.message || `Server merespons status ${res.status}`,
        details: data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === 'AbortError';
      return {
        ok: false,
        message: isTimeout ? 'Koneksi timeout (5s) ke server' : (err?.message || 'Gagal terhubung ke server'),
        details: err,
      };
    }
  }

  /**
   * Uploads multipart form data omitting the Content-Type header so the boundary is auto-generated.
   */
  public async uploadMultipart<T = unknown>(
    endpoint: string,
    formData: FormData,
    customHeaders: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    if (this.isAppLocked) {
      throw new Error(
        `${ERROR_CODES.UPGRADE_REQUIRED}: Aplikasi terkunci karena versi sudah usang. Harap perbarui aplikasi terlebih dahulu.`,
      );
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (process.env.NODE_ENV === 'production' && url.startsWith('http://')) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'INSECURE_CLEARTEXT_HTTP_BLOCKED: Protokol HTTP tidak diizinkan pada mode produksi.',
        },
      };
    }

    const headers: Record<string, string> = {
      'X-Device-ID': this.deviceId,
      'X-App-Version': this.appVersion,
      ...customHeaders,
    };

    const isSameOrigin = this.isSameTrustedOrigin(url);
    if (this.tokens?.accessToken && isSameOrigin) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.status === 426) {
        this.isAppLocked = true;
        const errorJson = (await response.json().catch(() => ({}))) as Record<string, any>;
        const upgradeDetails: UpgradeRequiredDetails = {
          minVersion: (errorJson.meta?.minVersion as string) || '1.0.0',
          currentVersion: this.appVersion,
          downloadUrl: this.sanitizeUpgradeDownloadUrl(errorJson.meta?.downloadUrl),
          message: errorJson.error?.message || 'Versi aplikasi mobile Anda sudah usang.',
        };
        if (this.onUpgradeRequiredListener) {
          this.onUpgradeRequiredListener(upgradeDetails);
        }
        return {
          success: false,
          error: {
            code: ERROR_CODES.UPGRADE_REQUIRED,
            message: upgradeDetails.message,
            details: upgradeDetails,
          },
        };
      }

      if (response.status === 401) {
        const errorJson = (await response
          .clone()
          .json()
          .catch(() => ({}))) as Record<string, any>;
        const errorCode = errorJson.error?.code;

        if (
          errorCode === ERROR_CODES.SESSION_REVOKED ||
          errorCode === ERROR_CODES.TOKEN_REUSE_DETECTED
        ) {
          this.tokens = null;
          void removeSecureToken('auth_tokens');
          void removeEncryptedItem('auth_tokens');
          if (this.onSessionRevokedListener) {
            this.onSessionRevokedListener(
              errorJson.error?.message ||
                'Sesi perangkat telah dicabut oleh Administrator (Force Logout).',
            );
          }
          return {
            success: false,
            error: {
              code: errorCode,
              message: errorJson.error?.message || 'Sesi dicabut.',
            },
          };
        }

        if (this.tokens?.refreshToken && isSameOrigin) {
          const refreshSuccess = await this.rotateRefreshToken();
          if (refreshSuccess && this.tokens?.accessToken) {
            headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
            const retryRes = await fetch(url, {
              method: 'POST',
              headers,
              body: formData,
            });
            return (await retryRes.json()) as ApiResponse<T>;
          }
        }
      }

      return (await response.json()) as ApiResponse<T>;
    } catch (err) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: (err as Error).message || 'Gagal mengunggah berkas multipart',
        },
      };
    }
  }

  /**
   * Executes HTTP request with automated authorization, device binding, and app version headers.
   * Handles SILENT_TOKEN_REFRESH, UPGRADE_REQUIRED (426), and SESSION_REVOKED (401).
   */
  public async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    customHeaders: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    // 1. App Version Gate Lock Guard
    if (this.isAppLocked) {
      throw new Error(
        `${ERROR_CODES.UPGRADE_REQUIRED}: Aplikasi terkunci karena versi sudah usang. Harap perbarui aplikasi terlebih dahulu.`,
      );
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (process.env.NODE_ENV === 'production' && url.startsWith('http://')) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'INSECURE_CLEARTEXT_HTTP_BLOCKED: Protokol HTTP tidak diizinkan pada mode produksi.',
        },
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-ID': this.deviceId,
      'X-App-Version': this.appVersion,
      ...customHeaders,
      ...((options.headers as Record<string, string>) || {}),
    };

    const isSameOrigin = this.isSameTrustedOrigin(url);
    if (this.tokens?.accessToken && isSameOrigin) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    let requestOptions: RequestInit = {
      ...options,
      headers,
    };

    if (endpoint.includes('/api/v1/tech/error-logs') && typeof options.body === 'string') {
      try {
        const parsedBody = JSON.parse(options.body) as unknown;
        const scrubbedBody = scrubSensitiveValue(parsedBody);
        requestOptions = {
          ...requestOptions,
          body: JSON.stringify(scrubbedBody),
        };
      } catch {
        requestOptions = {
          ...requestOptions,
          body: String(scrubSensitiveValue(options.body)),
        };
      }
    }

    try {
      const response = await fetch(url, requestOptions);

      // 2. HTTP 426 Upgrade Required (Law 4 & App Version Gate)
      if (response.status === 426) {
        this.isAppLocked = true;
        const errorJson = (await response.json().catch(() => ({}))) as Record<string, any>;

        const upgradeDetails: UpgradeRequiredDetails = {
          minVersion: (errorJson.meta?.minVersion as string) || '1.0.0',
          currentVersion: this.appVersion,
          downloadUrl: this.sanitizeUpgradeDownloadUrl(errorJson.meta?.downloadUrl),
          message:
            errorJson.error?.message ||
            'Versi aplikasi mobile Anda sudah usang dan wajib diperbarui sebelum melanjutkan pekerjaan.',
        };

        if (this.onUpgradeRequiredListener) {
          this.onUpgradeRequiredListener(upgradeDetails);
        }

        return {
          success: false,
          error: {
            code: ERROR_CODES.UPGRADE_REQUIRED,
            message: upgradeDetails.message,
            details: upgradeDetails,
          },
        };
      }

      // 3. Handle 401 Session Revocation or Token Expiry
      if (response.status === 401) {
        const errorJson = (await response
          .clone()
          .json()
          .catch(() => ({}))) as Record<string, any>;
        const errorCode = errorJson.error?.code;

        // Force Logout check
        if (
          errorCode === ERROR_CODES.SESSION_REVOKED ||
          errorCode === ERROR_CODES.TOKEN_REUSE_DETECTED
        ) {
          this.tokens = null;
          void removeSecureToken('auth_tokens');
          void removeEncryptedItem('auth_tokens');
          if (this.onSessionRevokedListener) {
            this.onSessionRevokedListener(
              errorJson.error?.message ||
                'Sesi perangkat telah dicabut oleh Administrator (Force Logout).',
            );
          }
          return {
            success: false,
            error: {
              code: errorCode,
              message: errorJson.error?.message || 'Sesi dicabut.',
            },
          };
        }

        // SILENT_TOKEN_REFRESH: Automatic background refresh for TOKEN_EXPIRED
        if (this.tokens?.refreshToken && isSameOrigin) {
          const refreshSuccess = await this.rotateRefreshToken();
          if (refreshSuccess && this.tokens.accessToken) {
            // Transparently retry original request with rotated token
            headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
            const retryRes = await fetch(url, { ...requestOptions, headers });
            return (await retryRes.json()) as ApiResponse<T>;
          }
        }
      }

      return (await response.json()) as ApiResponse<T>;
    } catch (err) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: (err as Error).message || 'Koneksi jaringan gagal',
        },
      };
    }
  }

  /**
   * Rotates mobile technician short-lived access token using long-lived refresh token.
   * Debounces parallel refresh calls via shared Promise.
   */
  private async rotateRefreshToken(): Promise<boolean> {
    if (!this.tokens?.refreshToken) return false;

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': this.deviceId,
            'X-App-Version': this.appVersion,
          },
          body: JSON.stringify({
            refreshToken: this.tokens!.refreshToken,
            deviceId: this.deviceId,
          }),
        });

        const json = (await res.json().catch(() => ({}))) as Record<string, any>;

        if (!res.ok) {
          this.tokens = null;
          if (json.error?.code === ERROR_CODES.SESSION_REVOKED && this.onSessionRevokedListener) {
            this.onSessionRevokedListener(
              json.error?.message ||
                'Sesi perangkat telah dicabut oleh Administrator (Force Logout).',
            );
          }
          return false;
        }

        if (json.success && json.data?.accessToken) {
          const updatedTokens: MobileSessionTokens = {
            accessToken: json.data.accessToken,
            refreshToken: json.data.refreshToken || this.tokens!.refreshToken,
          };
          this.tokens = updatedTokens;
          try {
            await setEncryptedItem('auth_tokens', updatedTokens);
            if (this.storage) {
              await this.storage.setItem(
                'auth_tokens',
                await (await import('../security/deviceIntegrity')).encryptData(
                  JSON.stringify(updatedTokens),
                ),
              );
            }
          } catch {
            // Ignore storage persistence failure in headless test environments
          }
          try {
            await storeSecureToken('auth_tokens', JSON.stringify(updatedTokens));
          } catch {
            // Ignore hardware keystore unavailability in non-production environments
          }
          this.onTokensRefreshedListener?.(updatedTokens);
          return true;
        }

        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Sends scrubbed client error telemetry without leaking JWTs, Bearer headers, or userId.
   */
  public async reportErrorLog(payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const scrubbed = scrubSensitiveValue(payload);
    return this.request('/api/v1/tech/error-logs', {
      method: 'POST',
      body: JSON.stringify(scrubbed),
    });
  }
}
