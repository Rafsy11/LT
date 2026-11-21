import React, { Suspense } from 'react';
import { NetworkView } from '@/features/network';
import { NetworkSkeleton } from '@/components/ui/PageSkeleton';

export default function NetworkPage() {
  return (
    <Suspense fallback={<NetworkSkeleton />}>
      <NetworkView />
    </Suspense>
  );
}
