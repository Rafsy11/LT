import { useState, useEffect, useMemo } from 'react';
import { ApiClient, UpgradeRequiredDetails } from './src/api/client';
import { offlineQueue } from './src/sync/offlineQueue';
import { LoginScreen } from './src/screens/LoginScreen';
import { TicketListScreen, MobileTicketItem, SplitterItem } from './src/screens/TicketListScreen';
import { TicketSubmitScreen } from './src/screens/TicketSubmitScreen';
import {
  checkDeviceIntegrity,
  DeviceIntegrityReport,
  removeSecureToken,
} from './src/security/deviceIntegrity';
import { CURRENT_MOBILE_APP_VERSION, UserProfile } from '@repo/shared';

export type AppSecurityState =
  | 'CHECKING_INTEGRITY'
  | 'DEVICE_COMPROMISED_LOCK'
  | 'UPGRADE_REQUIRED_LOCK'
  | 'SESSION_REVOKED_LOCK'
  | 'READY';

export type AppScreen = 'LOGIN' | 'TICKET_LIST' | 'TICKET_SUBMIT';

export default function App() {
  const [securityState, setSecurityState] = useState<AppSecurityState>('CHECKING_INTEGRITY');
  const [integrityReport, setIntegrityReport] = useState<DeviceIntegrityReport | null>(null);
  const [upgradeLock, setUpgradeLock] = useState<UpgradeRequiredDetails | null>(null);
  const [sessionRevokedReason, setSessionRevokedReason] = useState<string | null>(null);

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('LOGIN');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<MobileTicketItem | null>(null);
  const [availableSplitters, setAvailableSplitters] = useState<SplitterItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
        setCurrentUser(null);
        setSelectedTicket(null);
        setSessionRevokedReason(reason);
        setCurrentScreen('LOGIN');
        setSecurityState('SESSION_REVOKED_LOCK');
      },
    });
  }, []);

  // 1. Startup Device Integrity Check (CHECKING_INTEGRITY -> DEVICE_COMPROMISED_LOCK)
  useEffect(() => {
    let isMounted = true;

    async function verifyDevice() {
      try {
        const report = await checkDeviceIntegrity();
        if (!isMounted) return;

        setIntegrityReport(report);
        if (!report.isSecure) {
          setSecurityState('DEVICE_COMPROMISED_LOCK');
        } else {
          setSecurityState('READY');
        }
      } catch {
        if (isMounted) setSecurityState('READY');
      }
    }

    void verifyDevice();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Wire offline queue with apiClient
  useEffect(() => {
    offlineQueue.configure({ apiClient });
  }, [apiClient]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // State 1: Device Integrity Violation Screen
  if (securityState === 'DEVICE_COMPROMISED_LOCK') {
    return (
      <div
        style={{
          padding: '24px',
          fontFamily: 'sans-serif',
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
          fontFamily: 'sans-serif',
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
            upgradeLock.downloadUrl || 'https://internal.fiberops.net/download/mobile-latest.apk'
          }
          style={{
            display: 'inline-block',
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
          fontFamily: 'sans-serif',
          textAlign: 'center',
          color: '#64748b',
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', position: 'relative' }}>
      {toastMessage && (
        <div
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
          onLoginSuccess={(user, tokens) => {
            setCurrentUser(user);
            setSessionRevokedReason(null);
            setSecurityState('READY');
            apiClient.setTokens(tokens);
            setCurrentScreen('TICKET_LIST');
            showToast(`Selamat bertugas, ${user.fullName}!`);
          }}
        />
      )}

      {currentScreen === 'TICKET_LIST' && (
        <div
          style={{ padding: '24px', maxWidth: '480px', margin: '0 auto', fontFamily: 'sans-serif' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Daftar Tiket Lapangan
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
                Teknisi: {currentUser?.fullName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void removeSecureToken('auth_tokens');
                apiClient.setTokens(null);
                setCurrentUser(null);
                setCurrentScreen('LOGIN');
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                color: '#dc2626',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Keluar
            </button>
          </div>
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              background: '#fff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              color: '#64748b',
              fontSize: '13px',
            }}
          >
            Memuat antrean tiket penugasan teknisi...
          </div>
        </div>
      )}

      {currentScreen === 'TICKET_SUBMIT' && selectedTicket && (
        <div
          style={{ padding: '24px', maxWidth: '480px', margin: '0 auto', fontFamily: 'sans-serif' }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            Form Validasi Tiket {selectedTicket.ticketNumber}
          </h2>
          <button
            type="button"
            onClick={() => {
              setSelectedTicket(null);
              setCurrentScreen('TICKET_LIST');
            }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              color: '#475569',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ← Kembali ke Daftar Tiket
          </button>
        </div>
      )}
    </div>
  );
}
