import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

export interface RawDatekRow {
  rowNumber?: number;
  sia: string;
  customerName: string;
  rawCustomerCoord?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  odpName?: string | null;
  rawOdpCoord?: string | null;
  odpLat?: number | null;
  odpLng?: number | null;
  port?: number | null;
  gponNode: string;
  ontSn?: string | null;
  oltSlot?: string | null;
  redaman?: number | null;
  catatan?: string | null;
}

export interface PalembangClusterData {
  clusterCode: string;
  name: string;
  centerLat: number;
  centerLng: number;
  isActive: boolean;
}

export interface PalembangSplitterData {
  splitterCode: string;
  clusterCode: string;
  name: string | null;
  notes: string | null;
  lat: number;
  lng: number;
  maxPorts: number;
  isActive: boolean;
  coordKey: string;
}

export interface PalembangCustomerData {
  siaNumber: string;
  fullName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  clusterCode: string;
  splitterCode: string | null;
  portNumber: number | null;
  currentAttenuation: number | null;
  status: 'ACTIVE' | 'PENDING_INSTALL';
  gponNode: string | null;
  oltSlot: string | null;
  ontSn: string | null;
  notes: string | null;
}

export interface PalembangTopologySummary {
  totalRows: number;
  uniqueSias: number;
  uniqueSplitters: number;
  clusters: number;
  rowsWithoutOdp: number;
  duplicateSiasMerged: number;
  commaCoordinatesNormalized: number;
  outliersDetected: number;
}

export interface PalembangTopologyAnomalies {
  duplicateSias: {
    sia: string;
    keptRow: number;
    droppedRow: number;
    reason: string;
  }[];
  outliers: {
    sia: string;
    name: string;
    lat: number;
    lng: number;
    locationNote: string;
  }[];
  coordinateFixes: {
    rowNumber: number;
    field: 'customer' | 'odp';
    raw: string;
    parsedLat: number;
    parsedLng: number;
  }[];
}

export interface PalembangTopology {
  clusters: PalembangClusterData[];
  splitters: PalembangSplitterData[];
  customers: PalembangCustomerData[];
  summary: PalembangTopologySummary;
  anomalies: PalembangTopologyAnomalies;
}

export interface PalembangImportResult {
  success: boolean;
  dryRun: boolean;
  summary: PalembangTopologySummary;
  anomalies: PalembangTopologyAnomalies;
  counts?: {
    clusters: number;
    splitters: number;
    customers: number;
  };
  durationMs: number;
}

export const SOUTH_SUMATRA_GEOFENCE = {
  minLat: -4.0,
  maxLat: -2.0,
  minLng: 103.5,
  maxLng: 106.0,
};

export const PALEMBANG_CLUSTERS: PalembangClusterData[] = [
  {
    clusterCode: 'PLBHRAGA01',
    name: 'Palembang H. R. Agam',
    centerLat: -2.974656,
    centerLng: 104.756455,
    isActive: true,
  },
  {
    clusterCode: 'PLBBSGGA01',
    name: 'Palembang Basuki Rahmat',
    centerLat: -2.976546,
    centerLng: 104.751214,
    isActive: true,
  },
  {
    clusterCode: 'PLBKBNGR01',
    name: 'Palembang Kebun Bunga',
    centerLat: -2.914267,
    centerLng: 104.723914,
    isActive: true,
  },
  {
    clusterCode: 'PLBTKEGR01',
    name: 'Palembang Kenten',
    centerLat: -2.954798,
    centerLng: 104.771168,
    isActive: true,
  },
];

const CLUSTER_PRIORITY = ['PLBHRAGA01', 'PLBBSGGA01', 'PLBKBNGR01', 'PLBTKEGR01'];

/**
 * Detects whether a coordinate string contains comma as a decimal separator (e.g. -2,98424)
 * rather than simply a delimiter between two standard dot-decimal coordinates.
 */
export function hasCommaDecimal(str?: string | null): boolean {
  if (!str) return false;
  const matches = str.match(/(?<!\.\d*)-?\d+,\d+/g);
  return Boolean(matches && matches.length > 0);
}

/**
 * Parses raw coordinate strings, normalizing comma decimals and space/newline delimiters.
 * Checks against the South Sumatra geofence.
 */
