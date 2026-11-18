import React, { useState, useEffect } from 'react';
import { ApiClient, MobileSessionTokens } from '../api/client';
import {
  CURRENT_MOBILE_APP_VERSION,
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

function UserIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ServerIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ChevronDownIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function EyeIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function LoginScreen({
  apiClient,
  onLoginSuccess,
  defaultDeviceId = 'DEVICE-TECH-SM-A54',
  sessionRevokedReason = null,
  themeMode = 'dark',
}: LoginScreenProps) {
  const [username, setUsername] = useState('andi.pratama');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deviceId] = useState(defaultDeviceId);
  const [deviceModel] = useState('Samsung Galaxy A54 5G');
  const [serverUrl, setServerUrl] = useState(apiClient.getBaseUrl() || 'http://localhost:3000');
  const [healthStatus, setHealthStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [healthMessage, setHealthMessage] = useState<string>('Belum diuji');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<'username' | 'password' | null>(null);

  const theme = getThemeTokens(themeMode);

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

  const handleTestConnection = async () => {
    try {
      setHealthStatus('TESTING');
      setHealthMessage('Menguji koneksi...');
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib diisi.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const cleanUrl = serverUrl.trim();
      apiClient.setBaseUrl(cleanUrl);
      await persistentStorage.setItem(SERVER_URL_STORAGE_KEY, cleanUrl);

      const res = await apiClient.request<{
        accessToken: string;
        refreshToken: string;
        user: UserProfile;
      }>('/api/v1/auth/login', {
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
        if (
          res.error?.code === 'INVALID_CREDENTIALS' ||
          res.error?.code === 'UNAUTHORIZED' ||
          res.error?.message?.toLowerCase().includes('kredensial') ||
          res.error?.message?.toLowerCase().includes('password') ||
          res.error?.message?.toLowerCase().includes('username')
        ) {
          setErrorMessage(STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS);
        } else if (
          res.error?.code === 'INTERNAL_ERROR' ||
          res.error?.code === 'SERVICE_UNAVAILABLE'
        ) {
          setErrorMessage(STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR);
        } else {
          const sanitized = sanitizeUiErrorMessage(res.error);
          setErrorMessage(sanitized.message);
        }
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
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: theme.bg,
        color: theme.textPrimary,
        fontFamily: theme.typography.fontFamily.sans,
        boxSizing: 'border-box',
        padding: '24px 20px 20px',
        overflowX: 'clip',
      }}
    >
      <style>{`
        input:focus-visible, button:focus-visible, .fiberops-input:focus-visible, .fiberops-action-btn:focus-visible {
          outline: 2px solid #0284C7;
          outline-offset: 1px;
        }
        button:active, .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        button:disabled, input:disabled, .fiberops-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        button, .fiberops-action-btn {
          white-space: nowrap;
        }
      `}</style>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            padding: '4px 10px',
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.25)',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            color: theme.accentCyan,
            marginBottom: '12px',
            letterSpacing: '0.04em',
            fontFamily: theme.typography.fontFamily.mono,
          }}
        >
          LINTASARTA FIELD OPS v{CURRENT_MOBILE_APP_VERSION}
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: 800,
            color: theme.textPrimary,
            margin: '0 0 4px',
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
          }}
        >
          FiberOps Mobile
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: theme.textSecondary,
            margin: '0 0 20px',
            lineHeight: 1.5,
          }}
        >
          Portal otentikasi teknisi lapangan FTTH Regional Palembang
        </p>

        {sessionRevokedReason && (
          <ErrorBanner
            message={sessionRevokedReason}
            themeMode={themeMode}
          />
        )}

        {errorMessage && (
          <ErrorBanner
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
            themeMode={themeMode}
          />
        )}

        {/* Dynamic Server Configuration Drawer */}
        <div
          style={{
            marginBottom: '18px',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            background: theme.surfaceSecondary,
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => setShowServerConfig(!showServerConfig)}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textPrimary,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ServerIcon size={15} color={theme.textSecondary} />
              <span style={{ whiteSpace: 'nowrap' }}>Pengaturan Server Backend</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.textSecondary }}>
              <span>{showServerConfig ? 'Tutup' : 'Ubah'}</span>
              {showServerConfig ? <ChevronUpIcon size={12} color={theme.textSecondary} /> : <ChevronDownIcon size={12} color={theme.textSecondary} />}
            </div>
          </button>

          {showServerConfig && (
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${theme.border}` }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textSecondary,
                  marginBottom: '6px',
                }}
              >
                URL Endpoint Server (MacBook Air M5 / Cloud / LAN)
              </label>
              <input
                type="text"
                className="fiberops-input"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:8080"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  background: theme.surfaceInset,
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
                  padding: '10px 14px',
                  background: theme.primary,
                  color: theme.primaryText,
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: healthStatus === 'TESTING' ? 'not-allowed' : 'pointer',
                  opacity: healthStatus === 'TESTING' ? 0.7 : 1,
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
                          ? 'rgba(14, 165, 233, 0.15)'
                          : theme.badgeBg,
                  color:
                    healthStatus === 'SUCCESS'
                      ? theme.statusOptimal
                      : healthStatus === 'ERROR'
                        ? theme.statusCritical
                        : healthStatus === 'TESTING'
                          ? theme.accentCyan
                          : theme.textSecondary,
                  border: `1px solid ${
                    healthStatus === 'SUCCESS'
                      ? 'rgba(16, 185, 129, 0.3)'
                      : healthStatus === 'ERROR'
                        ? 'rgba(239, 68, 68, 0.3)'
                        : healthStatus === 'TESTING'
                          ? 'rgba(14, 165, 233, 0.3)'
                          : theme.border
                  }`,
                }}
              >
                Status: {healthMessage}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '6px',
              }}
            >
              Username Teknisi
            </label>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <UserIcon size={16} color={focusedInput === 'username' ? theme.primary : theme.textMuted} />
              </div>
              <input
                type="text"
                className="fiberops-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedInput('username')}
                onBlur={() => setFocusedInput(null)}
                disabled={isLoading}
                placeholder="andi.pratama"
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '12px 14px 12px 42px',
                  fontSize: '13px',
                  background: theme.surfaceInset,
                  color: theme.textPrimary,
                  border: focusedInput === 'username' ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  boxShadow: focusedInput === 'username' ? '0 0 0 2px rgba(2, 132, 199, 0.25)' : 'none',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <LockIcon size={16} color={focusedInput === 'password' ? theme.primary : theme.textMuted} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                className="fiberops-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                disabled={isLoading}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '12px 48px 12px 42px',
                  fontSize: '13px',
                  background: theme.surfaceInset,
                  color: theme.textPrimary,
                  border: focusedInput === 'password' ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  boxShadow: focusedInput === 'password' ? '0 0 0 2px rgba(2, 132, 199, 0.25)' : 'none',
                }}
              />
              <button
                type="button"
                className="fiberops-action-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                style={{
                  position: 'absolute',
                  right: '4px',
                  width: '44px',
                  height: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: showPassword ? theme.accentCyan : theme.textMuted,
                  cursor: 'pointer',
                  borderRadius: '4px',
                }}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          {/* Quick Demo Credentials Helper */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              className="fiberops-action-btn"
              onClick={() => {
                setUsername('andi.pratama');
                setPassword('teknisi123');
                setErrorMessage(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 0',
                minHeight: '44px',
                color: theme.accentCyan,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              <span style={{ whiteSpace: 'nowrap' }}>Gunakan Kredensial Uji Coba (andi.pratama / teknisi123)</span>
            </button>
          </div>

          <button
            type="submit"
            className="fiberops-action-btn"
            disabled={isLoading}
            style={{
              width: '100%',
              minHeight: '48px',
              padding: '12px 16px',
              background: theme.primary,
              color: theme.primaryText,
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            {isLoading ? 'Memverifikasi...' : 'Masuk Aplikasi'}
          </button>
        </form>
      </div>

      <div
        style={{
          marginTop: '28px',
          paddingTop: '16px',
          borderTop: `1px solid ${theme.border}`,
          fontSize: '11px',
          color: theme.textMuted,
          textAlign: 'center',
          fontFamily: theme.typography.fontFamily.mono,
          letterSpacing: '0.01em',
          lineHeight: 1.5,
        }}
      >
        Perangkat Terikat: <span style={{ color: theme.textSecondary }}>{deviceId}</span> ({deviceModel})
      </div>
    </div>
  );
}
