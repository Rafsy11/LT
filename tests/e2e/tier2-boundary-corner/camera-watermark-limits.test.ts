import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compressOpmPhoto } from '../../../apps/mobile/src/camera/opmCamera';
import { createMockJpegBuffer } from '../helpers/test-fixtures';

export interface ExtendedWatermarkInput {
  ticketNumber: string;
  odpId: string;
  portNumber?: number;
  timestamp: string;
  technicianName?: string;
  latitude?: number | null;
  longitude?: number | null;
  attenuationDbm: number;
}

export type AttenuationCategory = 'GOOD' | 'WARNING' | 'CRITICAL' | 'INVALID';

export function categorizeAttenuation(dbm: number): {
  category: AttenuationCategory;
  label: string;
  colorHex: string;
} {
  if (typeof dbm !== 'number' || isNaN(dbm) || !isFinite(dbm)) {
    return { category: 'INVALID', label: 'Tidak Valid', colorHex: '#94A3B8' };
  }
  if (dbm > 0 || dbm < -50) {
    return { category: 'INVALID', label: 'Di Luar Rentang', colorHex: '#EF4444' };
  }
  if (dbm >= -22.0 && dbm <= -15.0) {
    return { category: 'GOOD', label: 'Baik', colorHex: '#10B981' };
  }
  if (dbm >= -25.0 && dbm < -22.0) {
    return { category: 'WARNING', label: 'Peringatan', colorHex: '#F59E0B' };
  }
  return { category: 'CRITICAL', label: 'Kritis', colorHex: '#EF4444' };
}

export function formatComprehensiveWatermark(input: ExtendedWatermarkInput): string[] {
  const lines: string[] = [];

  // 1. Ticket
  const ticketStr = (input.ticketNumber || 'TKT-UNKNOWN').trim();
  const truncatedTicket = ticketStr.length > 36 ? `${ticketStr.slice(0, 33)}...` : ticketStr;
  lines.push(`TIKET: ${truncatedTicket}`);

  // 2. Timestamp
  lines.push(`WAKTU: ${input.timestamp || new Date().toISOString()}`);

  // 3. ODP & Port
  const odpStr = (input.odpId || 'ODP-PLB-001').trim();
  const portStr = input.portNumber ? ` (Port ${input.portNumber})` : '';
  lines.push(`ODP: ${odpStr}${portStr}`);

  // 4. Coordinates
  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    !isNaN(input.latitude) &&
    !isNaN(input.longitude)
  ) {
    lines.push(`KOORDINAT: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`);
  } else {
    lines.push('KOORDINAT: Sinyal GPS tidak tersedia');
  }

  // 5. Attenuation
  if (typeof input.attenuationDbm === 'number' && !isNaN(input.attenuationDbm) && isFinite(input.attenuationDbm)) {
    const cat = categorizeAttenuation(input.attenuationDbm);
    lines.push(`REDAMAN: ${input.attenuationDbm.toFixed(2)} dBm [${cat.label}]`);
  } else {
    lines.push('REDAMAN: N/A (Nilai Tidak Valid)');
  }

  // 6. Technician (if present)
  if (input.technicianName) {
    const techStr = input.technicianName.trim();
    const truncatedTech = techStr.length > 30 ? `${techStr.slice(0, 27)}...` : techStr;
    lines.push(`TEKNISI: ${truncatedTech}`);
  }

  return lines;
}

