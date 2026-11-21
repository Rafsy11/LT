import React, { useState, useEffect, useRef } from 'react';
import { ApiClient, MobileSessionTokens } from '../api/client';
import {
  CURRENT_MOBILE_APP_VERSION,
  ERROR_CODES,
  OTP_CONFIG,
  UserProfile,
  STANDARD_ERROR_MESSAGES,
  sanitizeUiErrorMessage,
} from '@repo/shared';
import { persistentStorage } from '../storage/persistentStorage';
import { getThemeTokens } from '../theme/tokens';
import { ErrorBanner } from '../components/ErrorBanner';

export const SERVER_URL_STORAGE_KEY = '@fiberops_server_url_v1';

export interface LoginScreenProps {
  apiClient: ApiClient;
  onLoginSuccess: (user: UserProfile, tokens: MobileSessionTokens) => void;
  defaultDeviceId?: string;
  sessionRevokedReason?: string | null;
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
}

interface MobileOtpChallengeResponse {
  requiresTwoFactor?: boolean;
  preAuthToken: string;
  expiresIn?: number;
  resendCooldown?: number;
  deliveryStatus?: 'SENT' | 'PENDING_BOT_START';
  maskedChatId?: string | null;
  botUsername?: string;
  user?: { nik?: string | null };
}

