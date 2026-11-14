import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient, UpgradeRequiredDetails, MobileSessionTokens } from './src/api/client';
import { offlineQueue } from './src/sync/offlineQueue';
import { LoginScreen, SERVER_URL_STORAGE_KEY } from './src/screens/LoginScreen';
import {
  TicketListView,
  MobileTicketItem,
  SplitterItem,
} from './src/screens/TicketListScreen';
import { TicketSubmitView } from './src/screens/TicketSubmitScreen';
import {
  checkDeviceIntegrity,
  DeviceIntegrityReport,
  removeSecureToken,
} from './src/security/deviceIntegrity';
import {
  persistentStorage,
  getEncryptedItem,
  setEncryptedItem,
  removeEncryptedItem,
} from './src/storage/persistentStorage';
import { getThemeTokens } from './src/theme/tokens';
import { CURRENT_MOBILE_APP_VERSION, UserProfile, PALEMBANG_ODP_LIST } from '@repo/shared';

export type AppSecurityState =
  | 'CHECKING_INTEGRITY'
  | 'DEVICE_COMPROMISED_LOCK'
  | 'UPGRADE_REQUIRED_LOCK'
  | 'SESSION_REVOKED_LOCK'
  | 'READY';

export type AppScreen = 'LOGIN' | 'TICKET_LIST' | 'TICKET_SUBMIT';

export type ThemeMode = 'light' | 'dark' | 'outdoorSunlight';

