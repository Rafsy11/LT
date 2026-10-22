import { useState, useEffect, useMemo } from 'react';
import { ApiClient, UpgradeRequiredDetails } from './src/api/client';
import { offlineQueue } from './src/sync/offlineQueue';
import { LoginScreen } from './src/screens/LoginScreen';
import { TicketListScreen, MobileTicketItem, SplitterItem } from './src/screens/TicketListScreen';
import { TicketSubmitScreen } from './src/screens/TicketSubmitScreen';
import { checkDeviceIntegrity, DeviceIntegrityReport, removeSecureToken } from './src/security/deviceIntegrity';
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
    return {
      type: 'DEVICE_COMPROMISED_LOCK_VIEW',
      title: 'Perangkat Tidak Memenuhi Standar Keamanan',
      message:
        'Aplikasi FiberOps ditolak berjalan pada perangkat yang terdeteksi rooted, emulator, atau memiliki lingkungan debug aktif demi menjaga kerahasiaan topologi jaringan ISP.',
      violations: integrityReport?.violations || ['Root binary detected'],
      checkedAt: integrityReport?.checkedAt || new Date().toISOString(),
    };
  }

  // State 2: App Upgrade Required Screen (HTTP 426)
  if (securityState === 'UPGRADE_REQUIRED_LOCK' && upgradeLock) {
    return {
      type: 'UPGRADE_LOCK_VIEW',
      minVersion: upgradeLock.minVersion,
      currentVersion: upgradeLock.currentVersion,
      message: upgradeLock.message,
      downloadUrl:
        upgradeLock.downloadUrl || 'https://internal.fiberops.net/download/mobile-latest.apk',
      instructions:
        'Aplikasi ini terkunci demi kepatuhan operasional jaringan ISP. Silakan hubungi Tim NOC atau unduh APK versi terbaru.',
    };
  }

  // State 3: Checking Integrity Loading Screen
  if (securityState === 'CHECKING_INTEGRITY') {
    return {
      type: 'CHECKING_INTEGRITY_VIEW',
      message: 'Memeriksa integritas keamanan perangkat mobile...',
    };
  }

  // State 4: Navigation State Router (READY & SESSION_REVOKED_LOCK banner)
  return {
    screen: currentScreen,
    securityState,
    user: currentUser,
    toastMessage,
    sessionRevokedReason,
    render: () => {
      switch (currentScreen) {
        case 'LOGIN':
          return LoginScreen({
            apiClient,
            defaultDeviceId: 'DEVICE-TECH-SM-A54',
            sessionRevokedReason,
            onLoginSuccess: (user, tokens) => {
              setCurrentUser(user);
              setSessionRevokedReason(null);
              setSecurityState('READY');
              apiClient.setTokens(tokens);
              setCurrentScreen('TICKET_LIST');
              showToast(`Selamat bertugas, ${user.fullName}!`);
            },
          });

        case 'TICKET_LIST':
          return TicketListScreen({
            apiClient,
            onSelectTicket: (ticket, splitters) => {
              setSelectedTicket(ticket);
              setAvailableSplitters(splitters);
              setCurrentScreen('TICKET_SUBMIT');
            },
            onLogout: () => {
              void removeSecureToken('auth_tokens');
              apiClient.setTokens(null);
              setCurrentUser(null);
              setCurrentScreen('LOGIN');
            },
          });

        case 'TICKET_SUBMIT':
          if (!selectedTicket) {
            setCurrentScreen('TICKET_LIST');
            return null;
          }
          return TicketSubmitScreen({
            ticket: selectedTicket,
            splitters: availableSplitters,
            apiClient,
            onSubmitSuccess: (result) => {
              showToast(result.message);
              setSelectedTicket(null);
              setCurrentScreen('TICKET_LIST');
            },
            onCancel: () => {
              setSelectedTicket(null);
              setCurrentScreen('TICKET_LIST');
            },
          });
      }
    },
  };
}
