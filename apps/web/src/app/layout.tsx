import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FiberOps — On-Premise FTTH Operations & Network Monitoring',
  description:
    'Single Source of Truth untuk Pengelolaan Master Data Jaringan, Tiket Lapangan, Monitoring Redaman Optik, dan Asisten AI On-Premise.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
