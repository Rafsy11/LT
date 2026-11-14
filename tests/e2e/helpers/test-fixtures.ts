/**
 * Test Fixtures for FiberOps Mobile E2E Test Suite
 * Derives canonical Palembang ODPs, test tickets, GPS coordinates, and mock camera data.
 */

export interface SplitterFixture {
  id: string;
  splitterCode?: string;
  name: string;
  clusterCode: string;
  clusterName: string;
  lat: number;
  lng: number;
  latitude?: number;
  longitude?: number;
  maxPorts: number;
  totalPorts?: number;
  occupiedPorts?: number[];
  availablePorts: number[] | number;
  status?: 'ACTIVE' | 'MAINTENANCE' | 'FULL';
}

const CLUSTERS = [
  { code: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
  { code: 'PLBHRAGA01', name: 'Palembang H. R. Agam' },
  { code: 'PLBKBNGR01', name: 'Palembang Kebun Bunga' },
  { code: 'PLBTKEGR01', name: 'Palembang Kenten' },
];

/**
 * Generate 90 canonical Palembang ODPs (ODP-PLB-001 to ODP-PLB-090)
 * Latitudes: -2.9500 to -3.0500, Longitudes: 104.7200 to 104.8000
 */
export function generateCanonicalPalembangOdps(): SplitterFixture[] {
  const odps: SplitterFixture[] = [];
  for (let i = 1; i <= 90; i++) {
    const id = `ODP-PLB-${String(i).padStart(3, '0')}`;
    const cluster = CLUSTERS[(i - 1) % CLUSTERS.length];
    const maxPorts = i % 3 === 0 ? 16 : 8;
    const availableCount = Math.max(1, (i * 3) % maxPorts);
    const availablePorts = Array.from({ length: availableCount }, (_, idx) => idx + 1);
    
    // Palembang coordinates spread
    const latOffset = ((i * 7) % 70) * 0.001;
    const lonOffset = ((i * 11) % 80) * 0.001;
    const lat = Number((-2.9600 - latOffset).toFixed(6));
    const lng = Number((104.7300 + lonOffset).toFixed(6));

    odps.push({
      id,
      splitterCode: id,
      name: `ODP ${id} ${cluster.name}`,
      clusterCode: cluster.code,
      clusterName: cluster.name,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      maxPorts,
      totalPorts: maxPorts,
      occupiedPorts: [],
      availablePorts,
      status: 'ACTIVE',
    });
  }
  return odps;
}

export const CANONICAL_PALEMBANG_ODPS: SplitterFixture[] = generateCanonicalPalembangOdps();

export const FALLBACK_ODP_ID = 'ODP-PLB-001';

/**
 * Standard test tickets including security audit fallbacks WO-2025-0842 and WO-2025-0841
 */
export const TEST_TICKETS = {
  WO_0842: {
    id: 'wo-2025-0842',
    ticketNumber: 'WO-2025-0842',
    customerName: 'PT Sriwijaya Mandiri',
    siaNumber: 'SLA-100245-0842',
    ticketType: 'Perbaikan',
    cluster: 'Palembang Kota',
    clusterCode: 'PLB-01',
    status: 'IN_PROGRESS',
    assignedToId: 'tech-001',
    assignedToUsername: 'tech.andi',
    splitterId: 'ODP-PLB-001',
    splitterCoordinates: {
      latitude: -2.9833,
      longitude: 104.7644,
    },
  },
  WO_0841: {
    id: 'wo-2025-0841',
    ticketNumber: 'WO-2025-0841',
    customerName: 'CV Musi Digital',
    siaNumber: 'SLA-100244-0841',
    ticketType: 'Perbaikan',
    cluster: 'Palembang Kota',
    clusterCode: 'PLB-01',
    status: 'IN_PROGRESS',
    assignedToId: 'tech-001',
    assignedToUsername: 'tech.andi',
    splitterId: 'ODP-PLB-034',
    splitterCoordinates: {
      latitude: -2.9912,
      longitude: 104.7588,
    },
  },
  WO_REJECTED: {
    id: 'wo-2025-0901',
    ticketNumber: 'WO-2025-0901',
    customerName: 'Bank Sumsel Babel Kantor Kas',
    siaNumber: 'SLA-100299-0901',
    ticketType: 'Aktivasi',
    cluster: 'Ilir Barat',
    clusterCode: 'PLB-02',
    status: 'REVISION_REQUIRED',
    assignedToId: 'tech-001',
    assignedToUsername: 'tech.andi',
    splitterId: 'ODP-PLB-008',
    nocNotes: 'Nilai redaman -28.5 dBm melebihi standar toleransi maksimal -24 dBm. Harap lakukan pengukuran ulang.',
    splitterCoordinates: {
      latitude: -2.9715,
      longitude: 104.7432,
    },
  },
};

/**
 * GPS Coordinate test pairs
 */
export const GPS_FIXTURES = {
  odpReference: { latitude: -2.983300, longitude: 104.764400 },
  // Within 30 meters (<100m threshold)
  withinGeofence: { latitude: -2.983450, longitude: 104.764500, accuracy: 5 },
  // ~450 meters away (>100m threshold)
  outsideGeofence: { latitude: -2.987500, longitude: 104.768000, accuracy: 12 },
  // Exactly identical coords (anti-tamper anomaly trigger)
  identicalAnomaly: { latitude: -2.983300, longitude: 104.764400, accuracy: 0 },
};

/**
 * Attenuation test values
 */
export const ATTENUATION_FIXTURES = {
  good: { dbm: -18.5, label: 'Baik', category: 'GOOD', color: 'green' },
  warning: { dbm: -23.2, label: 'Peringatan', category: 'WARNING', color: 'yellow' },
  critical: { dbm: -27.8, label: 'Kritis', category: 'CRITICAL', color: 'red' },
  outOfRangeLow: { dbm: -99.9, label: 'Tidak Valid', category: 'INVALID' },
  outOfRangeHigh: { dbm: 10.0, label: 'Tidak Valid', category: 'INVALID' },
};

/**
 * Mock camera photo binary generator (<300 KB constraint)
 */
export function createMockJpegBuffer(sizeBytes: number = 150 * 1024): Buffer {
  const buf = Buffer.alloc(sizeBytes, 0xaa);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  buf[buf.length - 2] = 0xff;
  buf[buf.length - 1] = 0xd9;
  return buf;
}
