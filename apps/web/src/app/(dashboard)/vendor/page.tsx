import type { Metadata } from 'next';
import { VendorPortalView } from '@/features/vendor';

export const metadata: Metadata = {
  title: 'Portal Kerja Vendor | FiberOps Lintasarta',
};

export default function VendorPortalPage() {
  return <VendorPortalView />;
}

