import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import {
  CURRENT_MOBILE_APP_VERSION,
  UserProfile,
  PALEMBANG_ODP_LIST,
  SECURITY_GATE_STRINGS,
  STANDARD_ACTION_LABELS,
} from '@repo/shared';

export type AppSecurityState =
  | 'CHECKING_INTEGRITY'
  | 'DEVICE_COMPROMISED_LOCK'
  | 'UPGRADE_REQUIRED_LOCK'
  | 'SESSION_REVOKED_LOCK'
  | 'READY';

export type AppScreen = 'LOGIN' | 'TICKET_LIST' | 'TICKET_SUBMIT';

export type ThemeMode = 'light' | 'dark' | 'outdoorSunlight';

function formatViolationLabel(violation: string): string {
  switch (violation) {
    case 'DEVELOPER_OPTIONS_ENABLED':
      return 'Opsi Pengembang (Developer Options) aktif pada perangkat';
    case 'ADB_DEBUGGING_ENABLED':
      return 'USB Debugging atau ADB aktif pada perangkat';
    case 'INJECTED_MOBILE_CONSOLE_DETECTED':
      return 'Injeksi konsol pengembang seluler (Eruda / vConsole) terdeteksi';
    case 'CONSOLE_INSPECTION_DETECTED':
      return 'Inspeksi konsol Developer Tools terdeteksi';
    case 'ROOT_ACCESS_DETECTED':
      return 'Akses Root (su / Superuser) terdeteksi pada sistem';
    case 'EMULATOR_ENVIRONMENT_DETECTED':
      return 'Lingkungan emulator perangkat terdeteksi';
    case 'DEBUGGABLE_BUILD_DETECTED':
      return 'Mode debuggable build aktif';
    default:
      return violation;
  }
}

export interface AppProps {
  initialThemeMode?: ThemeMode;
}

