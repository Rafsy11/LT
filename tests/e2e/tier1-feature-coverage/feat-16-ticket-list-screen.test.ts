import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature 16 - Field Ticket List Screen (apps/mobile/src/screens/TicketListScreen.tsx)', () => {
  const screenPath = path.resolve(
    process.cwd(),
    '../../apps/mobile/src/screens/TicketListScreen.tsx'
  );
  const fileContent = fs.readFileSync(screenPath, 'utf-8');

  it('declares and exports TicketListScreen with MobileTicketItem and SplitterItem contracts', () => {
    assert.ok(fs.existsSync(screenPath), 'TicketListScreen.tsx must exist');
    assert.match(fileContent, /export (function|const) TicketListScreen/);
    assert.match(fileContent, /export interface MobileTicketItem/);
    assert.match(fileContent, /export interface SplitterItem/);
    assert.match(fileContent, /export interface TicketListScreenProps/);
  });

  it('strictly adheres to antislop copywriting with zero em-dashes (—)', () => {
    const emDashPattern = /\u2014|—/g;
    const matches = fileContent.match(emDashPattern);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length || 0} em-dashes in TicketListScreen.tsx. Antislop prohibits em-dashes.`
    );
  });

  it('provides sticky offline queue banner with manual sync trigger', () => {
    assert.match(fileContent, /offlineQueue\.flush/);
    assert.match(fileContent, /handleManualSync/);
    assert.match(fileContent, /offlineItems/);
  });

  it('supports comprehensive search filtering across ticketNumber, customer name, and SIA', () => {
    assert.match(fileContent, /searchQuery/);
    assert.match(fileContent, /filterType/);
    assert.match(fileContent, /ticketNumber\.toLowerCase\(\)/);
    assert.match(fileContent, /customer\.fullName\.toLowerCase\(\)/);
  });

  it('enforces 4px-8px border radii and strictly zero 9999px pills on cards and badges', () => {
    assert.strictEqual(
      fileContent.includes('9999px') || fileContent.includes('rounded-full'),
      false,
      'TicketListScreen must not use 9999px pill radii'
    );
    const radiusMatches = fileContent.match(/borderRadius:\s*['"]?(\d+)px?['"]?/g) || [];
    for (const match of radiusMatches) {
      const num = parseInt(match.replace(/[^0-9]/g, ''), 10);
      assert.ok(
        num >= 4 && num <= 8,
        `Found border radius ${num}px in TicketListScreen.tsx outside permitted 4-8px range`
      );
    }
  });
});
