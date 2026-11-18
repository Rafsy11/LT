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
        title="Halaman Tidak Dapat Ditampilkan Saat Ini"
        description="Sistem menghentikan pemuatan tampilan demi menjaga stabilitas operasional. Silakan coba muat ulang halaman."
        onRetry={reset}
        retryLabel="Muat Ulang Tampilan"
        homeHref="/"
        homeLabel="Kembali ke Ringkasan"
        variant="panel"
      />
    </main>
  );
}
