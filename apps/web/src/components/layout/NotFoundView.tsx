'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function NotFoundView() {
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document === 'undefined') return;
      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        (typeof window !== 'undefined' && window.localStorage?.getItem('fiberops_theme') === 'dark');
      setIsDarkTheme(isDark);
    };

    checkTheme();

    // Dynamically observe class or data-theme attribute changes on <html>
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    window.addEventListener('storage', checkTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', checkTheme);
    };
  }, []);

  return (
    <main
      id="main-content"
      className="not-found-main min-h-screen min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 py-12 text-center transition-colors duration-200"
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
        <h1 className="not-found-title mt-8 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight transition-colors duration-200">
          Something&apos;s missing.
        </h1>

        {/* Subtitle */}
        <p className="not-found-subtitle mt-2.5 text-sm sm:text-base max-w-sm sm:max-w-md mx-auto leading-relaxed font-normal transition-colors duration-200">
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
