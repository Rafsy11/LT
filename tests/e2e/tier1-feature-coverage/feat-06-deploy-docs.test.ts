import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature 6 - Mobile Deployment Documentation (docs/deploy-macos-m5.md)', () => {
  const docsPath = path.resolve(process.cwd(), '../../docs/deploy-macos-m5.md');
  const docContent = fs.readFileSync(docsPath, 'utf-8');

  // Extract Section 8 (Mobile deployment section)
  const sec8Index = docContent.indexOf('## 8.');
  const section8Content = sec8Index !== -1 ? docContent.substring(sec8Index) : '';

  it('contains dedicated Section 8 for Mobile Application Deployment', () => {
    assert.ok(fs.existsSync(docsPath), 'docs/deploy-macos-m5.md must exist');
    assert.match(
      docContent,
      /## 8\.\s+.*Deployment Aplikasi Mobile/i,
      'Must contain Section 8 header for mobile deployment'
    );
  });

  it('documents LAN and Cloud Tunnel execution workflows for field connectivity', () => {
    assert.match(
      section8Content,
      /pnpm --filter @repo\/mobile run start:lan/,
      'Must document LAN execution command'
    );
    assert.match(
      section8Content,
      /pnpm --filter @repo\/mobile run start:tunnel/,
      'Must document Tunnel execution command'
    );
  });

  it('documents dynamic server URL configuration and health check validation', () => {
    assert.match(
      section8Content,
      /Prosedur Konfigurasi Dynamic Server URL/i,
      'Must document dynamic server URL procedure'
    );
    assert.match(
      section8Content,
      /GET \/api\/v1\/health/,
      'Must document health check verification endpoint'
    );
    assert.match(
      section8Content,
      /SecureStore|penyimpanan terenkripsi/i,
      'Must explain persistent encrypted storage of server URL'
    );
  });

  it('documents standalone APK compilation via EAS build:apk command', () => {
    assert.match(
      section8Content,
      /pnpm --filter @repo\/mobile run build:apk/,
      'Must document build:apk command'
    );
    assert.match(
      section8Content,
      /eas build -p android --profile preview --local/,
      'Must detail local EAS build flags'
    );
  });

  it('strictly adheres to antislop copywriting with zero em-dashes (—) in Section 8', () => {
    const emDashRegex = /\u2014|—/g;
    const matches = section8Content.match(emDashRegex);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length || 0} em-dash characters in Section 8. Antislop prohibits em-dashes.`
    );
  });
});
