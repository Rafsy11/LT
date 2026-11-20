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
        title="Kendala Sementara pada Sistem"
        description="Maaf, halaman ini belum dapat dimuat karena kendala sementara. Data Anda tetap aman, silakan coba lagi atau kembali ke beranda."
        onRetry={reset}
        retryLabel="Coba Lagi"
        homeHref="/"
        homeLabel="Kembali ke Beranda"
        variant="full"
      />
    </main>
  );
}
