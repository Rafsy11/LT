'use client';

import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ERROR_CODES,
  STANDARD_ERROR_MESSAGES,
  UserTypeEnum,
} from '@repo/shared';
import { useRateLimitCountdown } from '@/hooks/use-rate-limit-countdown';
import { webApiClient } from '@/lib/api-client';
import { ERROR_CODE_FRIENDLY_TITLES } from '@/lib/error-dictionary';
import { normalizeAppError, type AppError } from '@/lib/error-normalizer';
import { useAuth, useToast } from '@/providers';

export type OtpDeliveryStatus = 'IDLE' | 'SENT';
export type LoginFieldKey = 'username' | 'password' | 'otpCode';

interface OtpChallengeResponse {
  preAuthToken: string;
  expiresIn?: number;
  resendCooldown?: number;
  maskedChatId?: string | null;
  botUsername?: string;
  user?: { nik?: string | null };
}

interface VerifiedSessionResponse {
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
}

export function resolveSafeRedirectTarget(search: string): string {
  const params = new URLSearchParams(search);
  const candidate =
    params.get('next') || params.get('redirect') || params.get('callbackUrl') || '';
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return '/';
  }
  if (/[\\\s]/.test(candidate) || /%5c/i.test(candidate)) {
    return '/';
  }
  for (let i = 0; i < candidate.length; i++) {
    const code = candidate.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return '/';
    }
  }
  try {
    const parsed = new URL(candidate, 'https://fiberops.local');
    if (
      parsed.origin !== 'https://fiberops.local' ||
      parsed.pathname.startsWith('//') ||
      parsed.pathname === '/login' ||
      parsed.pathname.startsWith('/login/')
    ) {
      return '/';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

export function useLogin() {
  const router = useRouter();
  const { loginUser } = useAuth();
  const { showSuccess } = useToast();

  const [username, setUsernameState] = useState<string>('');
  const [password, setPasswordState] = useState<string>('');

  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  // 2FA Telegram OTP states (Strict Pre-Bound Server Mode)
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [otpCode, setOtpCodeState] = useState<string>('');
  const [otpExpiresSeconds, setOtpExpiresSeconds] = useState<number>(0);
  const [deliveryStatus, setDeliveryStatus] = useState<OtpDeliveryStatus>('IDLE');
  const [maskedChatId, setMaskedChatId] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>('FiberOpsNOCBot');
  const [userNik, setUserNik] = useState<string | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorRefCode, setErrorRefCode] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginFieldKey, string>>>({});

  const rateLimit = useRateLimitCountdown();
  const resendCooldown = useRateLimitCountdown();

  // Scrub any accidentally leaked credentials (?username=...&password=...&otpCode=...) from URL bar on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('username') || params.has('password') || params.has('otpCode')) {
      params.delete('username');
      params.delete('password');
      params.delete('otpCode');
      const cleanQuery = params.toString();
      const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, []);

  // 5-minute OTP challenge expiry countdown
  useEffect(() => {
    if (otpExpiresSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setOtpExpiresSeconds((prev) => {
        if (prev <= 1) {
          setErrorCode(ERROR_CODES.OTP_EXPIRED);
          setErrorTitle(ERROR_CODE_FRIENDLY_TITLES[ERROR_CODES.OTP_EXPIRED] || 'Masa Berlaku Kode OTP Habis');
          setErrorMessage('Masa berlaku kode OTP telah habis. Pilih "Kirim OTP" untuk meminta kode baru.');
          setErrorRefCode(null);
          setCanRetry(false);
          setPreAuthToken(null);
          setDeliveryStatus('IDLE');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpExpiresSeconds]);

  const clearErrors = useCallback(() => {
    setErrorMessage(null);
    setErrorTitle(null);
    setErrorCode(null);
    setErrorRefCode(null);
    setCanRetry(false);
  }, []);

  const clearFieldError = useCallback((field: LoginFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const applyAppError = useCallback(
    (err: unknown, options: { isResend?: boolean } = {}) => {
      const appErr: AppError = normalizeAppError(err);

      if (appErr.fieldErrors) {
        const mapped: Partial<Record<LoginFieldKey, string>> = {};
        if (appErr.fieldErrors.username) mapped.username = appErr.fieldErrors.username;
        if (appErr.fieldErrors.password) mapped.password = appErr.fieldErrors.password;
        if (appErr.fieldErrors.otpCode) mapped.otpCode = appErr.fieldErrors.otpCode;
        if (Object.keys(mapped).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...mapped }));
        }
      }

      if (appErr.category === 'RATE_LIMITED') {
        const waitSec = appErr.retryAfterSeconds || 60;
        if (options.isResend || appErr.code === ERROR_CODES.OTP_COOLDOWN_ACTIVE) {
          resendCooldown.startCooldown(waitSec);
        } else {
          rateLimit.startCooldown(waitSec);
        }
      }

      if (
        appErr.code === ERROR_CODES.OTP_MAX_ATTEMPTS ||
        appErr.code === ERROR_CODES.OTP_EXPIRED
      ) {
        setPreAuthToken(null);
        setOtpCodeState('');
        setDeliveryStatus('IDLE');
        setOtpExpiresSeconds(0);
      }

      const resolvedMessage =
        appErr.statusCode === 401 && appErr.code === ERROR_CODES.INVALID_CREDENTIALS
          ? STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS
          : appErr.message;

      setErrorCode(appErr.code);
      setErrorTitle(appErr.title);
      setErrorMessage(resolvedMessage);
      setErrorRefCode(
        appErr.category === 'SERVER_ERROR' || appErr.statusCode >= 500 ? appErr.refCode : null,
      );
      setCanRetry(appErr.category === 'TIMEOUT' || appErr.category === 'OFFLINE');
    },
    [rateLimit, resendCooldown],
  );

  const setUsername = useCallback(
    (val: string) => {
      setUsernameState((prev) => {
        if (prev !== val) {
          setPreAuthToken(null);
          setDeliveryStatus('IDLE');
          setOtpExpiresSeconds(0);
          setOtpCodeState('');
        }
        return val;
      });
      clearFieldError('username');
    },
    [clearFieldError],
  );

  const setPassword = useCallback(
    (val: string) => {
      setPasswordState((prev) => {
        if (prev !== val) {
          setPreAuthToken(null);
          setDeliveryStatus('IDLE');
          setOtpExpiresSeconds(0);
          setOtpCodeState('');
        }
        return val;
      });
      clearFieldError('password');
    },
    [clearFieldError],
  );

  const setOtpCode = useCallback(
    (raw: string) => {
      const digitsOnly = raw.replace(/\D/g, '').slice(0, 6);
      setOtpCodeState(digitsOnly);
      clearFieldError('otpCode');
    },
    [clearFieldError],
  );

  const completeWebSession = useCallback(
    (authData: VerifiedSessionResponse) => {
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

      showSuccess(
        `Verifikasi 2FA Berhasil: Selamat bertugas, ${userPayload.fullName || userPayload.username}.`,
      );

      const targetUrl =
        typeof window !== 'undefined'
          ? resolveSafeRedirectTarget(window.location.search)
          : '/';

      router.replace(targetUrl);
    },
    [loginUser, router, showSuccess],
  );

  const resolveCurrentCredentials = useCallback((): {
    resolvedUsername: string;
    resolvedPassword: string;
  } => {
    const domUsername = usernameInputRef.current?.value ?? '';
    const domPassword = passwordInputRef.current?.value ?? '';
    const resolvedUsername = (username || domUsername).trim();
    const resolvedPassword = password || domPassword;

    if (!username && domUsername) {
      setUsernameState(domUsername);
    }
    if (!password && domPassword) {
      setPasswordState(domPassword);
    }

    return { resolvedUsername, resolvedPassword };
  }, [username, password]);

  const validateCredentials = useCallback(
    (candidateUsername: string, candidatePassword: string): boolean => {
      const nextErrors: Partial<Record<LoginFieldKey, string>> = {};
      if (!candidateUsername.trim()) {
        nextErrors.username = 'Username operator perlu diisi.';
      }
      if (!candidatePassword) {
        nextErrors.password = 'Kata sandi perlu diisi.';
      }
      setFieldErrors((prev) => {
        const updated = { ...prev };
        if (nextErrors.username) updated.username = nextErrors.username;
        else delete updated.username;
        if (nextErrors.password) updated.password = nextErrors.password;
        else delete updated.password;
        return updated;
      });
      return Object.keys(nextErrors).length === 0;
    },
    [],
  );

  /**
   * Requests or resends a 6-digit OTP to the operator's server-bound Telegram Chat ID.
   */
  const requestOtpCode = useCallback(async (): Promise<string | null> => {
    if (isRequestingOtp || rateLimit.isLimited || resendCooldown.isLimited) {
      return preAuthToken;
    }

    const { resolvedUsername, resolvedPassword } = resolveCurrentCredentials();
    if (!validateCredentials(resolvedUsername, resolvedPassword)) {
      clearErrors();
      if (!resolvedUsername) {
        usernameInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return null;
    }

    setIsRequestingOtp(true);
    clearErrors();

    try {
      if (preAuthToken) {
        const res = await webApiClient.post<OtpChallengeResponse>(
          '/api/v1/auth/resend-otp',
          { preAuthToken },
          { skipAuthRedirect: true, timeoutMs: 15_000 },
        );

        if (res.success && res.data) {
          const data = res.data;
          setPreAuthToken(data.preAuthToken);
          setOtpExpiresSeconds(data.expiresIn || 300);
          resendCooldown.startCooldown(data.resendCooldown ?? 60);
          setDeliveryStatus('SENT');
          setMaskedChatId(data.maskedChatId || null);
          setBotUsername(data.botUsername || 'FiberOpsNOCBot');

          showSuccess(
            `Kode OTP 6-digit baru telah dikirim ke Telegram terdaftar (${data.maskedChatId || '@FiberOpsNOCBot'}).`,
          );
          if (typeof window !== 'undefined') {
            window.setTimeout(() => otpInputRef.current?.focus(), 40);
          }
          return data.preAuthToken;
        }
        return null;
      }

      const res = await webApiClient.post<OtpChallengeResponse>(
        '/api/v1/auth/login',
        { username: resolvedUsername, password: resolvedPassword },
        { skipAuthRedirect: true, timeoutMs: 15_000 },
      );

      if (res.success && res.data) {
        const authData = res.data;
        setPreAuthToken(authData.preAuthToken);
        setOtpExpiresSeconds(authData.expiresIn || 300);
        resendCooldown.startCooldown(authData.resendCooldown ?? 60);
        setDeliveryStatus('SENT');
        setMaskedChatId(authData.maskedChatId || null);
        setBotUsername(authData.botUsername || 'FiberOpsNOCBot');
        setUserNik(authData.user?.nik || null);

        showSuccess(
          `Kode OTP 6-digit telah dikirim ke Telegram terdaftar (${authData.maskedChatId || '@FiberOpsNOCBot'}).`,
        );
        if (typeof window !== 'undefined') {
          window.setTimeout(() => otpInputRef.current?.focus(), 40);
        }

        return authData.preAuthToken;
      }

      return null;
    } catch (err: unknown) {
      applyAppError(err, { isResend: Boolean(preAuthToken) });
      return null;
    } finally {
      setIsRequestingOtp(false);
    }
  }, [
    isRequestingOtp,
    rateLimit.isLimited,
    resendCooldown,
    preAuthToken,
    resolveCurrentCredentials,
    validateCredentials,
    clearErrors,
    showSuccess,
    applyAppError,
  ]);

  const verifyOtpSubmission = useCallback(async () => {
    if (isSubmitting || isRequestingOtp || rateLimit.isLimited) return;

    const { resolvedUsername, resolvedPassword } = resolveCurrentCredentials();
    if (!validateCredentials(resolvedUsername, resolvedPassword)) {
      clearErrors();
      if (!resolvedUsername) {
        usernameInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return;
    }

    const domOtp = otpInputRef.current?.value ?? '';
    const cleanOtp = (otpCode || domOtp).replace(/\D/g, '').slice(0, 6);
    if (!otpCode && cleanOtp) {
      setOtpCodeState(cleanOtp);
    }

    if (!preAuthToken) {
      await requestOtpCode();
      return;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      clearErrors();
      setFieldErrors((prev) => ({
        ...prev,
        otpCode: 'Masukkan 6 digit angka kode OTP yang dikirim ke Telegram Anda.',
      }));
      otpInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    clearErrors();

    try {
      const res = await webApiClient.post<VerifiedSessionResponse>(
        '/api/v1/auth/verify-otp',
        { preAuthToken, otpCode: cleanOtp },
        { skipAuthRedirect: true, timeoutMs: 15_000 },
      );

      if (res.success && res.data) {
        completeWebSession(res.data);
        return;
      }
      setIsSubmitting(false);
    } catch (err: unknown) {
      applyAppError(err);
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    isRequestingOtp,
    rateLimit.isLimited,
    resolveCurrentCredentials,
    validateCredentials,
    otpCode,
    preAuthToken,
    requestOtpCode,
    clearErrors,
    completeWebSession,
    applyAppError,
  ]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await verifyOtpSubmission();
    },
    [verifyOtpSubmission],
  );

  const retryLastAction = useCallback(async () => {
    if (preAuthToken && /^\d{6}$/.test(otpCode.trim())) {
      await verifyOtpSubmission();
    } else {
      await requestOtpCode();
    }
  }, [preAuthToken, otpCode, verifyOtpSubmission, requestOtpCode]);

  return {
    username,
    setUsername,
    password,
    setPassword,
    usernameInputRef,
    passwordInputRef,
    otpInputRef,
    preAuthToken,
    otpCode,
    setOtpCode,
    otpExpiresSeconds,
    resendCooldownSeconds: resendCooldown.remainingSeconds,
    deliveryStatus,
    maskedChatId,
    botUsername,
    userNik,
    isRequestingOtp,
    isSubmitting,
    errorMessage,
    errorTitle,
    errorCode,
    errorRefCode,
    canRetry,
    fieldErrors,
    rateLimitSeconds: rateLimit.remainingSeconds,
    requestOtpCode,
    retryLastAction,
    handleSubmit,
  };
}
