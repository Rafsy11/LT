'use client';

import React from 'react';
import { generateErrorRefCode } from '@/lib/error-normalizer';

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorRefCode(error?.digest);

  // Standalone fallback without external providers/stylesheets because RootLayout failed
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          backgroundColor: '#020617',
          color: '#f1f5f9',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          boxSizing: 'border-box',
        }}
      >
        <section
          role="alert"
          aria-live="assertive"
          style={{
            width: '100%',
            maxWidth: '480px',
            padding: '28px 22px',
            borderRadius: '8px',
            backgroundColor: '#0b1329',
            border: '1px solid #1e293b',
            boxShadow: '0 8px 28px rgba(2, 6, 23, 0.6)',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#f1f5f9' }}>
            Kendala Sementara pada Sistem
          </h1>
          <p style={{ margin: '0 0 16px', fontSize: '13px', lineHeight: 1.55, color: '#94a3b8' }}>
            Maaf, aplikasi mengalami kendala sementara saat memproses halaman. Data Anda tetap aman,
            silakan coba muat ulang atau hubungi tim dukungan operasional jika kendala berlanjut.
          </p>
          <div
            style={{
              display: 'inline-block',
              padding: '5px 10px',
              borderRadius: '4px',
              backgroundColor: '#060b18',
              border: '1px solid #1e293b',
              color: '#cbd5e1',
              fontFamily: 'monospace',
              fontSize: '11.5px',
              marginBottom: '20px',
            }}
          >
            Ref: {refCode}
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: '44px',
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid #0e5b92',
                backgroundColor: '#0e5b92',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Coba Lagi
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: '#111e3f',
                color: '#e2e8f0',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              Kembali ke Beranda
            </a>
          </div>
        </section>
      </body>
    </html>
  );
}
