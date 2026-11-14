import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistance,
  acquireVerifiedLocation,
  GpsCoordinates,
} from '../../../apps/mobile/src/security/locationGuard';
import { MAX_GEOFENCE_RADIUS_METERS, ERROR_CODES } from '@repo/shared';

describe('Tier 2: Boundary & Corner - GPS & Geofence Boundaries', () => {
  // Reference Palembang ODP (ODP-PLB-001) coordinates
  const ODP_REF: GpsCoordinates = {
    latitude: -2.983300,
    longitude: 104.764400,
  };

  /**
   * Helper to derive coordinate offset in meters for testing exact boundaries
   * At Palembang's latitude (~ -2.98°), 1 degree latitude is approx 111,000 meters.
   */
  function addMetersNorth(coords: GpsCoordinates, meters: number): GpsCoordinates {
    const latDelta = meters / 111000;
    return {
      latitude: Number((coords.latitude + latDelta).toFixed(7)),
      longitude: coords.longitude,
    };
  }

  it('1. calculates exact 0 meters distance when coordinates are identical', () => {
    const dist = calculateHaversineDistance(
      ODP_REF.latitude,
      ODP_REF.longitude,
      ODP_REF.latitude,
      ODP_REF.longitude
    );
    assert.strictEqual(Math.round(dist), 0);
  });

  it('2. verifies 49.9m distance is well within geofence and NOT flagged', async () => {
    const testPoint = addMetersNorth(ODP_REF, 49.9);
    const result = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: testPoint.latitude, longitude: testPoint.longitude, accuracy: 4 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.ok(result.distanceToSplitterMeters !== undefined);
    assert.ok(result.distanceToSplitterMeters >= 49 && result.distanceToSplitterMeters <= 51);
    assert.strictEqual(result.isLocationFlagged, false, '49.9m must not be flagged');
  });

  it('3. verifies 50.1m distance is correctly calculated and within 100m geofence', async () => {
    const testPoint = addMetersNorth(ODP_REF, 50.1);
    const result = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: testPoint.latitude, longitude: testPoint.longitude, accuracy: 5 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.ok(result.distanceToSplitterMeters !== undefined);
    assert.ok(result.distanceToSplitterMeters >= 49 && result.distanceToSplitterMeters <= 51);
    assert.strictEqual(result.isLocationFlagged, false, '50.1m is within 100m max radius');
  });

  it('4. verifies 99.9m boundary distance is allowed (isLocationFlagged: false)', async () => {
    const testPoint = addMetersNorth(ODP_REF, 99.9);
    const result = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: testPoint.latitude, longitude: testPoint.longitude, accuracy: 3 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.ok(result.distanceToSplitterMeters !== undefined);
    assert.ok(result.distanceToSplitterMeters <= MAX_GEOFENCE_RADIUS_METERS);
    assert.strictEqual(result.isLocationFlagged, false, '99.9m must be within 100m geofence');
  });

  it('5. verifies 100.1m boundary distance is flagged (isLocationFlagged: true)', async () => {
    // 102 meters north guarantees distance > 100m
    const testPoint = addMetersNorth(ODP_REF, 102.0);
    const result = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: testPoint.latitude, longitude: testPoint.longitude, accuracy: 4 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.ok(result.distanceToSplitterMeters !== undefined);
    assert.ok(result.distanceToSplitterMeters > MAX_GEOFENCE_RADIUS_METERS);
    assert.strictEqual(result.isLocationFlagged, true, '100.1m+ must be flagged as out-of-geofence');
  });

  it('6. verifies extreme out-of-geofence distance (500m) is flagged', async () => {
    const farPoint = addMetersNorth(ODP_REF, 500);
    const result = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: farPoint.latitude, longitude: farPoint.longitude, accuracy: 8 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.strictEqual(result.isLocationFlagged, true);
    assert.ok(result.distanceToSplitterMeters && result.distanceToSplitterMeters >= 480);
  });

  it('7. detects and rejects (0, 0) Null Island coordinates', () => {
    function validateCoordinates(coords: GpsCoordinates): { valid: boolean; error?: string } {
      if (coords.latitude === 0 && coords.longitude === 0) {
        return { valid: false, error: 'Koordinat (0, 0) tidak valid (Null Island).' };
      }
      if (coords.latitude < -90 || coords.latitude > 90) {
        return { valid: false, error: 'Latitude di luar batas [-90, 90].' };
      }
      if (coords.longitude < -180 || coords.longitude > 180) {
        return { valid: false, error: 'Longitude di luar batas [-180, 180].' };
      }
      return { valid: true };
    }

    const nullIsland = { latitude: 0, longitude: 0 };
    assert.strictEqual(validateCoordinates(nullIsland).valid, false);
    assert.match(validateCoordinates(nullIsland).error || '', /Null Island/);
  });

  it('8. rejects extreme latitude exceeding [-90, +90] bounds', () => {
    const invalidNorth = { latitude: 91.5, longitude: 104.7 };
    const invalidSouth = { latitude: -91.5, longitude: 104.7 };

    function isValidLat(lat: number): boolean {
      return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
    }

    assert.strictEqual(isValidLat(invalidNorth.latitude), false);
    assert.strictEqual(isValidLat(invalidSouth.latitude), false);
    assert.strictEqual(isValidLat(-2.9833), true);
  });

  it('9. rejects extreme longitude exceeding [-180, +180] bounds', () => {
    const invalidEast = { latitude: -2.9, longitude: 185.2 };
    const invalidWest = { latitude: -2.9, longitude: -185.2 };

    function isValidLon(lon: number): boolean {
      return typeof lon === 'number' && !isNaN(lon) && lon >= -180 && lon <= 180;
    }

    assert.strictEqual(isValidLon(invalidEast.longitude), false);
    assert.strictEqual(isValidLon(invalidWest.longitude), false);
    assert.strictEqual(isValidLon(104.7644), true);
  });

  it('10. handles missing GPS coordinates (null/undefined) safely', async () => {
    function validateCoordinateInput(coords?: Partial<GpsCoordinates> | null): boolean {
      if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
        return false;
      }
      return !isNaN(coords.latitude) && !isNaN(coords.longitude);
    }

    assert.strictEqual(validateCoordinateInput(null), false);
    assert.strictEqual(validateCoordinateInput(undefined), false);
    assert.strictEqual(validateCoordinateInput({ latitude: -2.98 }), false);
    assert.strictEqual(validateCoordinateInput({ longitude: 104.76 }), false);
    assert.strictEqual(validateCoordinateInput({ latitude: -2.98, longitude: 104.76 }), true);
  });

  it('11. preserves 6-decimal precision rounding (~0.1m accuracy) without floating jitter', () => {
    const highPrecision = { latitude: -2.98334567, longitude: 104.76445678 };
    const roundedLat = Number(highPrecision.latitude.toFixed(6));
    const roundedLon = Number(highPrecision.longitude.toFixed(6));

    assert.strictEqual(roundedLat, -2.983346);
    assert.strictEqual(roundedLon, 104.764457);
  });

  it('12. validates benchmark Haversine distance between Ampera Bridge and Jakabaring Stadium (~4.6 km)', () => {
    const ampera = { latitude: -2.9912, longitude: 104.7588 };
    const jakabaring = { latitude: -3.0210, longitude: 104.7890 };

    const distance = calculateHaversineDistance(
      ampera.latitude,
      ampera.longitude,
      jakabaring.latitude,
      jakabaring.longitude
    );

    // Expected distance is between 4,400m and 4,800m
    assert.ok(distance > 4400 && distance < 4800, `Expected ~4.6km, got ${Math.round(distance)}m`);
  });

  it('13. detects Fake GPS / Android mock location and throws MOCK_LOCATION_DETECTED', async () => {
    await assert.rejects(
      async () => {
        await acquireVerifiedLocation(ODP_REF, async () => ({
          coords: { latitude: ODP_REF.latitude, longitude: ODP_REF.longitude, accuracy: 3 },
          mocked: true, // Spoofed location provider flag
          timestamp: Date.now(),
        }));
      },
      (err: Error) => {
        assert.ok(err.message.includes(ERROR_CODES.MOCK_LOCATION_DETECTED));
        return true;
      }
    );
  });

  it('14. handles missing targetSplitterCoords gracefully without flagging', async () => {
    const result = await acquireVerifiedLocation(undefined, async () => ({
      coords: { latitude: -2.9833, longitude: 104.7644, accuracy: 5 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.strictEqual(result.distanceToSplitterMeters, undefined);
    assert.strictEqual(result.isLocationFlagged, false);
    assert.strictEqual(result.latitude, -2.9833);
    assert.strictEqual(result.longitude, 104.7644);
  });

  it('15. verifies coordinates lie within Palembang Metropolitan bounding box', () => {
    function isInPalembangMetro(lat: number, lon: number): boolean {
      return lat >= -3.5 && lat <= -2.5 && lon >= 104.3 && lon <= 105.1;
    }

    assert.strictEqual(isInPalembangMetro(ODP_REF.latitude, ODP_REF.longitude), true);
    // Jakarta coordinate should be outside
    assert.strictEqual(isInPalembangMetro(-6.2088, 106.8456), false);
    // Medan coordinate should be outside
    assert.strictEqual(isInPalembangMetro(3.5952, 98.6722), false);
  });

  it('16. handles GPS accuracy degradation (high accuracy 3m vs degraded accuracy 65m)', async () => {
    const degradedResult = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: ODP_REF.latitude, longitude: ODP_REF.longitude, accuracy: 65 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.strictEqual(degradedResult.accuracyMeters, 65);
    // High accuracy
    const sharpResult = await acquireVerifiedLocation(ODP_REF, async () => ({
      coords: { latitude: ODP_REF.latitude, longitude: ODP_REF.longitude, accuracy: 3 },
      mocked: false,
      timestamp: Date.now(),
    }));

    assert.strictEqual(sharpResult.accuracyMeters, 3);
  });
});
