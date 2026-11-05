'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ERROR_CODES, UserTypeEnum } from '@repo/shared';
import { useAuth, useToast } from '@/providers';

export type DemoAccountRole = 'SUPER_ADMIN' | 'ADMIN';

const DEMO_CREDENTIALS: Record<DemoAccountRole, { username: string; password: string }> = {
  SUPER_ADMIN: {
    username: 'superadmin',
    password: 'password123',
  },
  ADMIN: {
    username: 'admin.noc',
    password: 'password123',
  },
};

export function useLogin() {
  const router = useRouter();
  const { loginUser } = useAuth();
  const { showSuccess } = useToast();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(0);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRateLimitSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rateLimitSeconds]);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const fillDemoAccount = useCallback((role: DemoAccountRole) => {
    const account = DEMO_CREDENTIALS[role];
    setUsername(account.username);
    setPassword(account.password);
    setErrorMessage(null);
    setErrorCode(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting || rateLimitSeconds > 0) return;

      setIsSubmitting(true);
      setErrorMessage(null);
      setErrorCode(null);

      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        setErrorCode(ERROR_CODES.VALIDATION_ERROR);
        setErrorMessage('Username dan kata sandi wajib diisi.');
        setIsSubmitting(false);
        return;
      }

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: trimmedUsername,
            password,
          }),
        });

        const json = await res.json().catch(() => null);

        if (res.status === 429) {
          const retryHeader = res.headers.get('Retry-After');
          const parsedHeader = retryHeader ? parseInt(retryHeader, 10) : NaN;
          const fallbackSeconds =
            json?.error?.retryAfter ||
            (json?.meta?.retryAfterMs ? Math.ceil(json.meta.retryAfterMs / 1000) : 60);
          const cooldown =
            !Number.isNaN(parsedHeader) && parsedHeader > 0 ? parsedHeader : fallbackSeconds;

          setRateLimitSeconds(cooldown);
          setErrorCode(ERROR_CODES.RATE_LIMIT_EXCEEDED);
          setErrorMessage(
            'Terlalu banyak percobaan login gagal. Akses dikunci sementara demi keamanan.',
          );
          setIsSubmitting(false);
          return;
        }

        if (res.status === 401) {
          setErrorCode(ERROR_CODES.UNAUTHORIZED);
          setErrorMessage(
            'Kredensial tidak valid. Periksa kembali kombinasi username dan kata sandi Anda.',
          );
          setIsSubmitting(false);
          return;
        }

        if (res.status === 403) {
          setErrorCode(ERROR_CODES.FORBIDDEN);
          setErrorMessage(
            json?.error?.message ||
              'Akses ditolak: Akun dinonaktifkan atau tidak memiliki izin akses Web NOC.',
          );
          setIsSubmitting(false);
          return;
        }

        if (!res.ok || !json?.success) {
          setErrorCode(json?.error?.code || ERROR_CODES.VALIDATION_ERROR);
          setErrorMessage(
            json?.error?.message ||
              'Gagal memverifikasi sesi login. Pastikan format input sudah benar.',
          );
          setIsSubmitting(false);
          return;
        }

        const authData = json.data;
        const userPayload = authData?.user;
        const userRoleStr = String(userPayload?.role || userPayload?.roleName || '').toLowerCase();

        // Platform Role Validation: Block field technicians from Web NOC Dashboard
        if (userPayload?.userType === 'TECHNICIAN' || userRoleStr.includes('teknisi')) {
          await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
          setErrorCode(ERROR_CODES.FORBIDDEN);
          setErrorMessage(
            'Akun Teknisi Lapangan hanya dapat mengakses sistem melalui Aplikasi Mobile FiberOps.',
          );
          setIsSubmitting(false);
          return;
        }

        loginUser({
          id: userPayload.id,
          username: userPayload.username,
          fullName: userPayload.fullName,
          userType: userPayload.userType as UserTypeEnum,
          roleName: userPayload.roleName || userPayload.role,
          hierarchyLevel: userPayload.hierarchyLevel,
          permissions: userPayload.permissions,
          assignedClusters: userPayload.assignedClusters,
        });

        if (authData?.accessToken) {
          try {
            window.localStorage.setItem('fiberops_access_token', authData.accessToken);
          } catch {
            // Ignore storage errors
          }
        }

        showSuccess(
          `Sesi aktif: Selamat bertugas, ${userPayload.fullName || userPayload.username}.`,
        );

        let targetUrl = '/';
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const callbackUrl = params.get('callbackUrl');
          if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
            targetUrl = callbackUrl;
          }
        }

        router.push(targetUrl);
        router.refresh();
      } catch {
        setErrorCode(ERROR_CODES.INTERNAL_ERROR);
        setErrorMessage(
          'Tidak dapat terhubung ke server autentikasi On-Premise. Periksa koneksi jaringan lokal.',
        );
        setIsSubmitting(false);
      }
    },
    [isSubmitting, rateLimitSeconds, username, password, loginUser, showSuccess, router],
  );

  return {
    username,
    setUsername,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    isSubmitting,
    errorMessage,
    errorCode,
    rateLimitSeconds,
    fillDemoAccount,
    handleSubmit,
  };
}

