import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ATTENUATION_THRESHOLDS,
  classifyDbm,
  isAttenuationBad,
  updateCustomerSchema,
} from '@repo/shared';

const WEB_ROOT = path.resolve(__dirname, '../../../apps/web/src');

describe('Tier 1: Feature 21 - Customer Profile, Building Photo & ODP Radar Maps (28 dB Standard)', () => {
  it('enforces 28 dB attenuation boundary (<= 28 dB good, > 28 dB bad)', () => {
    assert.strictEqual(ATTENUATION_THRESHOLDS.CRITICAL_BELOW, -28.0);
    assert.strictEqual(ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB, 28.0);

    // Optimal range
    assert.strictEqual(classifyDbm(-18.0), 'Normal');
    assert.strictEqual(classifyDbm(-25.0), 'Normal');
    assert.strictEqual(isAttenuationBad(-25.0), false);

    // Approaching limit but still acceptable (up to 28 dB inclusive)
    assert.strictEqual(classifyDbm(-25.8), 'Warning');
    assert.strictEqual(classifyDbm(-27.0), 'Warning');
    assert.strictEqual(classifyDbm(-28.0), 'Warning');
    assert.strictEqual(isAttenuationBad(-27.0), false);
    assert.strictEqual(isAttenuationBad(-28.0), false);

    // Bad attenuation (> 28 dB / below -28.0 dBm) or overpower (> -10 dBm)
    assert.strictEqual(classifyDbm(-28.1), 'Critical');
    assert.strictEqual(classifyDbm(-31.2), 'Critical');
    assert.strictEqual(isAttenuationBad(-28.1), true);
    assert.strictEqual(isAttenuationBad(-31.2), true);
    assert.strictEqual(isAttenuationBad(-8.5), true);

    // Unmeasured
    assert.strictEqual(classifyDbm(null), 'Neutral');
    assert.strictEqual(isAttenuationBad(null), false);
  });

  it('validates extended customer profile schema including PIC, OLT/ONT dB, description, and safe photo refs', () => {
    const valid = updateCustomerSchema.safeParse({
      siaNumber: '2024437353',
      fullName: 'BSI_ATM_INDOMARET_PARAMESWARA',
      picName: 'Hendra Wijaya',
      picPhone: '+62 812-7311-4092',
      picRole: 'PIC Operasional ATM BSI',
      profileDescription: 'Lokasi ATM BSI di Indomaret Parameswara Palembang.',
      photoObjectKey: 'customers/2024437353/abc123.jpg',
      photoCaption: 'Tampak depan lokasi ATM',
      oltAttenuation: -28.0,
      ontAttenuation: -27.0,
      lastActivityNote: 'Kabel ketabrak, perlu pergantian dropcore.',
      portNumber: 2,
    });
    assert.strictEqual(valid.success, true);

    // Rejects unsafe XSS/javascript or path traversal photo references
    const unsafeJs = updateCustomerSchema.safeParse({
      siaNumber: '2024437353',
      photoObjectKey: 'javascript:alert(1)',
    });
    assert.strictEqual(unsafeJs.success, false);

    const unsafeTraversal = updateCustomerSchema.safeParse({
      siaNumber: '2024437353',
      photoObjectKey: 'customers/../../etc/passwd',
    });
    assert.strictEqual(unsafeTraversal.success, false);
  });

  it('verifies customer profile page, photo upload route, and /maps radar route files exist', () => {
    const requiredFiles = [
      'app/(dashboard)/customers/[sia]/page.tsx',
      'app/(dashboard)/maps/page.tsx',
      'app/api/v1/admin/customers/photo/route.ts',
      'app/api/v1/admin/maps/odp/route.ts',
      'features/customers/components/customer-profile-view.tsx',
      'features/customers/components/customer-profile-edit-modal.tsx',
      'features/maps/components/maps-view.tsx',
      'features/maps/components/odp-radar-map.tsx',
      'features/maps/components/odp-inspector-panel.tsx',
      'features/maps/hooks/use-odp-maps.ts',
    ];

    for (const rel of requiredFiles) {
      const fullPath = path.join(WEB_ROOT, rel);
      assert.ok(fs.existsSync(fullPath), `Missing expected file: ${rel}`);
    }
  });

  it('enforces SUPER_ADMIN exclusivity on customer profile edit & photo upload routes', () => {
    const customersRoute = fs.readFileSync(
      path.join(WEB_ROOT, 'app/api/v1/admin/customers/route.ts'),
      'utf8',
    );
    const photoRoute = fs.readFileSync(
      path.join(WEB_ROOT, 'app/api/v1/admin/customers/photo/route.ts'),
      'utf8',
    );
    const sidebar = fs.readFileSync(
      path.join(WEB_ROOT, 'components/layout/Sidebar.tsx'),
      'utf8',
    );
    const middleware = fs.readFileSync(path.join(WEB_ROOT, 'middleware.ts'), 'utf8');

    assert.match(customersRoute, /actor\.userType !== 'SUPER_ADMIN'/);
    assert.match(photoRoute, /actor\.userType !== 'SUPER_ADMIN'/);
    assert.match(photoRoute, /status:\s*413/);
    assert.match(photoRoute, /status:\s*415/);
    assert.match(sidebar, /href:\s*'\/maps'/);
    assert.match(middleware, /'\/maps'/);
  });

  it('replaces redundant SVG map on Overview ("/") with OverviewOdpHealthPanel deep-linked to /maps', () => {
    const legacyMapPath = path.join(WEB_ROOT, 'features/overview/components/overview-network-map.tsx');
    const healthPanelPath = path.join(WEB_ROOT, 'features/overview/components/overview-odp-health-panel.tsx');
    const overviewViewPath = path.join(WEB_ROOT, 'features/overview/components/overview-view.tsx');
    const useOdpMapsPath = path.join(WEB_ROOT, 'features/maps/hooks/use-odp-maps.ts');

    assert.strictEqual(fs.existsSync(legacyMapPath), false, 'Legacy overview-network-map.tsx should be removed');
    assert.ok(fs.existsSync(healthPanelPath), 'OverviewOdpHealthPanel must exist');

    const panelContent = fs.readFileSync(healthPanelPath, 'utf8');
    const overviewContent = fs.readFileSync(overviewViewPath, 'utf8');
    const mapsHookContent = fs.readFileSync(useOdpMapsPath, 'utf8');

    assert.match(overviewContent, /OverviewOdpHealthPanel/);
    assert.doesNotMatch(overviewContent, /OverviewNetworkMap/);
    assert.match(panelContent, /ATTENUATION_THRESHOLDS\.GOOD_MAX_LOSS_DB/);
    assert.match(panelContent, /qs\.set\('odp'/);
    assert.match(panelContent, /qs\.set\('cluster'/);
    assert.match(panelContent, /qs\.set\('status'/);
    assert.match(panelContent, /\/maps/);
    assert.strictEqual(/\u2014|—/.test(panelContent), false, 'OverviewOdpHealthPanel must not contain em-dashes');
    assert.strictEqual(panelContent.includes('9999px'), false, 'OverviewOdpHealthPanel must not use 9999px pills');

    assert.match(mapsHookContent, /searchParams\.get\('cluster'\)/);
    assert.match(mapsHookContent, /searchParams\.get\('status'\)/);
    assert.match(mapsHookContent, /fetchWithCache/);
  });
});
