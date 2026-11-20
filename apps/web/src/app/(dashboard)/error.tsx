'use client';

import React, { useEffect } from 'react';
import { SafeErrorState } from '@/components/ui/SafeErrorState';

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[DashboardErrorBoundary] Unhandled view error intercepted:', error.digest || 'NO_DIGEST');
    }
  }, [error]);

  return (
    <main id="main-content" className="page-shell">
      <SafeErrorState
        error={null}
        digest={error.digest}
        title="Halaman Belum Dapat Ditampilkan"
        description="Terjadi kendala sementara saat memuat tampilan ini. Data operasional Anda tetap aman, silakan coba lagi."
        onRetry={reset}
        retryLabel="Coba Lagi"
        homeHref="/"
        homeLabel="Kembali ke Ringkasan"
        variant="panel"
      />
    </main>
  );
}
