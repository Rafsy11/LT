import type { Metadata } from 'next';
import { CustomerProfileView } from '@/features/customers';

export const metadata: Metadata = {
  title: 'Profil Pelanggan SIA | FiberOps Lintasarta',
};

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ sia: string }>;
}) {
  const { sia } = await params;
  return <CustomerProfileView sia={decodeURIComponent(sia)} />;
}
