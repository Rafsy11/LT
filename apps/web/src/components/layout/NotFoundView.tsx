'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import '@/styles/components/error-ux.css';

export interface NotFoundViewProps {
  /** Use `'dashboard'` when rendered inside the dashboard shell to keep proportions compact. */
  variant?: 'root' | 'dashboard';
}

const QUICK_ROUTES = [
  { href: '/', label: 'Ringkasan' },
  { href: '/tickets', label: 'Tiket & Tugas' },
  { href: '/network', label: 'Master Jaringan' },
  { href: '/customers', label: 'Master Pelanggan' },
] as const;

export function NotFoundView({ variant = 'root' }: NotFoundViewProps) {
  const router = useRouter();

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <main
      id="main-content"
      className={`not-found-main ${variant === 'dashboard' ? 'not-found-main--dashboard' : 'min-h-screen min-h-[100dvh]'} w-full flex flex-col items-center justify-center px-4 py-10 text-center transition-colors duration-200`}
    >
      <div className="w-full max-w-lg mx-auto flex flex-col items-center">
        <div className="relative w-full max-w-[320px] sm:max-w-[400px] md:max-w-[440px] aspect-[720/420] flex items-center justify-center select-none">
          <Image
            src="/assets/404-isometric.png"
            alt="Ilustrasi halaman tidak ditemukan 404"
            width={720}
            height={420}
            priority
            className="w-full h-auto object-contain select-none pointer-events-none"
          />
        </div>

        <h1 className="not-found-title mt-6 text-2xl sm:text-3xl font-bold tracking-tight transition-colors duration-200">
          Halaman Tidak Ditemukan
        </h1>

        <p className="not-found-subtitle mt-2.5 text-sm sm:text-base max-w-sm sm:max-w-md mx-auto leading-relaxed font-normal transition-colors duration-200">
          Halaman yang Anda cari mungkin telah dipindahkan, dihapus, atau alamat URL belum sesuai.
        </p>

        <div className="not-found-actions">
          <Link href="/" className="not-found-btn not-found-btn--primary">
            <Icon name="home" size={16} />
            <span>Kembali ke Beranda</span>
          </Link>
          <button
            type="button"
            onClick={handleGoBack}
            className="not-found-btn not-found-btn--secondary"
          >
            <Icon name="arrowLeft" size={16} />
            <span>Halaman Sebelumnya</span>
          </button>
        </div>

        <nav className="not-found-quick-links" aria-label="Tautan navigasi cepat">
          {QUICK_ROUTES.map((route) => (
            <Link key={route.href} href={route.href} className="not-found-quick-link">
              <span>{route.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
