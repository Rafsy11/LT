import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { MapsView } from '@/features/maps';

export const metadata: Metadata = {
  title: 'Peta Radar Datek ODP (Maps) | FiberOps Lintasarta',
};

export default function MapsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '32px', textAlign: 'center' }}>Memuat Peta Radar ODP...</div>}>
      <MapsView />
    </Suspense>
  );
}
