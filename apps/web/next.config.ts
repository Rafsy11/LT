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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@repo/shared', '@repo/database'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
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
        ],
      },
    ];
  },
};

export default nextConfig;
