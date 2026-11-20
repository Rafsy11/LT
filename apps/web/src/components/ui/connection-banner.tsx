'use client';

/**
 * Connectivity and HTTP 503 maintenance banners are now handled globally by
 * `GlobalNetworkBanner` mounted in `RootLayout` to avoid duplicate banners across routes.
 * Export preserved for backward compatibility with dashboard layout imports.
 */
export function ConnectionBanner() {
  return null;
}

