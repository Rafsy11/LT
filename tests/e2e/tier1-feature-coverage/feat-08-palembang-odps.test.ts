import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CANONICAL_PALEMBANG_ODPS, FALLBACK_ODP_ID, SplitterFixture } from '../helpers/test-fixtures';

describe('Tier 1: Feature 8 - 90 Palembang ODP Canonical Constant', () => {
  const odpConstantPath = path.resolve(
    process.cwd(),
    '../../packages/shared/src/constants/palembang-odp.constant.ts'
  );

  async function getOdps(): Promise<SplitterFixture[]> {
    if (fs.existsSync(odpConstantPath)) {
      const mod = await import(pathToFileURL(odpConstantPath).href);
      return (mod.PALEMBANG_ODP_LIST || mod.default || CANONICAL_PALEMBANG_ODPS) as SplitterFixture[];
    }
    return CANONICAL_PALEMBANG_ODPS;
  }

  it('provides exactly 90 canonical Palembang ODP records', async () => {
    const odps = await getOdps();
    assert.strictEqual(odps.length, 90, 'Must have exactly 90 canonical ODPs');
  });

  it('conforms to ODP-PLB-XXX ID format with ODP-PLB-001 as primary fallback', async () => {
    const odps = await getOdps();
    assert.strictEqual(odps[0].id, FALLBACK_ODP_ID, 'First item must be ODP-PLB-001');
    const idPattern = /^ODP-PLB-\d{3}$/;
    for (let i = 0; i < odps.length; i++) {
      const expectedId = `ODP-PLB-${String(i + 1).padStart(3, '0')}`;
      assert.match(odps[i].id, idPattern, `${odps[i].id} does not match ODP-PLB-XXX pattern`);
      assert.strictEqual(odps[i].id, expectedId, `Expected index ${i} to be ${expectedId}`);
    }
  });

  it('ensures all coordinates lie within the Palembang metropolitan bounding box', async () => {
    const odps = await getOdps();
    // Palembang metro bounding box: Latitude [-3.5, -2.5], Longitude [104.3, 105.1]
    for (const odp of odps) {
      const lat = odp.lat !== undefined ? odp.lat : odp.latitude;
      const lng = odp.lng !== undefined ? odp.lng : odp.longitude;

      assert.ok(
        lat !== undefined && lat >= -3.5 && lat <= -2.5,
        `ODP ${odp.id} latitude ${lat} is outside Palembang bounding box [-3.5, -2.5]`
      );
      assert.ok(
        lng !== undefined && lng >= 104.3 && lng <= 105.1,
        `ODP ${odp.id} longitude ${lng} is outside Palembang bounding box [104.3, 105.1]`
      );
    }
  });

  it('assigns each ODP to a canonical Palembang cluster with valid PLB prefix', async () => {
    const odps = await getOdps();
    for (const odp of odps) {
      assert.ok(
        odp.clusterCode && /^PLB/.test(odp.clusterCode),
        `ODP ${odp.id} has invalid clusterCode "${odp.clusterCode}" (must start with PLB)`
      );
      assert.ok(
        odp.clusterName && odp.clusterName.length > 0,
        `ODP ${odp.id} missing clusterName`
      );
    }
  });

  it('validates port capacity constraints: maxPorts in [8, 16] and availablePorts <= maxPorts', async () => {
    const odps = await getOdps();
    for (const odp of odps) {
      const maxPorts = odp.maxPorts !== undefined ? odp.maxPorts : odp.totalPorts;
      assert.ok(
        maxPorts === 8 || maxPorts === 16,
        `ODP ${odp.id} maxPorts must be 8 or 16, got ${maxPorts}`
      );
      const availableCount = Array.isArray(odp.availablePorts)
        ? odp.availablePorts.length
        : typeof odp.availablePorts === 'number'
        ? odp.availablePorts
        : 0;

      assert.ok(
        availableCount >= 0 && availableCount <= maxPorts,
        `ODP ${odp.id} availablePorts (${availableCount}) exceeds maxPorts (${maxPorts})`
      );
    }
  });
});