interface MobileVerifiedSessionResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function EyeIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function UserIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ShieldIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SendIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function ClockIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CloseIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function LoginScreen({
  apiClient,
  onLoginSuccess,
  defaultDeviceId = 'DEVICE-TECH-SM-A54',
  sessionRevokedReason = null,
  themeMode = 'light',
}: LoginScreenProps) {
  const [username, setUsernameState] = useState('');
  const [password, setPasswordState] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2FA Telegram OTP states (parity with web LoginView / useLogin)
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [otpCode, setOtpCodeState] = useState('');
  const [otpExpiresSeconds, setOtpExpiresSeconds] = useState(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [deliveryStatus, setDeliveryStatus] = useState<'IDLE' | 'SENT'>('IDLE');
  const [maskedChatId, setMaskedChatId] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState('FiberOpsNOCBot');
  const [userNik, setUserNik] = useState<string | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);

  const [deviceId] = useState(defaultDeviceId);
  const [deviceModel] = useState('Samsung Galaxy A54 5G');
  const [serverUrl, setServerUrl] = useState(apiClient.getBaseUrl() || 'http://localhost:3000');
  const [healthStatus, setHealthStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [healthMessage, setHealthMessage] = useState<string>('Belum diuji');
  const [showServerModal, setShowServerModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<'username' | 'password' | 'otp' | null>(null);

  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const theme = getThemeTokens(themeMode);
  const isDark = themeMode === 'dark';
  const isLocked = isLoading || rateLimitSeconds > 0;

  useEffect(() => {
    let isMounted = true;
    persistentStorage.getItem(SERVER_URL_STORAGE_KEY).then((saved) => {
      if (saved && isMounted) {
        setServerUrl(saved);
        apiClient.setBaseUrl(saved);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [apiClient]);

  // 5-minute OTP challenge expiry countdown
  useEffect(() => {
    if (otpExpiresSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setOtpExpiresSeconds((prev) => {
        if (prev <= 1) {
          setPreAuthToken(null);
          setDeliveryStatus('IDLE');
          setErrorMessage('Masa berlaku kode OTP habis. Pilih Kirim OTP untuk kode baru.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpExpiresSeconds]);

  // 60-second resend OTP cooldown countdown
  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldownSeconds]);

  // Rate limit countdown (HTTP 429)
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRateLimitSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rateLimitSeconds]);

  const setUsername = (val: string) => {
    setUsernameState(val);
    setPreAuthToken(null);
    setDeliveryStatus('IDLE');
    setOtpExpiresSeconds(0);
  };

  const setPassword = (val: string) => {
    setPasswordState(val);
    setPreAuthToken(null);
    setDeliveryStatus('IDLE');
    setOtpExpiresSeconds(0);
  };

  const setOtpCode = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, OTP_CONFIG.CODE_LENGTH);
    setOtpCodeState(digitsOnly);
  };

  const applyAuthApiError = (
    error?: { code?: string; message?: string; retryAfter?: number },
    meta?: Record<string, unknown>,
    options: { isResend?: boolean } = {},
  ) => {
    const code = error?.code?.toUpperCase() || '';
    const msg = error?.message || '';
    const retrySec =
      typeof error?.retryAfter === 'number' && error.retryAfter > 0
        ? Math.ceil(error.retryAfter)
        : typeof meta?.retryAfter === 'number' && meta.retryAfter > 0
          ? Math.ceil(meta.retryAfter)
          : 0;

    if (code === ERROR_CODES.OTP_COOLDOWN_ACTIVE || (code === ERROR_CODES.RATE_LIMIT_EXCEEDED && options.isResend)) {
      setResendCooldownSeconds(retrySec || OTP_CONFIG.RESEND_COOLDOWN_SECONDS);
    } else if (code === ERROR_CODES.RATE_LIMIT_EXCEEDED || code === ERROR_CODES.RATE_LIMITED) {
      setRateLimitSeconds(retrySec || 60);
    }

    if (code === ERROR_CODES.OTP_MAX_ATTEMPTS || code === ERROR_CODES.OTP_EXPIRED) {
      setPreAuthToken(null);
      setOtpCodeState('');
      setDeliveryStatus('IDLE');
      setOtpExpiresSeconds(0);
    }

    if (
      code === ERROR_CODES.INVALID_CREDENTIALS ||
      code === ERROR_CODES.UNAUTHORIZED ||
      msg.toLowerCase().includes('kredensial') ||
      msg.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('username')
    ) {
      setErrorMessage(STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    if (code === ERROR_CODES.INTERNAL_ERROR || code === ERROR_CODES.SERVICE_UNAVAILABLE) {
      setErrorMessage(STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR);
      return;
    }

    if (code === ERROR_CODES.OTP_INVALID && msg && msg.length < 120) {
      setErrorMessage(msg);
      return;
    }

    const sanitized = sanitizeUiErrorMessage(error);
    setErrorMessage(sanitized.message);
  };

  const handleTestConnection = async () => {
    try {
      setHealthStatus('TESTING');
      setHealthMessage('Menguji koneksi server...');
      const cleanUrl = serverUrl.trim();
      const res = await apiClient.checkHealth(cleanUrl);
      if (res.ok) {
        setHealthStatus('SUCCESS');
        setHealthMessage(res.message);
        apiClient.setBaseUrl(cleanUrl);
        await persistentStorage.setItem(SERVER_URL_STORAGE_KEY, cleanUrl);
      } else {
        setHealthStatus('ERROR');
        setHealthMessage(res.message);
      }
    } catch (err: unknown) {
      setHealthStatus('ERROR');
      const errObj = err as Error;
      setHealthMessage(errObj?.message || 'Gagal terhubung ke server');
    }
  };

  const handleRequestOtp = async () => {
    if (isRequestingOtp || isLocked || resendCooldownSeconds > 0) return;

    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib diisi.');
      return;
    }

    try {
      setIsRequestingOtp(true);
      setErrorMessage(null);

      const cleanUrl = serverUrl.trim();
      apiClient.setBaseUrl(cleanUrl);
      await persistentStorage.setItem(SERVER_URL_STORAGE_KEY, cleanUrl);

      if (preAuthToken) {
        const res = await apiClient.request<MobileOtpChallengeResponse>('/api/v1/auth/resend-otp', {
          method: 'POST',
          body: JSON.stringify({ preAuthToken }),
        });

        if (!res.success) {
          applyAuthApiError(res.error, res.meta, { isResend: true });
          return;
        }

        setPreAuthToken(res.data.preAuthToken);
        setOtpExpiresSeconds(res.data.expiresIn || OTP_CONFIG.EXPIRY_SECONDS);
        setResendCooldownSeconds(res.data.resendCooldown ?? OTP_CONFIG.RESEND_COOLDOWN_SECONDS);
        setDeliveryStatus('SENT');
        setMaskedChatId(res.data.maskedChatId || null);
        setBotUsername(res.data.botUsername || 'FiberOpsNOCBot');
        window.setTimeout(() => otpInputRef.current?.focus(), 40);
        return;
      }

      const res = await apiClient.request<MobileOtpChallengeResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          password,
          deviceId: deviceId.trim(),
          deviceModel: deviceModel.trim(),
          appVersion: CURRENT_MOBILE_APP_VERSION,
        }),
      });

      if (!res.success) {
        applyAuthApiError(res.error, res.meta, { isResend: false });
        return;
      }

      setPreAuthToken(res.data.preAuthToken);
      setOtpExpiresSeconds(res.data.expiresIn || OTP_CONFIG.EXPIRY_SECONDS);
      setResendCooldownSeconds(res.data.resendCooldown ?? OTP_CONFIG.RESEND_COOLDOWN_SECONDS);
      setDeliveryStatus('SENT');
      setMaskedChatId(res.data.maskedChatId || null);
      setBotUsername(res.data.botUsername || 'FiberOpsNOCBot');
      setUserNik(res.data.user?.nik || null);
      window.setTimeout(() => otpInputRef.current?.focus(), 40);
    } catch {
      setErrorMessage(STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR);
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked || isRequestingOtp) return;

    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib diisi.');
      return;
    }

    if (!preAuthToken) {
      await handleRequestOtp();
      return;
    }

    const cleanOtp = otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Masukkan 6 digit angka kode OTP dari Telegram.');
      otpInputRef.current?.focus();
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const cleanUrl = serverUrl.trim();
      apiClient.setBaseUrl(cleanUrl);
      await persistentStorage.setItem(SERVER_URL_STORAGE_KEY, cleanUrl);

      const res = await apiClient.request<MobileVerifiedSessionResponse>('/api/v1/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          preAuthToken,
          otpCode: cleanOtp,
          deviceId: deviceId.trim(),
          deviceModel: deviceModel.trim(),
          appVersion: CURRENT_MOBILE_APP_VERSION,
        }),
      });

      if (!res.success) {
        applyAuthApiError(res.error, res.meta);
        return;
      }

      const tokens: MobileSessionTokens = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      };

      apiClient.setTokens(tokens);
      onLoginSuccess(res.data.user, tokens);
    } catch {
      setErrorMessage(STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: isDark ? '#080E1A' : '#FFFFFF',
        color: theme.textPrimary,
        fontFamily: theme.typography.fontFamily.sans,
        boxSizing: 'border-box',
        padding: '24px 20px 20px',
        overflowX: 'clip',
      }}
    >
      <style>{`
        input:focus-visible, button:focus-visible, .fiberops-input:focus-visible, .fiberops-action-btn:focus-visible {
          outline: 2px solid #1B5CA2;
          outline-offset: 1px;
        }
        button:active, .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        button:disabled, input:disabled, .fiberops-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .fiberops-input {
          background-color: ${isDark ? '#10192D' : '#FFFFFF'} !important;
          color: ${isDark ? '#F8FAFC' : '#0F172A'} !important;
          color-scheme: ${isDark ? 'dark' : 'light'};
        }
        .fiberops-input:-webkit-autofill,
        .fiberops-input:-webkit-autofill:hover,
        .fiberops-input:-webkit-autofill:focus,
        .fiberops-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px ${isDark ? '#10192D' : '#FFFFFF'} inset !important;
          -webkit-text-fill-color: ${isDark ? '#F8FAFC' : '#0F172A'} !important;
          caret-color: ${isDark ? '#F8FAFC' : '#0F172A'} !important;
          color: ${isDark ? '#F8FAFC' : '#0F172A'} !important;
        }
      `}</style>

      <div
        style={{
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          boxSizing: 'border-box',
          paddingBottom: '16px',
        }}
      >
        {/* Large Centered Logo Lintasarta without text (matching preference login.jpeg) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '32px',
          }}
        >
          <img
            src="/assets/Lintasarta-Icon.svg"
            alt="Lintasarta"
            width={84}
            height={84}
            style={{ display: 'block' }}
          />
        </div>

        {/* Form Container */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Centered Heading & Subtitle */}
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: isDark ? '#F8FAFC' : '#0F172A',
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              textAlign: 'center',
            }}
          >
            Login Teknisi
          </h1>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: isDark ? '#94A3B8' : '#64748B',
              margin: '0 0 28px',
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            Portal Otentikasi Petugas Lapangan FTTH
          </p>

          {sessionRevokedReason && (
            <div style={{ marginBottom: '16px' }}>
              <ErrorBanner message={sessionRevokedReason} themeMode={themeMode} />
            </div>
          )}

          {(errorMessage || rateLimitSeconds > 0) && (
            <div style={{ marginBottom: '16px' }}>
              <ErrorBanner
                message={
                  rateLimitSeconds > 0
                    ? `Terlalu banyak percobaan login. Silakan tunggu ${rateLimitSeconds} detik.`
                    : errorMessage
                }
                onDismiss={rateLimitSeconds > 0 ? undefined : () => setErrorMessage(null)}
                themeMode={themeMode}
              />
            </div>
          )}

          {/* Clean Login Form with 2FA Telegram OTP */}
          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            {/* Username Field with User Icon */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  color: focusedInput === 'username' ? '#1B5CA2' : '#94A3B8',
                  pointerEvents: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                <UserIcon size={19} />
              </span>
              <input
                id="field-username"
                type="text"
                className="fiberops-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedInput('username')}
                onBlur={() => setFocusedInput(null)}
                disabled={isLocked}
                placeholder="Username Teknisi"
                aria-label="Username Teknisi"
                autoComplete="username"
                autoCapitalize="none"
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '12px 18px 12px 46px',
                  fontSize: '14px',
                  background: isDark ? '#10192D' : '#FFFFFF',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  border:
                    focusedInput === 'username'
                      ? `1.5px solid ${isDark ? '#38BDF8' : '#1B5CA2'}`
                      : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  colorScheme: isDark ? 'dark' : 'light',
                  boxShadow:
                    focusedInput === 'username'
                      ? isDark
                        ? '0 0 0 3px rgba(56, 189, 248, 0.18)'
                        : '0 0 0 3px rgba(27, 92, 162, 0.15)'
                      : 'none',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              />
            </div>

            {/* Password Field with Lock Icon and Eye Toggle */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  color: focusedInput === 'password' ? '#1B5CA2' : '#94A3B8',
                  pointerEvents: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                <LockIcon size={19} />
              </span>
              <input
                id="field-password"
                type={showPassword ? 'text' : 'password'}
                className="fiberops-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                disabled={isLocked}
                placeholder="Kata Sandi"
                aria-label="Kata Sandi"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '12px 48px 12px 46px',
                  fontSize: '14px',
                  background: isDark ? '#10192D' : '#FFFFFF',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  border:
                    focusedInput === 'password'
                      ? `1.5px solid ${isDark ? '#38BDF8' : '#1B5CA2'}`
                      : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  colorScheme: isDark ? 'dark' : 'light',
                  boxShadow:
                    focusedInput === 'password'
                      ? isDark
                        ? '0 0 0 3px rgba(56, 189, 248, 0.18)'
                        : '0 0 0 3px rgba(27, 92, 162, 0.15)'
                      : 'none',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              />
              <button
                type="button"
                className="fiberops-action-btn"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLocked}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                style={{
                  position: 'absolute',
                  right: '2px',
                  width: '44px',
                  height: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: showPassword ? '#1B5CA2' : '#64748B',
                  cursor: 'pointer',
                  borderRadius: '6px',
                }}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>

            {/* 2FA Telegram OTP Inline Row (6-digit input + Kirim OTP / Kirim Ulang button) */}
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: '8px',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      color: focusedInput === 'otp' ? '#1B5CA2' : '#94A3B8',
                      pointerEvents: 'none',
                      transition: 'color 0.15s ease',
                    }}
                  >
                    <ShieldIcon size={18} />
                  </span>
                  <input
                    ref={otpInputRef}
                    id="field-otp"
                    name="otpCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_CONFIG.CODE_LENGTH}
                    pattern="\d{6}"
                    className="fiberops-input"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    onFocus={() => setFocusedInput('otp')}
                    onBlur={() => setFocusedInput(null)}
                    disabled={isLocked}
                    placeholder="6 digit OTP"
                    aria-label="Kode OTP Telegram (6 Digit)"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      minHeight: '48px',
                      padding: '12px 14px 12px 42px',
                      fontSize: otpCode ? '15px' : '14px',
                      fontWeight: otpCode ? 700 : 400,
                      fontFamily: otpCode ? theme.typography.fontFamily.mono : theme.typography.fontFamily.sans,
                      letterSpacing: otpCode ? '0.18em' : 'normal',
                      background: isDark ? '#10192D' : '#FFFFFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      border:
                        focusedInput === 'otp'
                          ? `1.5px solid ${isDark ? '#38BDF8' : '#1B5CA2'}`
                          : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      borderRadius: '6px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      colorScheme: isDark ? 'dark' : 'light',
                      boxShadow:
                        focusedInput === 'otp'
                          ? isDark
                            ? '0 0 0 3px rgba(56, 189, 248, 0.18)'
                            : '0 0 0 3px rgba(27, 92, 162, 0.15)'
                          : 'none',
                      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="fiberops-action-btn"
                  onClick={() => void handleRequestOtp()}
                  disabled={
                    isLocked ||
                    isRequestingOtp ||
                    resendCooldownSeconds > 0 ||
                    !username.trim() ||
                    !password
                  }
                  style={{
                    minHeight: '48px',
                    padding: '0 14px',
                    borderRadius: '6px',
                    background:
                      isLocked ||
                      isRequestingOtp ||
                      resendCooldownSeconds > 0 ||
                      !username.trim() ||
                      !password
                        ? isDark
                          ? '#1E293B'
                          : '#F1F5F9'
                        : isDark
                          ? '#0F2942'
                          : '#F0F9FF',
                    border:
                      isLocked ||
                      isRequestingOtp ||
                      resendCooldownSeconds > 0 ||
                      !username.trim() ||
                      !password
                        ? `1px solid ${isDark ? '#334155' : '#CBD5E1'}`
                        : `1px solid ${isDark ? '#0369A1' : '#7DD3FC'}`,
                    color:
                      isLocked ||
                      isRequestingOtp ||
                      resendCooldownSeconds > 0 ||
                      !username.trim() ||
                      !password
                        ? isDark
                          ? '#94A3B8'
                          : '#475569'
                        : isDark
                          ? '#38BDF8'
                          : '#0369A1',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor:
                      isLocked ||
                      isRequestingOtp ||
                      resendCooldownSeconds > 0 ||
                      !username.trim() ||
                      !password
                        ? 'not-allowed'
                        : 'pointer',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <SendIcon size={14} />
                  <span>
                    {isRequestingOtp
                      ? 'Mengirim...'
                      : resendCooldownSeconds > 0
                        ? `Tunggu (${resendCooldownSeconds}d)`
                        : preAuthToken
                          ? 'Kirim Ulang'
                          : 'Kirim OTP'}
                  </span>
                </button>
              </div>

              {deliveryStatus === 'SENT' && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: isDark ? '#0F2942' : '#F0F9FF',
                    border: `1px solid ${isDark ? '#0369A1' : '#BAE6FD'}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: '11.5px',
                      lineHeight: 1.45,
                      color: isDark ? '#7DD3FC' : '#0369A1',
                      fontWeight: 500,
                    }}
                  >
                    Kode OTP telah dikirim oleh <strong>@{botUsername}</strong> ke Telegram terdaftar
                    {maskedChatId ? ` (${maskedChatId})` : ''}
                    {userNik ? ` untuk NIK: ${userNik}` : ''}.
                  </p>
                  {otpExpiresSeconds > 0 && (
                    <span
                      title="Masa berlaku kode OTP"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        background: isDark ? '#10192D' : '#FFFFFF',
                        border: `1px solid ${isDark ? '#0369A1' : '#BAE6FD'}`,
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        fontFamily: theme.typography.fontFamily.mono,
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      <ClockIcon size={11} />
                      <span>{formatCountdown(otpExpiresSeconds)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Primary Action Button: Lintasarta Cobalt Blue */}
            <button
              type="submit"
              className="fiberops-action-btn"
              disabled={isLocked || isRequestingOtp}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '12px 16px',
                background: isLocked || isRequestingOtp ? '#64748B' : '#1B5CA2',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                cursor: isLocked || isRequestingOtp ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: isLocked || isRequestingOtp ? 'none' : '0 4px 14px rgba(27, 92, 162, 0.28)',
                transition: 'background-color 0.15s ease, transform 0.1s ease',
              }}
            >
              <ShieldIcon size={16} />
              <span>
                {rateLimitSeconds > 0
                  ? `Terkunci Sementara (${rateLimitSeconds}d)`
                  : isLoading
                    ? 'Memverifikasi OTP & Sesi...'
                    : isRequestingOtp
                      ? 'Mengirim OTP ke Telegram...'
                      : 'Masuk Aplikasi'}
              </span>
            </button>
          </form>
        </div>
      </div>

      {/* Footer Utility & Device Information */}
      <footer
        style={{
          marginTop: 'auto',
          flexShrink: 0,
          paddingTop: '16px',
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: theme.textMuted,
          textAlign: 'center',
          lineHeight: 1.45,
        }}
      >
        <div>
          Perangkat: <span style={{ color: theme.textSecondary, fontWeight: 600 }}>{deviceId}</span> ({deviceModel})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>v{CURRENT_MOBILE_APP_VERSION}</span>
          <span style={{ color: theme.border }}>•</span>
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => setShowServerModal(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px 4px',
              color: isDark ? '#38BDF8' : '#0E5B92',
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            Pengaturan Server
          </button>
        </div>
      </footer>

      {/* Clean Modal for Server URL Configuration */}
      {showServerModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="server-config-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowServerModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              background: isDark ? '#0F172A' : '#FFFFFF',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                borderBottom: `1px solid ${theme.border}`,
                paddingBottom: '10px',
              }}
            >
              <h2
                id="server-config-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  margin: 0,
                }}
              >
                Pengaturan Endpoint Server
              </h2>
              <button
                type="button"
                className="fiberops-action-btn"
                onClick={() => setShowServerModal(false)}
                aria-label="Tutup dialog"
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <p
              style={{
                fontSize: '12px',
                color: theme.textSecondary,
                margin: '0 0 14px',
                lineHeight: 1.45,
              }}
            >
              Tentukan URL backend server FiberOps untuk pengujian lokal (MacBook M5, LAN, atau Cloud on-premise).
            </p>

            <label
              htmlFor="server-url-input"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '6px',
              }}
            >
              URL Endpoint Backend
            </label>
            <input
              id="server-url-input"
              type="text"
              className="fiberops-input"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:8080"
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 12px',
                fontSize: '13px',
                background: isDark ? '#080E1A' : '#F1F5F9',
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                boxSizing: 'border-box',
                marginBottom: '10px',
                fontFamily: theme.typography.fontFamily.mono,
                outline: 'none',
              }}
            />

            <button
              type="button"
              className="fiberops-action-btn"
              onClick={handleTestConnection}
              disabled={healthStatus === 'TESTING'}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px',
                background: isDark ? '#1E293B' : '#E2E8F0',
                color: theme.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                cursor: healthStatus === 'TESTING' ? 'not-allowed' : 'pointer',
                marginBottom: '10px',
              }}
            >
              {healthStatus === 'TESTING' ? 'Menguji Koneksi...' : 'Uji Koneksi Server'}
            </button>

            <div
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 500,
                background:
                  healthStatus === 'SUCCESS'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : healthStatus === 'ERROR'
                      ? 'rgba(239, 68, 68, 0.15)'
                      : healthStatus === 'TESTING'
                        ? 'rgba(27, 92, 162, 0.15)'
                        : isDark
                          ? '#080E1A'
                          : '#F1F5F9',
                color:
                  healthStatus === 'SUCCESS'
                    ? theme.statusOptimal
                    : healthStatus === 'ERROR'
                      ? theme.statusCritical
                      : healthStatus === 'TESTING'
                        ? '#38BDF8'
                        : theme.textSecondary,
                border: `1px solid ${
                  healthStatus === 'SUCCESS'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : healthStatus === 'ERROR'
                      ? 'rgba(239, 68, 68, 0.3)'
                      : theme.border
                }`,
                marginBottom: '16px',
              }}
            >
              Status: {healthMessage}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="fiberops-action-btn"
                onClick={() => setShowServerModal(false)}
                style={{
                  minHeight: '40px',
                  padding: '8px 16px',
                  background: '#1B5CA2',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
