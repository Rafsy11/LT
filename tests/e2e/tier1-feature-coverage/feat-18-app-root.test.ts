import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature 18 - App Root Router & State Management (apps/mobile/App.tsx)', () => {
  const appPath = path.resolve(process.cwd(), '../../apps/mobile/App.tsx');
  const fileContent = fs.readFileSync(appPath, 'utf-8');

  it('exports App root component and defines AppSecurityState and AppScreen router states', () => {
    assert.ok(fs.existsSync(appPath), 'App.tsx must exist');
    assert.match(fileContent, /export default function App/);
    assert.match(fileContent, /export type AppSecurityState/);
    assert.match(fileContent, /export type AppScreen/);
  });

  it('enforces device integrity security gate by routing compromised devices to lock screen', () => {
    assert.match(fileContent, /DEVICE_COMPROMISED_LOCK/);
    assert.match(fileContent, /checkDeviceIntegrity/);
    assert.match(fileContent, /Perangkat Tidak Memenuhi Standar Keamanan/);
  });

  it('enforces app version gate with upgrade required lock screen (HTTP 426)', () => {
    assert.match(fileContent, /UPGRADE_REQUIRED_LOCK/);
    assert.match(fileContent, /onUpgradeRequired/);
    assert.match(fileContent, /Pembaruan Aplikasi Diperlukan/);
  });

  it('supports screen state transitions across LOGIN, TICKET_LIST, and TICKET_SUBMIT', () => {
    assert.match(fileContent, /'LOGIN'/);
    assert.match(fileContent, /'TICKET_LIST'/);
    assert.match(fileContent, /'TICKET_SUBMIT'/);
    assert.match(fileContent, /setCurrentScreen/);
  });

  it('strictly adheres to antislop rules: zero em-dashes (—) and zero 9999px pills in App.tsx', () => {
    const emDashPattern = /\u2014|—/g;
    const matches = fileContent.match(emDashPattern);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length || 0} em-dashes in App.tsx. Antislop prohibits em-dashes.`
    );

    assert.strictEqual(
      fileContent.includes('9999px') || fileContent.includes('rounded-full'),
      false,
      'App.tsx must not use 9999px pill radii'
    );
  });
});
