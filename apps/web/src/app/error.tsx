'use client';

import React, { useEffect } from 'react';
import { SafeErrorState } from '@/components/ui/SafeErrorState';

export default function RootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[RootErrorBoundary] Intercepted route failure:', error.digest || 'NO_DIGEST');
    }
  }, [error]);

  return (
    <main id="main-content">
      <SafeErrorState
        error={null}
        digest={error.digest}
        title="Layanan Aplikasi Mengalami Gangguan Sementara"
        description="Terjadi kendala saat memproses halaman ini. Silakan coba muat ulang atau kembali ke beranda operasional."
        onRetry={reset}
        retryLabel="Coba Lagi"
        homeHref="/"
        homeLabel="Kembali ke Beranda"
        variant="full"
      />
    </main>
  );
}
