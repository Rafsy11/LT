'use client';

import React from 'react';

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const cleanDigest = error?.digest
    ? error.digest.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12).toUpperCase()
    : 'INTERNAL';
  const refCode = `INC-${cleanDigest}`;

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
            borderRadius: '14px',
            backgroundColor: '#0b1329',
            border: '1px solid #1e293b',
            boxShadow: '0 8px 28px rgba(2, 6, 23, 0.6)',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#f1f5f9' }}>
            Sistem Sedang Mengalami Gangguan Sementara
          </h1>
          <p style={{ margin: '0 0 16px', fontSize: '13px', lineHeight: 1.55, color: '#94a3b8' }}>
            Halaman tidak dapat diproses saat ini demi keamanan sistem. Silakan muat ulang atau
            hubungi tim Administrator NOC jika kendala berlanjut.
          </p>
          <div
            style={{
              display: 'inline-block',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: '#060b18',
              border: '1px solid #1e293b',
              color: '#cbd5e1',
              fontFamily: 'monospace',
              fontSize: '11.5px',
              marginBottom: '20px',
            }}
          >
            Kode Referensi: {refCode}
          </div>
          <div>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: '44px',
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #0066ff',
                backgroundColor: '#0066ff',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </section>
      </body>
    </html>
  );
}
