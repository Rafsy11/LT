'use client';

import React from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { useLogin } from '../hooks/use-login';
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
    requestOtpCode,
    handleSubmit,
  } = useLogin();

  const isLocked = isSubmitting || rateLimitSeconds > 0;

  return (
    <main id="main-content" className="auth-page" aria-label="Portal Kendali NOC FiberOps">
      <h1 className="sr-only">Masuk ke Portal Kendali NOC FiberOps</h1>
      <article className="auth-card">
        <header className="auth-header">
          <div className="auth-brand-bar">
            <Image
              src="/assets/Lintasarta-Icon.svg"
              alt="Lintasarta"
              width={112}
              height={112}
              priority
              className="auth-brand-logo"
            />
          </div>
        </header>

        {(errorMessage || rateLimitSeconds > 0) && (
          <output
            role="alert"
            aria-live="assertive"
            className={`auth-alert ${rateLimitSeconds > 0 ? 'auth-alert-warning' : 'auth-alert-error'}`}
          >
            <span className="auth-alert-icon" aria-hidden="true">
              <Icon name="alert" size={16} />
            </span>
            <span className="auth-alert-content">
              <strong className="auth-alert-code">
                {rateLimitSeconds > 0
                  ? `PROTEKSI BRUTE-FORCE AKTIF (${rateLimitSeconds}d)`
                  : errorCode || 'AUTENTIKASI GAGAL'}
              </strong>
              <span className="auth-alert-message">
                {rateLimitSeconds > 0
                  ? `${errorMessage || 'Batas percobaan terlampaui.'} Silakan coba kembali dalam ${rateLimitSeconds} detik.`
                  : errorMessage}
              </span>
            </span>
          </output>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <fieldset className="auth-fieldset" disabled={isLocked}>
            <div className="auth-field">
              <label htmlFor="auth-username" className="auth-label">
                Username Operator
              </label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true">
                  <Icon name="user" size={16} />
                </span>
                <input
                  id="auth-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="superadmin, admin.noc, atau tech.andi"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password" className="auth-label">
                Kata Sandi
              </label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true">
                  <Icon name="lock" size={16} />
                </span>
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Masukkan kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input auth-input-password"
                />
                <button
                  type="button"
                  onClick={toggleShowPassword}
                  className="auth-password-toggle"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
                </button>
              </div>
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
                <div className="auth-input-wrap auth-otp-input-wrap">
                  <span className="auth-input-icon" aria-hidden="true">
                    <Icon name="shield" size={16} />
                  </span>
                  <input
                    id="auth-otp-code"
                    name="otpCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="6 digit OTP"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="auth-input auth-otp-inline-input"
                  />
                </div>

                <button
                  type="button"
                  onClick={requestOtpCode}
                  disabled={
                    isLocked ||
                    isRequestingOtp ||
                    resendCooldownSeconds > 0 ||
                    !username.trim() ||
                    !password
                  }
                  className="auth-request-otp-btn"
                >
                  <Icon name="send" size={14} />
                  <span>
                    {isRequestingOtp
                      ? 'Mengirim...'
                      : resendCooldownSeconds > 0
                        ? `Tunggu (${resendCooldownSeconds}d)`
                        : preAuthToken
                          ? 'Kirim Ulang'
                          : 'Kirim OTP'}
                  </span>
                </button>
              </div>

              {deliveryStatus === 'SENT' && (
                <p className="auth-otp-hint auth-otp-hint-sent">
                  Kode OTP telah dikirim oleh <strong>@{botUsername}</strong> ke Telegram terdaftar
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
                  ? `Terkunci Sementara (${rateLimitSeconds}d)`
                  : isSubmitting
                    ? 'Memverifikasi OTP & Sesi...'
                    : isRequestingOtp
                      ? 'Mengirim OTP ke Telegram...'
                      : 'Masuk'}
              </span>
            </button>
          </fieldset>
        </form>
      </article>

      <footer className="auth-meta">
        <span>2FA Telegram Bot OTP • JWT HttpOnly Session</span>
        <span className="auth-meta-divider" aria-hidden="true">
          |
        </span>
        <span>Single Source of Truth FTTH v1.0.0</span>
      </footer>
    </main>
  );
}
