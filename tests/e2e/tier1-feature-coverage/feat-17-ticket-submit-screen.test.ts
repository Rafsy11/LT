import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classifyDbm, MAX_GEOFENCE_RADIUS_METERS } from '@repo/shared';
import { CANONICAL_PALEMBANG_ODPS, FALLBACK_ODP_ID, GPS_FIXTURES } from '../helpers/test-fixtures';

// Haversine distance helper matching locationGuard
function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

describe('Tier 1: Feature 17 - Field Ticket Submit Screen (apps/mobile/src/screens/TicketSubmitScreen.tsx)', () => {
  const submitScreenPath = path.resolve(
    process.cwd(),
    '../../apps/mobile/src/screens/TicketSubmitScreen.tsx'
  );
  const fileContent = fs.readFileSync(submitScreenPath, 'utf-8');

  it('enforces ODP-PLB-001 as the canonical default fallback ODP identifier', () => {
    assert.strictEqual(FALLBACK_ODP_ID, 'ODP-PLB-001');
    const firstOdp = CANONICAL_PALEMBANG_ODPS[0];
    assert.strictEqual(firstOdp.id, 'ODP-PLB-001');

    // Test fallback resolution logic
    const resolveSplitter = (customerSplitterCode?: string | null) => {
      const match = CANONICAL_PALEMBANG_ODPS.find((s) => s.id === customerSplitterCode);
      return match ? match.id : FALLBACK_ODP_ID;
    };

    assert.strictEqual(resolveSplitter(null), 'ODP-PLB-001');
    assert.strictEqual(resolveSplitter(undefined), 'ODP-PLB-001');
    assert.strictEqual(resolveSplitter('ODP-PLB-034'), 'ODP-PLB-034');
  });

  it('supports 90 Palembang ODP items in splitter selection dropdown with port matrix capacity', () => {
    assert.strictEqual(CANONICAL_PALEMBANG_ODPS.length, 90);
    // Every ODP must have valid port matrix bounds
    for (const odp of CANONICAL_PALEMBANG_ODPS) {
      const maxPorts = odp.maxPorts ?? odp.totalPorts;
      assert.ok(maxPorts === 8 || maxPorts === 16);
      const availableCount = Array.isArray(odp.availablePorts)
        ? odp.availablePorts.length
        : typeof odp.availablePorts === 'number'
        ? odp.availablePorts
        : 0;
      assert.ok(availableCount >= 0 && availableCount <= maxPorts);
    }
  });

  it('classifies attenuation dBm into Normal (Good), Warning, and Critical categories', () => {
    assert.strictEqual(classifyDbm(-18.5), 'Normal'); // Between -15 and -22
    assert.strictEqual(classifyDbm(-23.5), 'Warning'); // Between -22 and -25
    assert.strictEqual(classifyDbm(-27.0), 'Critical'); // Below -25
    assert.strictEqual(classifyDbm(null), 'Neutral');
  });

  it('validates GPS geofence threshold within MAX_GEOFENCE_RADIUS_METERS (100 meters)', () => {
    assert.strictEqual(MAX_GEOFENCE_RADIUS_METERS, 100);

    const ref = GPS_FIXTURES.odpReference;
    const within = GPS_FIXTURES.withinGeofence;
    const outside = GPS_FIXTURES.outsideGeofence;

    const distWithin = haversineDistanceMeters(ref.latitude, ref.longitude, within.latitude, within.longitude);
    assert.ok(distWithin <= MAX_GEOFENCE_RADIUS_METERS, `Distance ${distWithin}m should be within 100m geofence`);

    const distOutside = haversineDistanceMeters(ref.latitude, ref.longitude, outside.latitude, outside.longitude);
    assert.ok(distOutside > MAX_GEOFENCE_RADIUS_METERS, `Distance ${distOutside}m should be outside 100m geofence`);
  });

  it('strictly adheres to antislop rules: zero em-dashes (—) and zero 9999px pills in TicketSubmitScreen.tsx', () => {
    const emDashPattern = /\u2014|—/g;
    const matches = fileContent.match(emDashPattern);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length || 0} em-dashes in TicketSubmitScreen.tsx. Antislop prohibits em-dashes.`
    );

    assert.strictEqual(
      fileContent.includes('9999px') || fileContent.includes('rounded-full'),
      false,
      'TicketSubmitScreen must not use 9999px pill radii'
    );
  });
});
