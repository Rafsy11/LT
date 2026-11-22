'use client';

import React from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { formatRateLimitDuration, formatRetryCountdownMessage } from '@/lib/error-dictionary';
import { useLogin } from '../hooks/use-login';
import { useMobileDevToolsGuard } from '../hooks/use-devtools-detector';
import { MobileDevToolsGuard } from './mobile-devtools-guard';
import '@/styles/features/auth.css';

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LoginView() {
  const {
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
    resendCooldownSeconds,
    deliveryStatus,
    maskedChatId,
    botUsername,
    userNik,
    isRequestingOtp,
    isSubmitting,
    errorMessage,
    errorTitle,
    errorRefCode,
    canRetry,
    fieldErrors,
    rateLimitSeconds,
    requestOtpCode,
    retryLastAction,
    handleSubmit,
  } = useLogin();

  const { isBlocked: isDevToolsBlocked, recheck: recheckDevTools } = useMobileDevToolsGuard();
  const isLocked = isSubmitting || rateLimitSeconds > 0 || isDevToolsBlocked;

  return (
    <main id="main-content" className="auth-page" aria-label="Portal Kendali NOC FiberOps">
      <MobileDevToolsGuard isBlocked={isDevToolsBlocked} onRecheck={recheckDevTools}>
        <article className="auth-card">
          <header className="auth-header">
            <div className="auth-brand-bar">
              <Image
                src="/assets/Lintasarta-Icon.svg"
                alt="Lintasarta"
                width={48}
                height={48}
                priority
                className="auth-brand-logo"
              />
            </div>
            <h1 className="auth-title">Portal Kendali NOC FiberOps</h1>
          </header>

          {(errorMessage || rateLimitSeconds > 0) && (
            <output
              role="alert"
              aria-live="assertive"
              className={`auth-alert ${rateLimitSeconds > 0 ? 'auth-alert-warning' : 'auth-alert-error'}`}
            >
              <span className="auth-alert-icon" aria-hidden="true">
                <Icon name={rateLimitSeconds > 0 ? 'clock' : 'alert'} size={16} />
              </span>
              <span className="auth-alert-content">
                <strong className="auth-alert-code">
                  {rateLimitSeconds > 0
                    ? `Mohon Tunggu Sebentar (${formatRateLimitDuration(rateLimitSeconds)})`
                    : errorTitle || 'Autentikasi Belum Berhasil'}
                </strong>
                <span className="auth-alert-message">
                  {rateLimitSeconds > 0
                    ? formatRetryCountdownMessage(
                        rateLimitSeconds,
                        'Terlalu banyak percobaan masuk dalam waktu singkat',
                      )
                    : errorMessage}
                </span>
                {errorRefCode && <span className="connection-banner-ref">Ref: {errorRefCode}</span>}
                {canRetry && rateLimitSeconds === 0 && (
                  <div className="toast-action-row">
                    <button
                      type="button"
                      className="toast-action-btn"
                      onClick={() => void retryLastAction()}
                      disabled={isLocked || isRequestingOtp}
                    >
                      <Icon name="refresh" size={13} />
                      <span>Coba Lagi</span>
                    </button>
                  </div>
                )}
              </span>
            </output>
          )}

          <form
            className="auth-form"
            method="post"
            action="/login"
            onSubmit={handleSubmit}
            noValidate
          >
            <fieldset className="auth-fieldset" disabled={isLocked}>
              <div className="auth-field">
                <label htmlFor="auth-username" className="auth-label">
                  Username Operator
                </label>
                <div
                  className={`auth-input-wrap ${fieldErrors.username ? 'auth-input-wrap--invalid' : ''}`}
                >
                  <span className="auth-input-icon" aria-hidden="true">
                    <Icon name="user" size={16} />
                  </span>
                  <input
                    ref={usernameInputRef}
                    id="auth-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    aria-invalid={Boolean(fieldErrors.username)}
                    aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined}
                    placeholder="Masukkan username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="auth-input"
                  />
                </div>
                <FieldError id="auth-username-error" message={fieldErrors.username} />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password" className="auth-label">
                  Kata Sandi
                </label>
                <div
                  className={`auth-input-wrap ${fieldErrors.password ? 'auth-input-wrap--invalid' : ''}`}
                >
                  <span className="auth-input-icon" aria-hidden="true">
                    <Icon name="lock" size={16} />
                  </span>
                  <input
                    ref={passwordInputRef}
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                    placeholder="Masukkan kata sandi"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="auth-input"
                  />
                </div>
                <FieldError id="auth-password-error" message={fieldErrors.password} />
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="auth-otp-code" className="auth-label">
                    Kode OTP Telegram (6 Digit)
                  </label>
                  {otpExpiresSeconds > 0 && (
                    <span className="auth-otp-timer" title="Masa berlaku kode OTP">
                      <Icon name="clock" size={12} />
                      <span>{formatCountdown(otpExpiresSeconds)}</span>
                    </span>
                  )}
                </div>

                <div className="auth-otp-inline-row">
                  <div
                    className={`auth-input-wrap auth-otp-input-wrap ${fieldErrors.otpCode ? 'auth-input-wrap--invalid' : ''}`}
                  >
                    <span className="auth-input-icon" aria-hidden="true">
                      <Icon name="shield" size={16} />
                    </span>
                    <input
                      ref={otpInputRef}
                      id="auth-otp-code"
                      name="otpCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="\d{6}"
                      aria-invalid={Boolean(fieldErrors.otpCode)}
                      aria-describedby={fieldErrors.otpCode ? 'auth-otp-error' : undefined}
                      placeholder="6 digit OTP"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="auth-input auth-otp-inline-input"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => void requestOtpCode()}
                    disabled={isLocked || isRequestingOtp || resendCooldownSeconds > 0}
                    className="auth-request-otp-btn"
                  >
                    <Icon name="send" size={14} />
                    <span>
                      {isRequestingOtp
                        ? 'Mengirim...'
                        : resendCooldownSeconds > 0
                          ? `Tunggu (${formatRateLimitDuration(resendCooldownSeconds)})`
                          : preAuthToken
                            ? 'Kirim Ulang'
                            : 'Kirim OTP'}
                    </span>
                  </button>
                </div>
                <FieldError id="auth-otp-error" message={fieldErrors.otpCode} />

                {deliveryStatus === 'SENT' && (
                  <p className="auth-otp-hint auth-otp-hint-sent">
                    Kode OTP telah dikirim oleh <strong>@{botUsername}</strong> ke Telegram
                    terdaftar
                    {maskedChatId ? ` (${maskedChatId})` : ''}
                    {userNik ? ` untuk NIK: ${userNik}` : ''}.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={isLocked || isRequestingOtp}
              >
                <Icon name="shield" size={16} />
                <span>
                  {rateLimitSeconds > 0
                    ? `Terkunci Sementara (${formatRateLimitDuration(rateLimitSeconds)})`
                    : isSubmitting
                      ? 'Memverifikasi OTP & Sesi...'
                      : isRequestingOtp
                        ? 'Mengirim OTP ke Telegram...'
                        : preAuthToken || otpCode.trim().length > 0
                          ? 'Verifikasi OTP & Masuk'
                          : 'Masuk'}
                </span>
              </button>
            </fieldset>
          </form>
        </article>
      </MobileDevToolsGuard>

      <footer className="auth-meta">
        <span>Autentikasi 2FA Telegram • Sesi Aman Terenkripsi</span>
        <span className="auth-meta-divider" aria-hidden="true">
          |
        </span>
        <span>Single Source of Truth FTTH v1.0.0</span>
      </footer>
    </main>
  );
}
