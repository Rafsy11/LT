import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '../../../apps/web/src');

describe('Tier 1: Feature 24 - Network Console (/network) UX Consolidation & Standards', () => {
  const networkView = fs.readFileSync(
    path.join(WEB_ROOT, 'features/network/components/network-view.tsx'),
    'utf8',
  );
  const networkStats = fs.readFileSync(
    path.join(WEB_ROOT, 'features/network/components/network-stats.tsx'),
    'utf8',
  );
  const clusterSelector = fs.readFileSync(
    path.join(WEB_ROOT, 'features/network/components/cluster-selector.tsx'),
    'utf8',
  );
  const splitterPortGrid = fs.readFileSync(
    path.join(WEB_ROOT, 'features/network/components/splitter-port-grid.tsx'),
    'utf8',
  );
  const portDetailPanel = fs.readFileSync(
    path.join(WEB_ROOT, 'features/network/components/port-detail-panel.tsx'),
    'utf8',
  );
  const useNetwork = fs.readFileSync(
    path.join(WEB_ROOT, 'features/network/hooks/use-network.ts'),
    'utf8',
  );
  const networkCss = fs.readFileSync(
    path.join(WEB_ROOT, 'styles/features/network.css'),
    'utf8',
  );
  const networkPage = fs.readFileSync(
    path.join(WEB_ROOT, 'app/(dashboard)/network/page.tsx'),
    'utf8',
  );

  it('1. consolidates tabs into 3 operational views (Port & Inspeksi, Riwayat, Audit Integritas) with Visual Port Strip', () => {
    assert.match(networkView, /Port &amp; Inspeksi/);
    assert.match(networkView, /Riwayat/);
    assert.match(networkView, /Audit Integritas/);
    assert.doesNotMatch(networkView, /activeTab === 'inspeksi'/);
    assert.match(splitterPortGrid, /odp-visual-port-strip/);
    assert.match(splitterPortGrid, /odp-mobile-port-cards/);
    assert.match(clusterSelector, /mobile-odp-picker-trigger/);
    assert.match(networkStats, /ODP Anomali/);
  });

  it('2. removes dead controls, fake counts, invalid icon names, and DB/PRD technical jargon', () => {
    const combined = [
      networkView,
      networkStats,
      clusterSelector,
      splitterPortGrid,
      portDetailPanel,
      useNetwork,
    ].join('\n');

    assert.doesNotMatch(combined, /handlePortClick/);
    assert.doesNotMatch(combined, /'2 foto'|"2 foto"/);
    assert.doesNotMatch(combined, /name="camera"|name="link"/);
    assert.doesNotMatch(combined, /PostgreSQL|PRD Section|idx_unique_active_splitter_port|100% ACID/);
    assert.strictEqual(combined.includes('🔒'), false, 'Decorative lock emoji must be removed');
    assert.strictEqual(/\u2014|—/.test(combined), false, 'Network module must not contain em-dashes');
    assert.strictEqual(combined.includes('9999px'), false, 'Network module must not use 9999px pills');
  });

  it('3. wires bidirectional deep-links with /maps, /customers/[sia], and Suspense-wrapped URL query params', () => {
    assert.match(networkPage, /<Suspense/);
    assert.match(useNetwork, /searchParams\.get\('odp'\)/);
    assert.match(useNetwork, /searchParams\.get\('search'\)/);
    assert.match(useNetwork, /searchParams\.get\('cluster'\)/);
    assert.match(networkView, /href=\{`\/maps\?odp=/);
    assert.match(splitterPortGrid, /href=\{`\/customers\//);
    assert.match(portDetailPanel, /href=\{`\/maps\?odp=/);
  });

  it('4. fixes mobile Light Mode contrast bug (no non-dark #0b1329 override in mobile media query)', () => {
    const mobileBlockIdx = networkCss.indexOf('@media (max-width: 767px)');
    const darkBlockIdx = networkCss.indexOf('Dark Mode Overrides for Network Console');
    assert.ok(mobileBlockIdx > -1 && darkBlockIdx > mobileBlockIdx);

    const mobileSection = networkCss.slice(mobileBlockIdx, darkBlockIdx);
    assert.strictEqual(
      mobileSection.includes('#0b1329'),
      false,
      'Mobile media query must not hardcode dark #0b1329 card backgrounds outside dark selectors',
    );
  });
});
