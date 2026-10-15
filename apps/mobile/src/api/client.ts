import {
  CURRENT_MOBILE_APP_VERSION,
  ERROR_CODES,
  ApiResponse,
} from '@repo/shared';

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

export class ApiClient {
  private baseUrl: string;
  private deviceId: string;
  private appVersion: string;
  private tokens: MobileSessionTokens | null = null;
  private onUpgradeRequiredListener?: UpgradeRequiredCallback;
  private isAppLocked = false;

  constructor(options: {
    baseUrl?: string;
    deviceId: string;
    appVersion?: string;
    onUpgradeRequired?: UpgradeRequiredCallback;
  }) {
    this.baseUrl = (options.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    this.deviceId = options.deviceId;
    this.appVersion = options.appVersion || CURRENT_MOBILE_APP_VERSION;
    this.onUpgradeRequiredListener = options.onUpgradeRequired;
  }

  public setTokens(tokens: MobileSessionTokens | null): void {
    this.tokens = tokens;
  }

  public getTokens(): MobileSessionTokens | null {
    return this.tokens;
  }

  public isLocked(): boolean {
    return this.isAppLocked;
  }

  public onUpgradeRequired(callback: UpgradeRequiredCallback): void {
    this.onUpgradeRequiredListener = callback;
  }

  /**
   * Executes HTTP request with automated authorization, device binding, and app version headers.
   */
  public async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    customHeaders: Record<string, string> = {}
  ): Promise<ApiResponse<T>> {
    // 1. App Version Gate Lock Guard
    if (this.isAppLocked) {
      throw new Error(
        `${ERROR_CODES.UPGRADE_REQUIRED}: Aplikasi terkunci karena versi sudah usang. Harap perbarui aplikasi terlebih dahulu.`
      );
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-ID': this.deviceId,
      'X-App-Version': this.appVersion,
      ...customHeaders,
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // 2. HTTP 426 Upgrade Required (Law 4 & AGENT.md Section 4)
      if (response.status === 426) {
        this.isAppLocked = true;
        const errorJson = (await response.json().catch(() => ({}))) as Record<string, any>;

        const upgradeDetails: UpgradeRequiredDetails = {
          minVersion: (errorJson.meta?.minVersion as string) || '1.0.0',
          currentVersion: this.appVersion,
          downloadUrl: (errorJson.meta?.downloadUrl as string) || undefined,
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

      // 3. Handle Token Expiry & Automatic Refresh Rotation
      if (response.status === 401 && this.tokens?.refreshToken) {
        const refreshSuccess = await this.rotateRefreshToken();
        if (refreshSuccess) {
          // Retry original request once with renewed token
          headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
          const retryRes = await fetch(url, { ...options, headers });
          return (await retryRes.json()) as ApiResponse<T>;
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
   */
  private async rotateRefreshToken(): Promise<boolean> {
    if (!this.tokens?.refreshToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': this.deviceId,
          'X-App-Version': this.appVersion,
        },
        body: JSON.stringify({
          refreshToken: this.tokens.refreshToken,
          deviceId: this.deviceId,
        }),
      });

      if (!res.ok) {
        this.tokens = null;
        return false;
      }

      const json = (await res.json()) as ApiResponse<{ accessToken: string }>;
      if (json.success && json.data.accessToken) {
        this.tokens.accessToken = json.data.accessToken;
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }
}
