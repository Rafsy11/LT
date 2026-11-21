import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '../../../apps/web/src');

describe('Tier 1: Feature 25 - Global Custom Scrollbar System (apps/web)', () => {
  const scrollbarCssPath = path.join(WEB_ROOT, 'styles/components/scrollbar.css');
  const rootLayoutPath = path.join(WEB_ROOT, 'app/layout.tsx');
  const primitivesCssPath = path.join(WEB_ROOT, 'styles/components/primitives.css');
  const customersCssPath = path.join(WEB_ROOT, 'styles/features/customers.css');
  const mobilePagePath = path.join(WEB_ROOT, 'app/mobile/page.tsx');

  it('1. loads dedicated scrollbar.css globally from root layout.tsx', () => {
    assert.ok(fs.existsSync(scrollbarCssPath), 'scrollbar.css must exist');
    const layoutContent = fs.readFileSync(rootLayoutPath, 'utf8');
    assert.match(layoutContent, /import\s+'@\/styles\/components\/scrollbar\.css'/);
  });

  it('2. defines Light, Dark, and /mobile scoped scrollbar CSS tokens with DESIGN.md geometry', () => {
    const css = fs.readFileSync(scrollbarCssPath, 'utf8');

    assert.match(css, /:root\s*\{[\s\S]*--scrollbar-thumb:/);
    assert.match(css, /html\.dark,\s*\[data-theme='dark'\]\s*\{[\s\S]*--scrollbar-thumb:/);
    assert.match(css, /\.mobile-shell-viewport:not\(\[data-mobile-theme='dark'\]\)/);
    assert.match(css, /\.mobile-shell-viewport\[data-mobile-theme='dark'\]/);
    assert.match(css, /--scrollbar-radius:\s*4px/);
    assert.strictEqual(css.includes('9999px'), false, 'Scrollbar must not use 9999px pills');
    assert.strictEqual(/transition\s*:/.test(css), false, 'Scrollbar must not animate theme color switches');
  });

  it('3. implements full WebKit scrollbar styling and guards Firefox fallback to protect Chromium 121+', () => {
    const css = fs.readFileSync(scrollbarCssPath, 'utf8');

    assert.match(css, /::-webkit-scrollbar\s*\{/);
    assert.match(css, /::-webkit-scrollbar-thumb\s*\{[\s\S]*background-clip:\s*content-box/);
    assert.match(css, /::-webkit-scrollbar-thumb:hover\s*\{/);
    assert.match(css, /::-webkit-scrollbar-thumb:active\s*\{/);
    assert.match(css, /::-webkit-scrollbar-button\s*\{[\s\S]*display:\s*none/);
    assert.match(css, /@supports not selector\(::-webkit-scrollbar\)\s*\{[\s\S]*scrollbar-width:\s*thin/);
  });

  it('4. cleans up legacy conflicting local scrollbar overrides in primitives.css, customers.css, and mobile/page.tsx', () => {
    const primitivesCss = fs.readFileSync(primitivesCssPath, 'utf8');
    const customersCss = fs.readFileSync(customersCssPath, 'utf8');
    const mobilePage = fs.readFileSync(mobilePagePath, 'utf8');

    assert.doesNotMatch(primitivesCss, /\.modal\s+\.modal-body::-webkit-scrollbar/);
    assert.doesNotMatch(primitivesCss, /scrollbar-color:\s*#cbd5e1\s+transparent/);
    assert.doesNotMatch(customersCss, /scrollbar-width:\s*thin/);
    assert.doesNotMatch(mobilePage, /\.mobile-shell-viewport::-webkit-scrollbar/);
  });
});
