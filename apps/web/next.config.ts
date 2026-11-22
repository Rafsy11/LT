import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

function loadRootEnvFile(filename: string): void {
  const filePath = path.resolve(process.cwd(), '..', '..', filename);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    const rawVal = line.slice(eqIndex + 1).trim();
    const unquoted = rawVal.replace(/^(['"])(.*)\1$/, '$2');

    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = unquoted;
    }
  }
}

loadRootEnvFile('.env.local');
loadRootEnvFile('.env');

function buildContentSecurityPolicy(): string {
  const isNextDevServer =
    process.env.NODE_ENV === 'development' &&
    !process.env.NODE_TEST_CONTEXT &&
    process.env.NEXT_PHASE !== 'phase-production-build';
  const scriptSrc = isNextDevServer
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
    "font-src 'self' data:",
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@repo/shared', '@repo/database'],
  serverExternalPackages: ['exceljs', 'minio'],
  images: {
    unoptimized: true,
    dangerouslyAllowSVG: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    const cspValue = buildContentSecurityPolicy();
    return [
      {
        source: '/mobile',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: cspValue,
          },
        ],
      },
      {
        source: '/mobile/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: cspValue,
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=()',
          },
          {
            key: 'Content-Security-Policy',
            value: cspValue,
          },
        ],
      },
    ];
  },
};

if (process.platform === 'win32' && process.env.NEXT_FORCE_STANDALONE !== 'true') {
  delete nextConfig.output;
}

export default nextConfig;
