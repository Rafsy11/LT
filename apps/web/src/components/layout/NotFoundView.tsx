'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/providers';

export function NotFoundView() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync with global theme (from ThemeProvider or documentElement fallback)
  const isDark = mounted
    ? resolvedTheme === 'dark'
    : typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark'
      : false;

  return (
    <main
      id="main-content"
      className="min-h-screen min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 py-12 text-center transition-colors duration-200 bg-white dark:bg-[#020617]"
      style={{
        backgroundColor: isDark ? '#020617' : '#ffffff',
        color: isDark ? '#f8fafc' : '#0f172a',
      }}
    >
      <div className="w-full max-w-lg mx-auto flex flex-col items-center select-none">
        {/* Isometric 404 Illustration with Ladder */}
        <div className="relative w-full max-w-[340px] sm:max-w-[420px] md:max-w-[460px] aspect-[720/420] flex items-center justify-center">
          <Image
            src="/assets/404-isometric.png"
            alt="404 Illustration: Lubang isometrik angka 404 dengan tangga darurat merah"
            width={720}
            height={420}
            priority
            className="w-full h-auto object-contain select-none pointer-events-none drop-shadow-sm"
          />
        </div>

        {/* Heading */}
        <h1
          className="mt-8 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight transition-colors duration-200 text-slate-900 dark:text-white"
          style={{ color: isDark ? '#f8fafc' : '#0f172a' }}
        >
          Something&apos;s missing.
        </h1>

        {/* Subtitle */}
        <p
          className="mt-2.5 text-sm sm:text-base max-w-sm sm:max-w-md mx-auto leading-relaxed font-normal transition-colors duration-200 text-slate-500 dark:text-slate-400"
          style={{ color: isDark ? '#94a3b8' : '#64748b' }}
        >
          The page you looking for is not found.
        </p>

        {/* Call to Action Button */}
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3 rounded-md bg-[#5656f4] hover:bg-[#4747e6] text-white font-medium text-sm sm:text-base shadow-[0_12px_24px_-6px_rgba(86,86,244,0.45)] hover:shadow-[0_16px_30px_-6px_rgba(86,86,244,0.55)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#5656f4] focus:ring-offset-2"
          >
            Go to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
