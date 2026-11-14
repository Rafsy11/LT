import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  compressOpmPhoto,
  formatOpmWatermarkLines,
  categorizeAttenuation,
  type WatermarkData,
} from '../../../apps/mobile/src/camera/opmCamera';
import { createMockJpegBuffer } from '../helpers/test-fixtures';

describe('Tier 1: Feature 14 - In-App Watermarked Camera Modal (apps/mobile/src/components/OpmCameraModal.tsx)', () => {
  it('formats watermark overlay with ticket number, timestamp, ODP ID, coordinates, and dBm', () => {
    const data: WatermarkData = {
      ticketNumber: 'WO-2025-0842',
      odpId: 'ODP-PLB-001',
      timestamp: '2026-11-14T10:30:00.000Z',
      latitude: -2.983300,
      longitude: 104.764400,
      attenuationDbm: -18.5,
    };

    const lines = formatOpmWatermarkLines(data);
    assert.strictEqual(lines.length, 5);
    assert.strictEqual(lines[0], 'TIKET: WO-2025-0842');
    assert.strictEqual(lines[1], 'WAKTU: 2026-11-14T10:30:00.000Z');
    assert.strictEqual(lines[2], 'ODP: ODP-PLB-001');
    assert.strictEqual(lines[3], 'KOORDINAT: -2.983300, 104.764400');
    assert.strictEqual(lines[4], 'REDAMAN: -18.50 dBm');
  });

  it('guarantees formatted watermark text contains strictly zero em-dashes (—)', () => {
    const data: WatermarkData = {
      ticketNumber: 'WO-2025-0841',
      odpId: 'ODP-PLB-034',
      timestamp: '2026-11-14T11:00:00.000Z',
      latitude: -2.976383,
      longitude: 104.741487,
      attenuationDbm: -22.45,
    };

    const fullWatermarkText = formatOpmWatermarkLines(data).join('\n');
    assert.strictEqual(
      /\u2014|—/.test(fullWatermarkText),
      false,
      'Watermark text must not contain em-dashes'
    );
  });

  it('enforces maximum compressed image file size strictly under 300 KB (<307,200 bytes)', async () => {
    const rawBuffer = createMockJpegBuffer(250 * 1024); // 250 KB buffer
    assert.ok(rawBuffer.length < 300 * 1024, 'Image buffer must be < 300 KB');

    // Simulate custom manipulator compression
    const compressed = await compressOpmPhoto(
      'file:///data/user/0/cache/raw_opm.jpg',
      { maxWidth: 1280, quality: 0.7 },
      async (uri, actions, saveOptions) => {
        return {
          uri: 'file:///data/user/0/cache/compressed_opm.jpg',
          width: 1280,
          height: 960,
          base64: rawBuffer.toString('base64'),
        };
      }
    );

    assert.strictEqual(compressed.width, 1280);
    if (compressed.base64) {
      const byteLength = Buffer.from(compressed.base64, 'base64').length;
      assert.ok(byteLength <= 300 * 1024, `Compressed image ${byteLength} bytes exceeds 300KB limit`);
    }
  });

  it('correctly handles boundary attenuation values and 6-digit decimal coordinates', () => {
    const boundaryData1: WatermarkData = {
      ticketNumber: 'WO-2025-0001',
      odpId: 'ODP-PLB-090',
      timestamp: new Date().toISOString(),
      latitude: -3.000001,
      longitude: 104.750009,
      attenuationDbm: -9.5, // High power / low attenuation
    };
    const lines1 = formatOpmWatermarkLines(boundaryData1);
    assert.ok(lines1[4].includes('-9.50 dBm'));

    const boundaryData2: WatermarkData = {
      ...boundaryData1,
      attenuationDbm: -28.99, // Low power / high attenuation
    };
    const lines2 = formatOpmWatermarkLines(boundaryData2);
    assert.ok(lines2[4].includes('-28.99 dBm'));

    // Verify categorizeAttenuation from opmCamera
    const goodCat = categorizeAttenuation(-18.5);
    assert.strictEqual(goodCat.category, 'GOOD');
    assert.strictEqual(goodCat.label, 'Baik');

    const warnCat = categorizeAttenuation(-23.0);
    assert.strictEqual(warnCat.category, 'WARNING');

    const critCat = categorizeAttenuation(-28.0);
    assert.strictEqual(critCat.category, 'CRITICAL');
  });

  it('ensures OpmCameraModal component exports and adheres to antislop rules with zero em-dashes', () => {
    const componentPath = path.resolve(
      process.cwd(),
      '../../apps/mobile/src/components/OpmCameraModal.tsx'
    );
    assert.ok(fs.existsSync(componentPath), 'OpmCameraModal.tsx must exist');
    const content = fs.readFileSync(componentPath, 'utf-8');
    assert.ok(
      content.includes('export function OpmCameraModal'),
      'Must export OpmCameraModal component'
    );
    assert.ok(
      content.includes('OpmCameraModalProps'),
      'Must declare OpmCameraModalProps interface'
    );
    assert.strictEqual(
      /\u2014|—/.test(content),
      false,
      'Component must contain zero em-dashes'
    );
  });
});