export function parseCoordinatePair(raw: string | null | undefined): {
  lat: number;
  lng: number;
  isOutlier: boolean;
} | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') {
    return null;
  }

  const matches = s.match(/-?\d+(?:[,\.]\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const lat = parseFloat(matches[0].replace(',', '.'));
  const lng = parseFloat(matches[1].replace(',', '.'));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const isOutlier =
    lat < SOUTH_SUMATRA_GEOFENCE.minLat ||
    lat > SOUTH_SUMATRA_GEOFENCE.maxLat ||
    lng < SOUTH_SUMATRA_GEOFENCE.minLng ||
    lng > SOUTH_SUMATRA_GEOFENCE.maxLng;

  return { lat, lng, isOutlier };
}

/**
 * Loads default bundled Palembang datek JSON dataset from data/palembang-datek.json.
 */
export function loadBundledPalembangDatek(): RawDatekRow[] {
  const possiblePaths = [
    path.join(__dirname, '../../data/palembang-datek.json'),
    path.join(__dirname, '../data/palembang-datek.json'),
    path.join(process.cwd(), 'packages/database/data/palembang-datek.json'),
    path.join(process.cwd(), 'data/palembang-datek.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      return JSON.parse(content) as RawDatekRow[];
    }
  }

  throw new Error(
    `Palembang datek dataset not found. Checked: ${possiblePaths.join(', ')}`,
  );
}

/**
 * Cleans ODP landmark name, stripping redundant port listing noise when storing in NetworkSplitter.name.
 */
function cleanOdpName(rawName: string | null | undefined): { name: string | null; notes: string | null } {
  if (!rawName) return { name: null, notes: null };
  const trimmed = rawName.trim();
  if (!trimmed) return { name: null, notes: null };

  // Detect port details like P1=UNKNOW ... in the string
  if (trimmed.includes('P1=') || trimmed.includes('P1 =')) {
    const splitIndex = trimmed.search(/\bP1\s*=/i);
    if (splitIndex > 0) {
      const baseName = trimmed.slice(0, splitIndex).trim();
      const portNotes = trimmed.slice(splitIndex).trim();
      return {
        name: baseName.length > 0 ? baseName : trimmed.slice(0, 100),
        notes: portNotes,
      };
    }
  }

  if (trimmed.length > 120) {
    return {
      name: trimmed.slice(0, 120).trim(),
      notes: trimmed,
    };
  }

  return { name: trimmed, notes: null };
}

/**
 * Builds the canonical Palembang topology from raw datek rows:
 * - 4 GPON Clusters
 * - 90 Deduplicated Physical Splitters (ODP-PLB-001..090)
 * - 401 Unique Customers (10 duplicate SIAs merged, 132 unassigned rows preserved)
 */
export function buildPalembangTopology(rawRows?: RawDatekRow[]): PalembangTopology {
  const rows = rawRows !== undefined ? rawRows : loadBundledPalembangDatek();

  const anomalies: PalembangTopologyAnomalies = {
    duplicateSias: [],
    outliers: [],
    coordinateFixes: [],
  };

  let commaCoordsCount = 0;

  // Track coordinate comma normalization
  for (const row of rows) {
    const rowNum = row.rowNumber ?? 0;
    let rowHasCommaDecimal = false;
    if (row.rawOdpCoord && hasCommaDecimal(row.rawOdpCoord)) {
      rowHasCommaDecimal = true;
      const parsed = parseCoordinatePair(row.rawOdpCoord);
      if (parsed) {
        anomalies.coordinateFixes.push({
          rowNumber: rowNum,
          field: 'odp',
          raw: row.rawOdpCoord,
          parsedLat: parsed.lat,
          parsedLng: parsed.lng,
        });
      }
    }
    if (row.rawCustomerCoord && hasCommaDecimal(row.rawCustomerCoord)) {
      rowHasCommaDecimal = true;
      const parsed = parseCoordinatePair(row.rawCustomerCoord);
      if (parsed) {
        anomalies.coordinateFixes.push({
          rowNumber: rowNum,
          field: 'customer',
          raw: row.rawCustomerCoord,
          parsedLat: parsed.lat,
          parsedLng: parsed.lng,
        });
      }
    }
    if (rowHasCommaDecimal) {
      commaCoordsCount++;
    }
  }

  // 1. Group physical ODP coordinates (keyed to 5 decimals)
  interface ODPGroup {
    coordKey: string;
    lat: number;
    lng: number;
    names: string[];
    clusterFreq: Record<string, number>;
  }

  const odpGroups = new Map<string, ODPGroup>();

  for (const row of rows) {
    const parsedOdp =
      row.odpLat != null && row.odpLng != null
        ? { lat: row.odpLat, lng: row.odpLng, isOutlier: false }
        : parseCoordinatePair(row.rawOdpCoord);

    if (parsedOdp) {
      const coordKey = `${parsedOdp.lat.toFixed(5)},${parsedOdp.lng.toFixed(5)}`;
      if (!odpGroups.has(coordKey)) {
        odpGroups.set(coordKey, {
          coordKey,
          lat: parsedOdp.lat,
          lng: parsedOdp.lng,
          names: [],
          clusterFreq: {},
        });
      }
      const grp = odpGroups.get(coordKey)!;
      if (row.odpName && !grp.names.includes(row.odpName)) {
        grp.names.push(row.odpName);
      }
      const gpon = row.gponNode || 'PLBHRAGA01';
      grp.clusterFreq[gpon] = (grp.clusterFreq[gpon] || 0) + 1;
    }
  }

  // Sort ODP groups deterministically: by latitude ascending, then longitude ascending
  const sortedOdpKeys = Array.from(odpGroups.keys()).sort((a, b) => {
    const grpA = odpGroups.get(a)!;
    const grpB = odpGroups.get(b)!;
    if (Math.abs(grpA.lat - grpB.lat) > 0.000001) {
      return grpA.lat - grpB.lat;
    }
    return grpA.lng - grpB.lng;
  });

  const splitters: PalembangSplitterData[] = [];
  const coordKeyToSplitterCode = new Map<string, string>();

  sortedOdpKeys.forEach((key, idx) => {
    const grp = odpGroups.get(key)!;
    const splitterCode = `ODP-PLB-${String(idx + 1).padStart(3, '0')}`;
    coordKeyToSplitterCode.set(key, splitterCode);

    // Determine majority GPON cluster with deterministic tie-breaking
    let bestCluster = CLUSTER_PRIORITY[0];
    let maxCount = -1;
    for (const clusterCode of CLUSTER_PRIORITY) {
      const count = grp.clusterFreq[clusterCode] || 0;
      if (count > maxCount) {
        maxCount = count;
        bestCluster = clusterCode;
      }
    }

    // Pick best landmark name
    const rawLandmark = grp.names[0] || `ODP ${splitterCode}`;
    const cleaned = cleanOdpName(rawLandmark);

    splitters.push({
      splitterCode,
      clusterCode: bestCluster,
      name: cleaned.name,
      notes: cleaned.notes,
      lat: grp.lat,
      lng: grp.lng,
      maxPorts: 16,
      isActive: true,
      coordKey: key,
    });
  });

  // 2. Group and deduplicate Customers by SIA
  const siaGroups = new Map<string, RawDatekRow[]>();
  for (const row of rows) {
    const sia = (row.sia || '').trim();
    if (!sia) continue;
    if (!siaGroups.has(sia)) {
      siaGroups.set(sia, []);
    }
    siaGroups.get(sia)!.push(row);
  }

  const customers: PalembangCustomerData[] = [];
  let rowsWithoutOdpCount = 0;
  let duplicateSiasMergedCount = 0;

  for (const [sia, group] of siaGroups) {
    if (group.length > 1) {
      duplicateSiasMergedCount += group.length - 1;
    }

    // Score rows to choose the most complete technical telemetry
    const scored = group.map((r) => {
      let score = 0;
      if (r.ontSn && r.ontSn.trim().length > 0) score += 10;
      if (r.oltSlot && r.oltSlot.trim().length > 0) score += 10;
      if (r.redaman != null && !Number.isNaN(r.redaman)) score += 10;
      if (r.port != null) score += 5;
      if (r.odpLat != null || (r.rawOdpCoord && r.rawOdpCoord.trim().length > 0)) score += 5;
      return { row: r, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Earlier row index breaks tie
      return (a.row.rowNumber ?? 0) - (b.row.rowNumber ?? 0);
    });

    const primary = scored[0].row;

    // Log anomaly for dropped duplicate rows
    for (let i = 1; i < scored.length; i++) {
      const dropped = scored[i].row;
      anomalies.duplicateSias.push({
        sia,
        keptRow: primary.rowNumber ?? 0,
        droppedRow: dropped.rowNumber ?? 0,
        reason: `Merged into row ${primary.rowNumber ?? 0} with higher technical completeness score (${scored[0].score} vs ${scored[i].score})`,
      });
    }

    // Parse customer coordinate
    const parsedCust =
      primary.customerLat != null && primary.customerLng != null
        ? {
            lat: primary.customerLat,
            lng: primary.customerLng,
            isOutlier:
              primary.customerLat < SOUTH_SUMATRA_GEOFENCE.minLat ||
              primary.customerLat > SOUTH_SUMATRA_GEOFENCE.maxLat ||
              primary.customerLng < SOUTH_SUMATRA_GEOFENCE.minLng ||
              primary.customerLng > SOUTH_SUMATRA_GEOFENCE.maxLng,
          }
        : parseCoordinatePair(primary.rawCustomerCoord);

    if (parsedCust && parsedCust.isOutlier) {
      let locNote = 'Outlier';
      if (parsedCust.lat < -6.5) locNote = 'Jawa Barat (Bandung)';
      else if (parsedCust.lat < -5.5) locNote = 'Jabodetabek (Tangerang/Jakarta)';
      else if (parsedCust.lat < -4.5) locNote = 'Lampung';

      anomalies.outliers.push({
        sia,
        name: primary.customerName,
        lat: parsedCust.lat,
        lng: parsedCust.lng,
        locationNote: locNote,
      });
    }

    // Determine connected ODP splitter
    const parsedOdp =
      primary.odpLat != null && primary.odpLng != null
        ? { lat: primary.odpLat, lng: primary.odpLng, isOutlier: false }
        : parseCoordinatePair(primary.rawOdpCoord);

    let assignedSplitterCode: string | null = null;
    if (parsedOdp) {
      const coordKey = `${parsedOdp.lat.toFixed(5)},${parsedOdp.lng.toFixed(5)}`;
      assignedSplitterCode = coordKeyToSplitterCode.get(coordKey) || null;
    }

    if (!assignedSplitterCode) {
      rowsWithoutOdpCount++;
    }

    // Compose notes
    const notesParts: string[] = [];
    if (primary.catatan && primary.catatan.trim().length > 0) {
      notesParts.push(primary.catatan.trim());
    }
    // If secondary duplicate rows had alternative names or ODP info, append
    if (group.length > 1) {
      for (let i = 1; i < group.length; i++) {
        const alt = group[i];
        if (alt.customerName && alt.customerName !== primary.customerName) {
          notesParts.push(`Alias: ${alt.customerName}`);
        }
        if (alt.odpName && alt.odpName !== primary.odpName) {
          notesParts.push(`Ref ODP: ${alt.odpName}`);
        }
        if (alt.gponNode && alt.gponNode !== primary.gponNode) {
          notesParts.push(`Alt GPON: ${alt.gponNode}`);
        }
      }
    }
    if (parsedCust && parsedCust.isOutlier) {
      notesParts.push('[Koordinat Luar Sumsel]');
    }

    const clusterCode = primary.gponNode || 'PLBHRAGA01';
    const clusterObj = PALEMBANG_CLUSTERS.find((c) => c.clusterCode === clusterCode);
    const clusterName = clusterObj?.name || 'Palembang';

    const address = primary.odpName
      ? `Area ${primary.odpName}, Palembang`
      : `Area ${clusterName}, Palembang`;

    customers.push({
      siaNumber: sia,
      fullName: primary.customerName || `Pelanggan ${sia}`,
      address,
      lat: parsedCust ? parsedCust.lat : null,
      lng: parsedCust ? parsedCust.lng : null,
      clusterCode,
      splitterCode: assignedSplitterCode,
      portNumber: assignedSplitterCode ? primary.port ?? null : null,
      currentAttenuation: primary.redaman != null ? primary.redaman : null,
      status: assignedSplitterCode ? 'ACTIVE' : 'PENDING_INSTALL',
      gponNode: primary.gponNode || null,
      oltSlot: primary.oltSlot || null,
      ontSn: primary.ontSn || null,
      notes: notesParts.length > 0 ? notesParts.join('; ') : null,
    });
  }

  const rawRowsWithoutOdp = rows.filter(
    (r) => !r.odpLat && (!r.rawOdpCoord || !r.rawOdpCoord.trim()),
  ).length;

  const summary: PalembangTopologySummary = {
    totalRows: rows.length,
    uniqueSias: customers.length,
    uniqueSplitters: splitters.length,
    clusters: PALEMBANG_CLUSTERS.length,
    rowsWithoutOdp: rawRowsWithoutOdp,
    duplicateSiasMerged: duplicateSiasMergedCount,
    commaCoordinatesNormalized: commaCoordsCount,
    outliersDetected: anomalies.outliers.length,
  };

  return {
    clusters: PALEMBANG_CLUSTERS,
    splitters,
    customers,
    summary,
    anomalies,
  };
}

/**
 * Executes idempotent upsert import of Palembang topology into PostgreSQL via Prisma.
 */
export async function executePalembangImport(
  prismaClient: PrismaClient,
  topology: PalembangTopology,
  options: {
    dryRun?: boolean;
    actorUserId?: string;
    actorRole?: string;
    ipAddress?: string;
  } = {},
): Promise<PalembangImportResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun === true;

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      summary: topology.summary,
      anomalies: topology.anomalies,
      durationMs: Date.now() - startTime,
    };
  }

  // 1. Upsert Clusters
  const clusterIdMap = new Map<string, string>();
  for (const c of topology.clusters) {
    const record = await prismaClient.networkCluster.upsert({
      where: { clusterCode: c.clusterCode },
      update: {
        name: c.name,
        centerLat: c.centerLat,
        centerLng: c.centerLng,
        isActive: c.isActive,
      },
      create: {
        clusterCode: c.clusterCode,
        name: c.name,
        centerLat: c.centerLat,
        centerLng: c.centerLng,
        isActive: c.isActive,
      },
    });
    clusterIdMap.set(c.clusterCode, record.id);
  }

  // 2. Upsert Splitters
  const splitterIdMap = new Map<string, string>();
  for (const s of topology.splitters) {
    const clusterId = clusterIdMap.get(s.clusterCode);
    if (!clusterId) {
      throw new Error(`Cluster ID not resolved for cluster code: ${s.clusterCode}`);
    }
    const record = await prismaClient.networkSplitter.upsert({
      where: { splitterCode: s.splitterCode },
      update: {
        clusterId,
        name: s.name,
        notes: s.notes,
        lat: s.lat,
        lng: s.lng,
        maxPorts: s.maxPorts,
        isActive: s.isActive,
      },
      create: {
        clusterId,
        splitterCode: s.splitterCode,
        name: s.name,
        notes: s.notes,
        lat: s.lat,
        lng: s.lng,
        maxPorts: s.maxPorts,
        isActive: s.isActive,
      },
    });
    splitterIdMap.set(s.splitterCode, record.id);
  }

  // 3. Upsert Customers
  for (const c of topology.customers) {
    const clusterId = clusterIdMap.get(c.clusterCode);
    if (!clusterId) {
      throw new Error(`Cluster ID not resolved for customer ${c.siaNumber} with cluster: ${c.clusterCode}`);
    }
    const splitterId = c.splitterCode ? splitterIdMap.get(c.splitterCode) ?? null : null;

    await prismaClient.customer.upsert({
      where: { siaNumber: c.siaNumber },
      update: {
        fullName: c.fullName,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        clusterId,
        splitterId,
        portNumber: c.portNumber,
        currentAttenuation: c.currentAttenuation,
        status: c.status,
        gponNode: c.gponNode,
        oltSlot: c.oltSlot,
        ontSn: c.ontSn,
        notes: c.notes,
      },
      create: {
        siaNumber: c.siaNumber,
        fullName: c.fullName,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        clusterId,
        splitterId,
        portNumber: c.portNumber,
        currentAttenuation: c.currentAttenuation,
        status: c.status,
        gponNode: c.gponNode,
        oltSlot: c.oltSlot,
        ontSn: c.ontSn,
        notes: c.notes,
      },
    });
  }

  // 4. Log Activity if actor specified
  if (options.actorUserId) {
    try {
      await prismaClient.activityLog.create({
        data: {
          actorUserId: options.actorUserId,
          actorRole: options.actorRole || 'ADMIN',
          actionType: 'NETWORK_DATEK_IMPORT',
          targetEntity: 'NETWORK_CLUSTER',
          targetId: 'PALEMBANG_MASTER',
          newPayload: JSON.parse(
            JSON.stringify({
              summary: topology.summary,
              executedAt: new Date().toISOString(),
            }),
          ),
          ipAddress: options.ipAddress || '127.0.0.1',
        },
      });
    } catch (logErr) {
      console.warn('Failed to record activity log for datek import:', logErr);
    }
  }

  return {
    success: true,
    dryRun: false,
    summary: topology.summary,
    anomalies: topology.anomalies,
    counts: {
      clusters: topology.clusters.length,
      splitters: topology.splitters.length,
      customers: topology.customers.length,
    },
    durationMs: Date.now() - startTime,
  };
}
