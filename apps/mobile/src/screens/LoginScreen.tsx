import React, { useState } from 'react';
import { ApiClient, MobileSessionTokens } from '../api/client';
import { CURRENT_MOBILE_APP_VERSION, UserProfile } from '@repo/shared';

export interface LoginScreenProps {
  apiClient: ApiClient;
  onLoginSuccess: (user: UserProfile, tokens: MobileSessionTokens) => void;
  defaultDeviceId?: string;
  sessionRevokedReason?: string | null;
}

export function LoginScreen({
  apiClient,
  onLoginSuccess,
  defaultDeviceId = 'DEVICE-TECH-SM-A54',
  sessionRevokedReason = null,
}: LoginScreenProps) {
  const [username, setUsername] = useState('andi.pratama');
  const [password, setPassword] = useState('');
  const [deviceId, setDeviceId] = useState(defaultDeviceId);
  const [deviceModel, setDeviceModel] = useState('Samsung Galaxy A54 5G');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib diisi.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

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

  return {
    state: {
      username,
      password,
      deviceId,
      deviceModel,
      appVersion: CURRENT_MOBILE_APP_VERSION,
      isLoading,
      errorMessage,
      sessionRevokedReason,
      isAppLocked: apiClient.isLocked(),
    },
    actions: {
      setUsername,
      setPassword,
      setDeviceId,
      setDeviceModel,
      submit: handleSubmit,
    },
  };
}
