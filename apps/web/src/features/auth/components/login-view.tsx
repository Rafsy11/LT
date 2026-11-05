'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { useLogin } from '../hooks/use-login';

export function LoginView() {
  const {
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
  } = useLogin();

  const isLocked = isSubmitting || rateLimitSeconds > 0;

  return (
    <main className="auth-page" aria-labelledby="login-title">
      <article className="auth-card">
        <header className="auth-header">
          <div className="auth-brand-bar">
            <img src="/assets/lintasarta-logo.png" alt="Lintasarta" className="auth-brand-logo" />
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
                  placeholder="superadmin atau admin.noc"
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

            <button type="submit" className="auth-submit-btn" disabled={isLocked}>
              <Icon name="shield" size={16} />
              <span>
                {rateLimitSeconds > 0
                  ? `Terkunci Sementara (${rateLimitSeconds}d)`
                  : isSubmitting
                    ? 'Memverifikasi Kredensial...'
                    : 'Masuk'}
              </span>
            </button>
          </fieldset>
        </form>
      </article>

      <footer className="auth-meta">
        <span>JWT HttpOnly Session • Sliding-Window Rate Limiter</span>
        <span className="auth-meta-divider" aria-hidden="true">
          |
        </span>
        <span>Single Source of Truth FTTH v1.0.0</span>
      </footer>
    </main>
  );
}
