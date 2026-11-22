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

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
    return [
      {
        source: '/mobile',
        headers: [
          {
            key: 'Clear-Site-Data',
            value: '"cookies"',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: CONTENT_SECURITY_POLICY,
          },
          {
            key: 'Set-Cookie',
            value:
              'fiberops_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
          },
        ],
      },
      {
        source: '/mobile/:path*',
        headers: [
          {
            key: 'Clear-Site-Data',
            value: '"cookies"',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: CONTENT_SECURITY_POLICY,
          },
          {
            key: 'Set-Cookie',
            value:
              'fiberops_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
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
            value: CONTENT_SECURITY_POLICY,
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
