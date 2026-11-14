import React, { useState, useEffect } from 'react';
import { ApiClient, MobileSessionTokens } from '../api/client';
import { CURRENT_MOBILE_APP_VERSION, UserProfile } from '@repo/shared';
import { persistentStorage } from '../storage/persistentStorage';
import { getThemeTokens } from '../theme/tokens';

export const SERVER_URL_STORAGE_KEY = '@fiberops_server_url_v1';

export interface LoginScreenProps {
  apiClient: ApiClient;
  onLoginSuccess: (user: UserProfile, tokens: MobileSessionTokens) => void;
  defaultDeviceId?: string;
  sessionRevokedReason?: string | null;
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
}

export function LoginScreen({
  apiClient,
  onLoginSuccess,
  defaultDeviceId = 'DEVICE-TECH-SM-A54',
  sessionRevokedReason = null,
  themeMode = 'light',
}: LoginScreenProps) {
  const [username, setUsername] = useState('andi.pratama');
  const [password, setPassword] = useState('');
  const [deviceId] = useState(defaultDeviceId);
  const [deviceModel] = useState('Samsung Galaxy A54 5G');
  const [serverUrl, setServerUrl] = useState(apiClient.getBaseUrl() || 'http://localhost:3000');
  const [healthStatus, setHealthStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [healthMessage, setHealthMessage] = useState<string>('Belum diuji');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        setErrorMessage(res.error.message || 'Login gagal. Periksa kembali kredensial Anda.');
        return;
      }

      const tokens: MobileSessionTokens = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      };

      apiClient.setTokens(tokens);
      onLoginSuccess(res.data.user, tokens);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan koneksi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - 60px)',
        padding: '20px 16px',
        background: theme.bg,
        color: theme.textPrimary,
        fontFamily: theme.typography.fontFamily.sans,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: theme.surface,
          borderRadius: '8px',
          border: `1px solid ${theme.border}`,
          padding: '24px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '4px 8px',
            background: theme.badgeBg,
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            color: theme.primary,
            marginBottom: '10px',
          }}
        >
          LINTASARTA FIELD OPS v{CURRENT_MOBILE_APP_VERSION}
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 6px' }}>
          FiberOps Mobile
        </h1>
        <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 16px', lineHeight: 1.5 }}>
          Portal otentikasi teknisi lapangan FTTH Regional Palembang
        </p>

        {sessionRevokedReason && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '12px',
              marginBottom: '14px',
            }}
          >
            {sessionRevokedReason}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '12px',
              marginBottom: '14px',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Dynamic Server Configuration Accordion */}
        <div
          style={{
            marginBottom: '18px',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            background: theme.bg,
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: theme.badgeBg,
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textPrimary,
            }}
          >
            <span>Pengaturan Server Backend</span>
            <span style={{ fontSize: '11px', color: theme.textSecondary }}>
              {showServerConfig ? 'Tutup ▲' : 'Ubah ▼'}
            </span>
          </button>

          {showServerConfig && (
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${theme.border}` }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textSecondary,
                  marginBottom: '4px',
                }}
              >
                URL Endpoint Server (MacBook Air M5 / Cloud / LAN)
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:8080"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  background: theme.bg,
                  color: theme.textPrimary,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  marginBottom: '10px',
                  fontFamily: theme.typography.fontFamily.mono,
                }}
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={healthStatus === 'TESTING'}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  background: theme.primary,
                  color: '#ffffff',
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
                      ? '#f0fdf4'
                      : healthStatus === 'ERROR'
                        ? '#fef2f2'
                        : healthStatus === 'TESTING'
                          ? '#eff6ff'
                          : theme.badgeBg,
                  color:
                    healthStatus === 'SUCCESS'
                      ? '#16a34a'
                      : healthStatus === 'ERROR'
                        ? '#dc2626'
                        : healthStatus === 'TESTING'
                          ? '#1d4ed8'
                          : theme.textSecondary,
                  border: `1px solid ${
                    healthStatus === 'SUCCESS'
                      ? '#bbf7d0'
                      : healthStatus === 'ERROR'
                        ? '#fecaca'
                        : healthStatus === 'TESTING'
                          ? '#bfdbfe'
                          : theme.border
                  }`,
                }}
              >
                Status: {healthMessage}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '4px',
              }}
            >
              Username Teknisi
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 12px',
                fontSize: '13px',
                background: theme.bg,
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '4px',
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 12px',
                fontSize: '13px',
                background: theme.bg,
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 16px',
              background: theme.primary,
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Memverifikasi...' : 'Masuk Aplikasi'}
          </button>
        </form>

        <div style={{ marginTop: '16px', fontSize: '11px', color: theme.textSecondary, textAlign: 'center' }}>
          Perangkat Terikat: {deviceId} ({deviceModel})
        </div>
      </div>
    </div>
  );
}
