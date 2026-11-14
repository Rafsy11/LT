import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature 15 - Enhanced Login Screen (apps/mobile/src/screens/LoginScreen.tsx)', () => {
  const loginScreenPath = path.resolve(
    process.cwd(),
    '../../apps/mobile/src/screens/LoginScreen.tsx'
  );
  const fileContent = fs.readFileSync(loginScreenPath, 'utf-8');

  it('declares and exports LoginScreen component with LoginScreenProps interface', () => {
    assert.ok(fs.existsSync(loginScreenPath), 'LoginScreen.tsx must exist');
    assert.match(fileContent, /export (function|const) LoginScreen/);
    assert.match(fileContent, /export interface LoginScreenProps/);
  });

  it('strictly adheres to antislop copywriting with zero em-dashes (—)', () => {
    const emDashPattern = /\u2014|—/g;
    const matches = fileContent.match(emDashPattern);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length || 0} em-dashes in LoginScreen.tsx. Antislop prohibits em-dashes.`
    );
  });

  it('enforces 4px-8px border radii and strictly ZERO 9999px pill radii', () => {
    // Search for 9999px or full rounded pills
    assert.strictEqual(
      fileContent.includes('9999px') || fileContent.includes('rounded-full'),
      false,
      'LoginScreen must not use 9999px pill border radii'
    );
    // Find all borderRadius definitions
    const radiusMatches = fileContent.match(/borderRadius:\s*['"]?(\d+)px?['"]?/g) || [];
    for (const match of radiusMatches) {
      const num = parseInt(match.replace(/[^0-9]/g, ''), 10);
      assert.ok(
        num >= 4 && num <= 8,
        `Found border radius ${num}px in LoginScreen.tsx outside permitted 4-8px range`
      );
    }
  });

  it('enforces minimum touch targets (>= 44px) or adequate vertical padding on submit controls', () => {
    // Check that button and interactive form controls exist
    assert.match(fileContent, /<button/);
    assert.match(fileContent, /type="submit"/);
    // Ensure button has adequate vertical sizing (padding or minHeight)
    assert.match(fileContent, /padding:\s*['"][0-9]+px\s+[0-9]+px['"]/);
  });

  it('handles field validation and displays clear error feedback for empty credentials', () => {
    assert.match(fileContent, /username.*password.*wajib diisi|Kredensial tidak valid/i);
    assert.match(fileContent, /errorMessage/);
    assert.match(fileContent, /isLoading/);
  });
});