export default function App() {
  const [securityState, setSecurityState] = useState<AppSecurityState>('CHECKING_INTEGRITY');
  const [integrityReport, setIntegrityReport] = useState<DeviceIntegrityReport | null>(null);
  const [upgradeLock, setUpgradeLock] = useState<UpgradeRequiredDetails | null>(null);
  const [sessionRevokedReason, setSessionRevokedReason] = useState<string | null>(null);

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('LOGIN');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<MobileTicketItem | null>(null);
  const [availableSplitters, setAvailableSplitters] = useState<SplitterItem[]>(PALEMBANG_ODP_LIST);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  const theme = getThemeTokens(themeMode);

  // Automatic OS / System Color Scheme synchronization (no manual theme selector clutter)
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setThemeMode(mediaQuery.matches ? 'dark' : 'light');

      const listener = (e: MediaQueryListEvent) => {
        setThemeMode(e.matches ? 'dark' : 'light');
      };
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      }
    }
    return undefined;
  }, []);

  // Initialize singleton mobile API client with security interceptors
  const apiClient = useMemo(() => {
    return new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'DEVICE-TECH-SM-A54',
      appVersion: CURRENT_MOBILE_APP_VERSION,
      onUpgradeRequired: (details) => {
        setUpgradeLock(details);
        setSecurityState('UPGRADE_REQUIRED_LOCK');
      },
      onSessionRevoked: (reason) => {
        void removeSecureToken('auth_tokens');
        void removeEncryptedItem('auth_tokens');
        void removeEncryptedItem('user_profile');
        setCurrentUser(null);
        setSelectedTicket(null);
        setSessionRevokedReason(reason);
        setCurrentScreen('LOGIN');
        setSecurityState('SESSION_REVOKED_LOCK');
      },
    });
  }, []);

  // 1. Startup Initialization: load server URL, verify integrity, attempt silent auth restore
  useEffect(() => {
    let isMounted = true;

    async function initializeApp() {
      try {
        const savedUrl = await persistentStorage.getItem(SERVER_URL_STORAGE_KEY);
        if (savedUrl && isMounted) {
          apiClient.setBaseUrl(savedUrl);
        }
      } catch (err) {
        console.warn('[App] Failed loading server URL from storage:', err);
      }

      try {
        const report = await checkDeviceIntegrity();
        if (!isMounted) return;

        setIntegrityReport(report);
        if (!report.isSecure) {
          setSecurityState('DEVICE_COMPROMISED_LOCK');
          return;
        }
      } catch {
        // Continue if integrity check fails outside native container
      }

      try {
        const savedTokens = await getEncryptedItem<MobileSessionTokens>('auth_tokens');
        const savedUser = await getEncryptedItem<UserProfile>('user_profile');

        if (savedTokens?.accessToken && isMounted) {
          apiClient.setTokens(savedTokens);
          if (savedUser) {
            setCurrentUser(savedUser);
            setCurrentScreen('TICKET_LIST');
          }
        }
      } catch (err) {
        console.warn('[App] Silent auth restore failed:', err);
      }

      if (isMounted) {
        setSecurityState('READY');
      }
    }

    void initializeApp();
    return () => {
      isMounted = false;
    };
  }, [apiClient]);

  // 2. Wire offline queue with apiClient
  useEffect(() => {
    offlineQueue.configure({ apiClient });
  }, [apiClient]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleLogout = () => {
    void removeSecureToken('auth_tokens');
    void removeEncryptedItem('auth_tokens');
    void removeEncryptedItem('user_profile');
    apiClient.setTokens(null);
    setCurrentUser(null);
    setSelectedTicket(null);
    setCurrentScreen('LOGIN');
  };

  // State 1: Device Integrity Violation Screen
  if (securityState === 'DEVICE_COMPROMISED_LOCK') {
    return (
      <div
        style={{
          padding: '24px',
          fontFamily: theme.typography.fontFamily.sans,
          maxWidth: '480px',
          margin: '40px auto',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#dc2626', fontSize: '18px', fontWeight: 700 }}>
          Perangkat Tidak Memenuhi Standar Keamanan
        </h2>
        <p style={{ color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
          Aplikasi FiberOps ditolak berjalan pada perangkat yang terdeteksi rooted, emulator, atau
          memiliki lingkungan debug aktif demi menjaga kerahasiaan topologi jaringan ISP.
        </p>
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            textAlign: 'left',
          }}
        >
          <strong style={{ fontSize: '12px', color: '#991b1b' }}>Pelanggaran Terdeteksi:</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: '12px', color: '#b91c1c' }}>
            {(integrityReport?.violations || ['Root binary detected']).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // State 2: App Upgrade Required Screen (HTTP 426)
  if (securityState === 'UPGRADE_REQUIRED_LOCK' && upgradeLock) {
    return (
      <div
        style={{
          padding: '24px',
          fontFamily: theme.typography.fontFamily.sans,
          maxWidth: '480px',
          margin: '40px auto',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#0e5b92', fontSize: '18px', fontWeight: 700 }}>
          Pembaruan Aplikasi Diperlukan
        </h2>
        <p style={{ color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
          {upgradeLock.message ||
            'Versi aplikasi Anda sudah tidak didukung. Silakan unduh versi terbaru.'}
        </p>
        <p style={{ fontSize: '12px', color: '#64748b' }}>
          Versi saat ini: {upgradeLock.currentVersion} | Versi minimum: {upgradeLock.minVersion}
        </p>
        <a
          href={
            upgradeLock.downloadUrl || `${apiClient.getBaseUrl()}/download/mobile-latest.apk`
          }
          style={{
            display: 'inline-block',
            minHeight: '44px',
            marginTop: '16px',
            padding: '10px 20px',
            background: '#0e5b92',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          Unduh APK Terbaru
        </a>
      </div>
    );
  }

  // State 3: Checking Integrity Loading Screen
  if (securityState === 'CHECKING_INTEGRITY') {
    return (
      <div
        style={{
          padding: '60px 24px',
          fontFamily: theme.typography.fontFamily.sans,
          textAlign: 'center',
          color: theme.textSecondary,
          background: theme.bg,
          minHeight: '100vh',
        }}
      >
        <p style={{ fontSize: '14px', fontWeight: 500 }}>
          Memeriksa integritas keamanan perangkat mobile...
        </p>
      </div>
    );
  }

  // State 4: Navigation State Router (READY & SESSION_REVOKED_LOCK banner)
  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.textPrimary,
        position: 'relative',
        fontFamily: theme.typography.fontFamily.sans,
      }}
    >
      {/* Clean Authenticated Header Bar (Only shown after Login, zero theme switcher clutter) */}
      {currentUser && currentScreen !== 'LOGIN' && (
        <header
          style={{
            maxWidth: '520px',
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            borderBottom: `1px solid ${theme.border}`,
            background: theme.surface,
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
              FiberOps Mobile
            </div>
            <div style={{ fontSize: '11px', color: theme.textSecondary }}>
              {currentUser.fullName} ({currentUser.role})
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              minHeight: '44px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#dc2626',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Keluar
          </button>
        </header>
      )}

      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toastMessage}
        </div>
      )}

      {currentScreen === 'LOGIN' && (
        <LoginScreen
          apiClient={apiClient}
          defaultDeviceId="DEVICE-TECH-SM-A54"
          sessionRevokedReason={sessionRevokedReason}
          themeMode={themeMode}
          onLoginSuccess={(user, tokens) => {
            setCurrentUser(user);
            setSessionRevokedReason(null);
            setSecurityState('READY');
            apiClient.setTokens(tokens);
            void setEncryptedItem('auth_tokens', tokens);
            void setEncryptedItem('user_profile', user);
            setCurrentScreen('TICKET_LIST');
            showToast(`Selamat bertugas, ${user.fullName}!`);
          }}
        />
      )}

      {currentScreen === 'TICKET_LIST' && (
        <TicketListView
          apiClient={apiClient}
          technicianName={currentUser?.fullName}
          themeMode={themeMode}
          onSelectTicket={(ticket, splitters) => {
            setSelectedTicket(ticket);
            if (splitters && splitters.length > 0) {
              setAvailableSplitters(splitters);
            }
            setCurrentScreen('TICKET_SUBMIT');
          }}
          onLogout={handleLogout}
        />
      )}

      {currentScreen === 'TICKET_SUBMIT' && selectedTicket && (
        <TicketSubmitView
          ticket={selectedTicket}
          splitters={availableSplitters}
          apiClient={apiClient}
          themeMode={themeMode}
          onSubmitSuccess={(res) => {
            showToast(res.message);
            setSelectedTicket(null);
            setCurrentScreen('TICKET_LIST');
          }}
          onCancel={() => {
            setSelectedTicket(null);
            setCurrentScreen('TICKET_LIST');
          }}
        />
      )}
    </div>
  );
}
