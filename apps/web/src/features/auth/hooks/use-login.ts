'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ERROR_CODES, UserTypeEnum } from '@repo/shared';
import { useAuth, useToast } from '@/providers';

export type DemoAccountRole = 'SUPER_ADMIN' | 'ADMIN' | 'TECHNICIAN';
export type OtpDeliveryStatus = 'IDLE' | 'SENT';

const DEMO_CREDENTIALS: Record<DemoAccountRole, { username: string; password: string }> = {
  SUPER_ADMIN: {
    username: 'superadmin',
    password: 'password123',
  },
  ADMIN: {
    username: 'admin.noc',
    password: 'password123',
  },
  TECHNICIAN: {
    username: 'tech.andi',
    password: 'password123',
  },
};

export function useLogin() {
  const router = useRouter();
  const { loginUser } = useAuth();
  const { showSuccess } = useToast();

  const [username, setUsernameState] = useState<string>('');
  const [password, setPasswordState] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // 2FA Telegram OTP states (Strict Pre-Bound Server Mode)
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [otpCode, setOtpCodeState] = useState<string>('');
  const [otpExpiresSeconds, setOtpExpiresSeconds] = useState<number>(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState<number>(0);
  const [deliveryStatus, setDeliveryStatus] = useState<OtpDeliveryStatus>('IDLE');
  const [maskedChatId, setMaskedChatId] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>('FiberOpsNOCBot');
  const [userNik, setUserNik] = useState<string | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(0);

  // Brute-force rate limit countdown
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRateLimitSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rateLimitSeconds]);

  // 5-minute OTP challenge expiry countdown
  useEffect(() => {
    if (otpExpiresSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setOtpExpiresSeconds((prev) => {
        if (prev <= 1) {
          setErrorCode(ERROR_CODES.OTP_EXPIRED);
          setErrorMessage('Batas waktu kode OTP (5 menit) telah habis. Klik "Kirim OTP" kembali.');
          setPreAuthToken(null);
          setDeliveryStatus('IDLE');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpExpiresSeconds]);

  // 60-second OTP resend cooldown countdown
  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldownSeconds]);

  const setUsername = useCallback((val: string) => {
    setUsernameState(val);
    setPreAuthToken(null);
    setDeliveryStatus('IDLE');
    setOtpExpiresSeconds(0);
  }, []);

  const setPassword = useCallback((val: string) => {
    setPasswordState(val);
    setPreAuthToken(null);
    setDeliveryStatus('IDLE');
    setOtpExpiresSeconds(0);
  }, []);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const setOtpCode = useCallback((raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 6);
    setOtpCodeState(digitsOnly);
  }, []);

  const fillDemoAccount = useCallback((role: DemoAccountRole) => {
    const account = DEMO_CREDENTIALS[role];
    setUsernameState(account.username);
    setPasswordState(account.password);
    setPreAuthToken(null);
    setOtpCodeState('');
    setDeliveryStatus('IDLE');
    setErrorMessage(null);
    setErrorCode(null);
  }, []);

  const completeWebSession = useCallback(
    (authData: {
      accessToken?: string;
      user: {
        id: string;
        username: string;
        fullName: string;
        userType: string;
        role?: string;
        roleName?: string;
        hierarchyLevel: number;
        permissions: string[];
        assignedClusters: string[];
      };
    }) => {
      const userPayload = authData.user;

      loginUser({
        id: userPayload.id,
        username: userPayload.username,
        fullName: userPayload.fullName,
        userType: userPayload.userType as UserTypeEnum,
        roleName: userPayload.roleName || userPayload.role || 'Admin',
        hierarchyLevel: userPayload.hierarchyLevel,
        permissions: userPayload.permissions,
        assignedClusters: userPayload.assignedClusters,
      });

      if (authData.accessToken) {
        try {
          window.localStorage.setItem('fiberops_access_token', authData.accessToken);
        } catch {
          // Ignore storage errors
        }
      }

      showSuccess(
        `Verifikasi 2FA Berhasil: Selamat bertugas, ${userPayload.fullName || userPayload.username}.`,
      );

      const isVendor = userPayload.userType === 'TECHNICIAN';
      let targetUrl = isVendor ? '/vendor' : '/';
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const callbackUrl = params.get('callbackUrl');
        if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
          targetUrl = isVendor && !callbackUrl.startsWith('/vendor') ? '/vendor' : callbackUrl;
        }
      }

      router.push(targetUrl);
      router.refresh();
    },
    [loginUser, router, showSuccess],
  );

  /**
   * Requests or resends a 6-digit OTP to the operator's server-bound Telegram Chat ID.
   */
  const requestOtpCode = useCallback(async (): Promise<string | null> => {
    if (isRequestingOtp || rateLimitSeconds > 0 || resendCooldownSeconds > 0) {
      return preAuthToken;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorCode(ERROR_CODES.VALIDATION_ERROR);
      setErrorMessage('Isi Username Operator dan Kata Sandi terlebih dahulu untuk meminta OTP.');
      return null;
    }

    setIsRequestingOtp(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      if (preAuthToken) {
        const res = await fetch('/api/v1/auth/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preAuthToken }),
        });

        const json = await res.json().catch(() => null);

        if (res.status === 429) {
          const retryAfter = json?.error?.retryAfter || 60;
          setResendCooldownSeconds(retryAfter);
          setErrorCode(json?.error?.code || ERROR_CODES.OTP_COOLDOWN_ACTIVE);
          setErrorMessage(
            json?.error?.message || `Harap tunggu ${retryAfter} detik sebelum meminta OTP baru.`,
          );
          return preAuthToken;
        }

        if (res.ok && json?.success) {
          const data = json.data;
          setPreAuthToken(data.preAuthToken);
          setOtpExpiresSeconds(data.expiresIn || 300);
          setResendCooldownSeconds(data.resendCooldown ?? 60);
          setDeliveryStatus('SENT');
          setMaskedChatId(data.maskedChatId || null);
          setBotUsername(data.botUsername || 'FiberOpsNOCBot');

          showSuccess(
            `Kode OTP 6-digit baru telah dikirim ke Telegram terdaftar (${data.maskedChatId || '@FiberOpsNOCBot'}).`,
          );
          return data.preAuthToken as string;
        }
      }

      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        return null;
      }

      if (res.status === 401) {
        setErrorCode(ERROR_CODES.UNAUTHORIZED);
        setErrorMessage(
          'Kredensial tidak valid. Periksa kembali kombinasi username dan kata sandi Anda.',
        );
        return null;
      }

      if (res.status === 403) {
        setErrorCode(json?.error?.code || ERROR_CODES.FORBIDDEN);
        setErrorMessage(
          json?.error?.message ||
            'Akses ditolak: Akun dinonaktifkan atau tidak memiliki izin akses Web NOC.',
        );
        return null;
      }

      if (!res.ok || !json?.success) {
        setErrorCode(json?.error?.code || ERROR_CODES.VALIDATION_ERROR);
        setErrorMessage(
          json?.error?.message || 'Gagal memverifikasi kredensial untuk pengiriman OTP.',
        );
        return null;
      }

      const authData = json.data;
      setPreAuthToken(authData.preAuthToken);
      setOtpExpiresSeconds(authData.expiresIn || 300);
      setResendCooldownSeconds(authData.resendCooldown ?? 60);
      setDeliveryStatus('SENT');
      setMaskedChatId(authData.maskedChatId || null);
      setBotUsername(authData.botUsername || 'FiberOpsNOCBot');
      setUserNik(authData.user?.nik || null);

      showSuccess(
        `Kode OTP 6-digit telah dikirim ke Telegram terdaftar (${authData.maskedChatId || '@FiberOpsNOCBot'}).`,
      );

      return authData.preAuthToken as string;
    } catch {
      setErrorCode(ERROR_CODES.INTERNAL_ERROR);
      setErrorMessage(
        'Tidak dapat terhubung ke server autentikasi On-Premise. Periksa koneksi jaringan lokal.',
      );
      return null;
    } finally {
      setIsRequestingOtp(false);
    }
  }, [
    isRequestingOtp,
    rateLimitSeconds,
    resendCooldownSeconds,
    username,
    password,
    preAuthToken,
    showSuccess,
  ]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting || isRequestingOtp || rateLimitSeconds > 0) return;

      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        setErrorCode(ERROR_CODES.VALIDATION_ERROR);
        setErrorMessage('Username dan kata sandi wajib diisi.');
        return;
      }

      const cleanOtp = otpCode.trim();

      if (!preAuthToken) {
        await requestOtpCode();
        return;
      }

      if (!/^\d{6}$/.test(cleanOtp)) {
        setErrorCode(ERROR_CODES.VALIDATION_ERROR);
        setErrorMessage('Masukkan 6 digit angka Kode OTP dari Bot Telegram Anda.');
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);
      setErrorCode(null);

      try {
        const res = await fetch('/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            preAuthToken,
            otpCode: cleanOtp,
          }),
        });

        const json = await res.json().catch(() => null);

        if (res.status === 429) {
          const fallbackSeconds = json?.error?.retryAfter || 60;
          setRateLimitSeconds(fallbackSeconds);
          setErrorCode(ERROR_CODES.RATE_LIMIT_EXCEEDED);
          setErrorMessage(
            json?.error?.message ||
              'Terlalu banyak percobaan verifikasi OTP. Akses dikunci sementara.',
          );
          setIsSubmitting(false);
          return;
        }

        if (!res.ok || !json?.success) {
          const code = json?.error?.code || ERROR_CODES.OTP_INVALID;
          const message =
            json?.error?.message || 'Kode OTP tidak sesuai atau telah kedaluwarsa.';

          if (code === ERROR_CODES.OTP_MAX_ATTEMPTS || code === ERROR_CODES.OTP_EXPIRED) {
            setPreAuthToken(null);
            setOtpCodeState('');
            setDeliveryStatus('IDLE');
            setOtpExpiresSeconds(0);
          }

          setErrorCode(code);
          setErrorMessage(message);
          setIsSubmitting(false);
          return;
        }

        completeWebSession(json.data);
      } catch {
        setErrorCode(ERROR_CODES.INTERNAL_ERROR);
        setErrorMessage('Gagal menghubungi server untuk verifikasi OTP.');
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      isRequestingOtp,
      rateLimitSeconds,
      username,
      password,
      otpCode,
      preAuthToken,
      requestOtpCode,
      completeWebSession,
    ],
  );

  return {
    username,
    setUsername,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    preAuthToken,
    otpCode,
    setOtpCode,
    otpExpiresSeconds,
    resendCooldownSeconds,
    deliveryStatus,
    maskedChatId,
    botUsername,
    userNik,
    isRequestingOtp,
    isSubmitting,
    errorMessage,
    errorCode,
    rateLimitSeconds,
    fillDemoAccount,
    requestOtpCode,
    handleSubmit,
  };
}