export default function App({ initialThemeMode = 'light' }: AppProps = {}) {
  const [securityState, setSecurityState] = useState<AppSecurityState>('CHECKING_INTEGRITY');
  const [integrityReport, setIntegrityReport] = useState<DeviceIntegrityReport | null>(null);
  const [upgradeLock, setUpgradeLock] = useState<UpgradeRequiredDetails | null>(null);
  const [sessionRevokedReason, setSessionRevokedReason] = useState<string | null>(null);

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('LOGIN');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<MobileTicketItem | null>(null);
  const [availableSplitters, setAvailableSplitters] = useState<SplitterItem[]>(PALEMBANG_ODP_LIST);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);

  const theme = getThemeTokens(themeMode);

  const isCompromisedDevice = useCallback((report: DeviceIntegrityReport | null): boolean => {
    if (!report) return false;
    return (
      report.isCompromised ||
      report.developerOptionsEnabled ||
      report.adbEnabled ||
      !report.isSecure
    );
  }, []);

  const performIntegrityRecheck = useCallback(async () => {
    try {
      const report = await checkDeviceIntegrity();
      setIntegrityReport(report);
      if (!isCompromisedDevice(report)) {
        setSecurityState((prevState) => {
          if (prevState === 'DEVICE_COMPROMISED_LOCK') {
            return 'READY';
          }
          return prevState;
        });
        return true;
      } else {
        setSecurityState('DEVICE_COMPROMISED_LOCK');
        return false;
      }
    } catch (err) {
      console.warn('[App] Recheck device integrity failed:', err);
      return false;
    }
  }, [isCompromisedDevice]);

  // Reactive recheck on window resize or periodic polling while locked
  useEffect(() => {
    if (securityState !== 'DEVICE_COMPROMISED_LOCK') return undefined;

    const handleResize = () => {
      void performIntegrityRecheck();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }

    const intervalId = setInterval(() => {
      void performIntegrityRecheck();
    }, 1000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
      clearInterval(intervalId);
    };
  }, [securityState, performIntegrityRecheck]);

  // Enforce consistent light/dark themeMode as designated by initialThemeMode
  useEffect(() => {
    if (initialThemeMode) {
      setThemeMode(initialThemeMode);
    }
  }, [initialThemeMode]);

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
        if (isCompromisedDevice(report)) {
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

  // State 1: Pre-Login Security Gate Screen (Requirement R3)
  if (securityState === 'DEVICE_COMPROMISED_LOCK') {
    const isDark = themeMode === 'dark';
    const isOutdoor = themeMode === 'outdoorSunlight';

    const cardBg = isOutdoor ? '#FFFFFF' : isDark ? '#151C2C' : '#FFFFFF';
    const cardBorder = isOutdoor ? '2px solid #000000' : isDark ? '1px solid #334155' : '1px solid #CBD5E1';
    const badgeBg = isOutdoor ? '#F3F4F6' : isDark ? '#450A0A' : '#FEF2F2';
    const badgeBorder = isOutdoor ? '1px solid #000000' : isDark ? '1px solid #7F1D1D' : '1px solid #FECACA';
    const badgeText = isOutdoor ? '#000000' : isDark ? '#FCA5A5' : '#991B1B';
    const titleColor = isOutdoor ? '#000000' : '#DC2626';
    const buttonBg = isOutdoor ? '#000000' : theme.primary;
    const buttonText = '#FFFFFF';

    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="security-gate-title"
        aria-describedby="security-gate-desc"
        style={{
          minHeight: '100vh',
          background: theme.bg,
          color: theme.textPrimary,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          boxSizing: 'border-box',
          fontFamily: theme.typography.fontFamily.sans,
        }}
      >
        <div
          style={{
            maxWidth: '460px',
            width: '100%',
            background: cardBg,
            border: cardBorder,
            borderRadius: `${theme.radii.card * 1.5}px`,
            padding: '28px 20px',
            boxSizing: 'border-box',
            textAlign: 'center',
            boxShadow: isDark
              ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
              : '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Shield Security Icon */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: badgeBg,
              border: badgeBorder,
              color: isDark ? '#EF4444' : '#DC2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Category Badge */}
          <div style={{ marginBottom: '12px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                background: badgeBg,
                border: badgeBorder,
                borderRadius: `${theme.radii.badge}px`,
                fontSize: '11px',
                fontWeight: 700,
                color: badgeText,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              KEAMANAN PERANGKAT OPERASIONAL
            </span>
          </div>

          {/* Title */}
          <h1
            id="security-gate-title"
            style={{
              margin: '0 0 10px 0',
              fontSize: '18px',
              fontWeight: 700,
              color: titleColor,
              lineHeight: theme.typography.lineHeight.tight,
            }}
          >
            Perangkat Tidak Memenuhi Standar Keamanan
          </h1>

          {/* Description */}
          <p
            id="security-gate-desc"
            style={{
              margin: '0 0 20px 0',
              fontSize: '13px',
              color: theme.textSecondary,
              lineHeight: theme.typography.lineHeight.normal,
              textAlign: 'center',
            }}
          >
            Aplikasi FiberOps ditolak berjalan pada perangkat yang terdeteksi memiliki Opsi Pengembang (Developer Options), USB Debugging, atau lingkungan tidak aman demi menjaga kerahasiaan topologi jaringan ISP.
          </p>

          {/* Step-by-Step Guidance Card */}
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: `${theme.radii.card}px`,
              padding: '16px',
              textAlign: 'left',
              marginBottom: '16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: theme.primary,
                  display: 'inline-block',
                }}
              />
              <span>Panduan Penonaktifan:</span>
            </div>
            <ol
              style={{
                margin: 0,
                paddingLeft: '20px',
                fontSize: '12px',
                color: theme.textSecondary,
                lineHeight: '1.7',
              }}
            >
              <li>
                Buka menu <strong>Pengaturan (Settings)</strong> pada perangkat Android Anda.
              </li>
              <li>
                Pilih menu <strong>Sistem</strong> atau <strong>Tentang Ponsel</strong>, lalu buka{' '}
                <strong>Opsi Pengembang (Developer Options)</strong>.
              </li>
              <li>
                Nonaktifkan sakelar <strong>Opsi Pengembang</strong> dan <strong>USB Debugging</strong>.
              </li>
              <li>
                Kembali ke aplikasi FiberOps dan tekan tombol verifikasi di bawah.
              </li>
            </ol>
          </div>

          {/* Detected Violations List */}
          {integrityReport?.violations && integrityReport.violations.length > 0 && (
            <div
              style={{
                padding: '12px 14px',
                background: badgeBg,
                border: badgeBorder,
                borderRadius: `${theme.radii.badge * 1.5}px`,
                textAlign: 'left',
                marginBottom: '18px',
                boxSizing: 'border-box',
              }}
            >
              <strong
                style={{
                  fontSize: '12px',
                  color: badgeText,
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Pelanggaran Terdeteksi:
              </strong>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '18px',
                  fontSize: '12px',
                  color: isDark ? '#FCA5A5' : '#B91C1C',
                  lineHeight: '1.5',
                }}
              >
                {integrityReport.violations.map((v, i) => (
                  <li key={i}>{formatViolationLabel(v)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Interactive Recheck Button */}
          <button
            type="button"
            onClick={() => void performIntegrityRecheck()}
            style={{
              width: '100%',
              minHeight: `${theme.touch.buttonMinHeight}px`,
              padding: '12px 20px',
              background: buttonBg,
              color: buttonText,
              border: 'none',
              borderRadius: `${theme.radii.button}px`,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'opacity 150ms ease',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>Periksa Ulang Status Perangkat</span>
          </button>

          {/* Real-time Status Hint */}
          <p
            style={{
              margin: '12px 0 0 0',
              fontSize: '11px',
              color: theme.textSecondary,
              textAlign: 'center',
            }}
          >
            Memantau status perangkat secara otomatis setiap saat...
          </p>
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
        width: '100%',
        minHeight: '100vh',
        overflowX: 'clip',
        boxSizing: 'border-box',
        background:
          themeMode === 'dark'
            ? 'radial-gradient(ellipse at 85% -10%, rgba(14, 165, 233, 0.15) 0%, rgba(2, 132, 199, 0.05) 45%, #080E1A 85%)'
            : theme.bg,
        color: theme.textPrimary,
        position: 'relative',
        fontFamily: theme.typography.fontFamily.sans,
      }}
    >
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