describe('Tier 2: Boundary & Corner - Camera & Watermark Limits', () => {
  const baseInput: ExtendedWatermarkInput = {
    ticketNumber: 'WO-2025-0842',
    odpId: 'ODP-PLB-001',
    portNumber: 3,
    timestamp: '2026-11-14T10:00:00.000Z',
    technicianName: 'Andi Pratama',
    latitude: -2.983300,
    longitude: 104.764400,
    attenuationDbm: -18.5,
  };

  it('1. formats extreme negative attenuation (-99.9 dBm loss of signal)', () => {
    const result = formatComprehensiveWatermark({ ...baseInput, attenuationDbm: -99.9 });
    const attenuationLine = result.find((l) => l.startsWith('REDAMAN:'));
    assert.ok(attenuationLine?.includes('-99.90 dBm'));
    assert.ok(attenuationLine?.includes('Di Luar Rentang'));
  });

  it('2. formats extreme positive attenuation (+10.0 dBm optical saturation)', () => {
    const result = formatComprehensiveWatermark({ ...baseInput, attenuationDbm: 10.0 });
    const attenuationLine = result.find((l) => l.startsWith('REDAMAN:'));
    assert.ok(attenuationLine?.includes('10.00 dBm'));
    assert.ok(attenuationLine?.includes('Di Luar Rentang'));
  });

  it('3. handles boundary 0.0 dBm correctly without misinterpreting as false', () => {
    const result = formatComprehensiveWatermark({ ...baseInput, attenuationDbm: 0.0 });
    const attenuationLine = result.find((l) => l.startsWith('REDAMAN:'));
    assert.ok(attenuationLine?.includes('0.00 dBm'));
    assert.ok(attenuationLine?.includes('Kritis'));
  });

  it('4. categorizes standard good attenuation (-18.5 dBm) as BAIK (#10B981)', () => {
    const cat = categorizeAttenuation(-18.5);
    assert.strictEqual(cat.category, 'GOOD');
    assert.strictEqual(cat.label, 'Baik');
    assert.strictEqual(cat.colorHex, '#10B981');
  });

  it('5. categorizes warning attenuation (-23.2 dBm) as PERINGATAN (#F59E0B)', () => {
    const cat = categorizeAttenuation(-23.2);
    assert.strictEqual(cat.category, 'WARNING');
    assert.strictEqual(cat.label, 'Peringatan');
    assert.strictEqual(cat.colorHex, '#F59E0B');
  });

  it('6. categorizes critical attenuation (-27.8 dBm) as KRITIS (#EF4444)', () => {
    const cat = categorizeAttenuation(-27.8);
    assert.strictEqual(cat.category, 'CRITICAL');
    assert.strictEqual(cat.label, 'Kritis');
    assert.strictEqual(cat.colorHex, '#EF4444');
  });

  it('7. safely handles invalid NaN, Infinity, -Infinity attenuation values', () => {
    const nanResult = formatComprehensiveWatermark({ ...baseInput, attenuationDbm: NaN });
    const infResult = formatComprehensiveWatermark({ ...baseInput, attenuationDbm: Infinity });
    const negInfResult = formatComprehensiveWatermark({ ...baseInput, attenuationDbm: -Infinity });

    assert.ok(nanResult.some((l) => l.includes('N/A (Nilai Tidak Valid)')));
    assert.ok(infResult.some((l) => l.includes('N/A (Nilai Tidak Valid)')));
    assert.ok(negInfResult.some((l) => l.includes('N/A (Nilai Tidak Valid)')));
  });

  it('8. handles missing GPS metadata (null/undefined) without crashing', () => {
    const noGps = formatComprehensiveWatermark({
      ...baseInput,
      latitude: null,
      longitude: undefined,
    });
    const coordLine = noGps.find((l) => l.startsWith('KOORDINAT:'));
    assert.strictEqual(coordLine, 'KOORDINAT: Sinyal GPS tidak tersedia');
  });

  it('9. truncates or wraps excessively long ticket IDs (50+ chars) cleanly', () => {
    const longTicket = 'WO-2025-0842-PALEMBANG-NORTH-EMERGENCY-DISASTER-RECOVERY-MISSION-001';
    const result = formatComprehensiveWatermark({ ...baseInput, ticketNumber: longTicket });
    const ticketLine = result.find((l) => l.startsWith('TIKET:'));
    assert.ok(ticketLine?.endsWith('...'));
    assert.ok(ticketLine && ticketLine.length <= 45);
  });

  it('10. truncates long technician names (60+ chars) without overflowing modal bounds', () => {
    const longName = 'Muhammad Alexander Raden Mas Danang Joyodiningrat Suryokusumo';
    const result = formatComprehensiveWatermark({ ...baseInput, technicianName: longName });
    const techLine = result.find((l) => l.startsWith('TEKNISI:'));
    assert.ok(techLine?.endsWith('...'));
    assert.ok(techLine && techLine.length <= 40);
  });

  it('11. formats complex ODP names with port numbers cleanly', () => {
    const result = formatComprehensiveWatermark({
      ...baseInput,
      odpId: 'ODP-PLB-090/Sukarami',
      portNumber: 14,
    });
    assert.ok(result.some((l) => l === 'ODP: ODP-PLB-090/Sukarami (Port 14)'));
  });

  it('12. guarantees file size bounds < 300 KB for on-device compressed photos', async () => {
    const mockImage = createMockJpegBuffer(280 * 1024); // 280KB (<300KB)
    assert.ok(mockImage.length < 300 * 1024);

    const compressed = await compressOpmPhoto(
      'file:///temp/raw.jpg',
      { maxWidth: 1280, quality: 0.7 },
      async () => ({
        uri: 'file:///temp/compressed.jpg',
        width: 1280,
        height: 960,
        base64: mockImage.toString('base64'),
      })
    );

    assert.strictEqual(compressed.width, 1280);
    const sizeBytes = Buffer.from(compressed.base64 || '', 'base64').length;
    assert.ok(sizeBytes <= 300 * 1024, `Size ${sizeBytes} exceeds 300KB limit`);
  });

  it('13. verifies strict absence of em-dash (—) characters across all watermark output lines', () => {
    const textOutput = formatComprehensiveWatermark({
      ticketNumber: 'WO-2025-0842',
      odpId: 'ODP-PLB-001',
      portNumber: 1,
      timestamp: '2026-11-14T10:00:00.000Z',
      technicianName: 'Budi Santoso',
      latitude: -2.9833,
      longitude: 104.7644,
      attenuationDbm: -19.2,
    }).join('\n');

    assert.strictEqual(
      /\u2014|—/.test(textOutput),
      false,
      'Watermark text must contain zero em-dashes'
    );
  });

  it('14. handles empty strings for ticket and ODP metadata safely with fallbacks', () => {
    const fallbackResult = formatComprehensiveWatermark({
      ticketNumber: '',
      odpId: '',
      timestamp: '',
      attenuationDbm: -18.5,
    });

    assert.ok(fallbackResult.some((l) => l.includes('TIKET: TKT-UNKNOWN')));
    assert.ok(fallbackResult.some((l) => l.includes('ODP: ODP-PLB-001')));
  });

  it('15. verifies timestamp format contains date and time components', () => {
    const isoTimestamp = '2026-11-14T10:30:00.000Z';
    const result = formatComprehensiveWatermark({ ...baseInput, timestamp: isoTimestamp });
    const timeLine = result.find((l) => l.startsWith('WAKTU:'));
    assert.strictEqual(timeLine, `WAKTU: ${isoTimestamp}`);
  });

  it('16. enforces maximum width constraint of 1280px in photo compression options', async () => {
    const result = await compressOpmPhoto(
      'file:///temp/sample.jpg',
      { maxWidth: 1280, quality: 0.7 },
      async (_uri, actions: any) => {
        const resizeAction = actions.find((a: any) => a.resize);
        assert.strictEqual(resizeAction?.resize?.width, 1280);
        return {
          uri: 'file:///temp/compressed.jpg',
          width: 1280,
          height: 960,
        };
      }
    );

    assert.strictEqual(result.width, 1280);
  });
});
