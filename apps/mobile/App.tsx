import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient, UpgradeRequiredDetails } from './src/api/client';
import { offlineQueue } from './src/sync/offlineQueue';
import { LoginScreen } from './src/screens/LoginScreen';
import { TicketListScreen, MobileTicketItem, SplitterItem } from './src/screens/TicketListScreen';
import { TicketSubmitScreen } from './src/screens/TicketSubmitScreen';
import { CURRENT_MOBILE_APP_VERSION, UserProfile } from '@repo/shared';

type AppScreen = 'LOGIN' | 'TICKET_LIST' | 'TICKET_SUBMIT';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('LOGIN');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<MobileTicketItem | null>(null);
  const [availableSplitters, setAvailableSplitters] = useState<SplitterItem[]>([]);
  const [upgradeLock, setUpgradeLock] = useState<UpgradeRequiredDetails | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize singleton mobile API client
  const apiClient = useMemo(() => {
    return new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'DEVICE-TECH-SM-A54',
      appVersion: CURRENT_MOBILE_APP_VERSION,
      onUpgradeRequired: (details) => {
        setUpgradeLock(details);
      },
    });
  }, []);

  useEffect(() => {
    // Wire offline queue with apiClient for direct upload & submission sync
    offlineQueue.configure({ apiClient });
  }, [apiClient]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // 1. Upgrade Lock Guard Screen (HTTP 426 Upgrade Required - Law 4)
  if (upgradeLock) {
    return {
      type: 'UPGRADE_LOCK_VIEW',
      minVersion: upgradeLock.minVersion,
      currentVersion: upgradeLock.currentVersion,
      message: upgradeLock.message,
      downloadUrl: upgradeLock.downloadUrl || 'https://internal.fiberops.net/download/mobile-latest.apk',
      instructions:
        'Aplikasi ini terkunci demi kepatuhan operasional jaringan ISP. Silakan hubungi Tim NOC atau unduh APK versi terbaru.',
    };
  }

  // 2. Navigation State Router
  return {
    screen: currentScreen,
    user: currentUser,
    toastMessage,
    // Render current active screen
    render: () => {
      switch (currentScreen) {
        case 'LOGIN':
          return LoginScreen({
            apiClient,
            defaultDeviceId: 'DEVICE-TECH-SM-A54',
            onLoginSuccess: (user, tokens) => {
              setCurrentUser(user);
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
