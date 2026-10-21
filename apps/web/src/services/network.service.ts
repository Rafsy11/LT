import { prisma } from '@repo/database';

export interface SplitterPortActivity {
  type: 'PEMASANGAN' | 'MAINTENANCE' | 'PENARIKAN';
  date: string;
  technician: string;
  ticketNumber?: string;
  notes?: string;
}

export interface SplitterPortState {
  portNumber: number;
  isOccupied: boolean;
  customerName?: string;
  siaNumber?: string;
  attenuation?: number;
  attenuationHistory?: number[];
  lastActivity?: SplitterPortActivity;
  status?: string;
}

export interface ClusterListItem {
  id: string;
  clusterCode: string;
  name: string;
  splitterCode: string;
  usedPorts: number;
  maxPorts: number;
  lat: number;
  lng: number;
  ports: SplitterPortState[];
}

export const FALLBACK_CLUSTERS: ClusterListItem[] = [
  {
    id: 'splitter-bdg-01',
    clusterCode: 'BDG-01',
    name: 'Bandung Utara',
    splitterCode: 'ODP-BDG-01',
    usedPorts: 5,
    maxPorts: 8,
    lat: -6.914744,
    lng: 107.60981,
    ports: [
      {
        portNumber: 1,
        isOccupied: true,
        customerName: 'Rudi Hermawan',
        siaNumber: 'SIA-2024-004',
        attenuation: -18.4,
        attenuationHistory: [-19.2, -18.8, -18.4],
        lastActivity: { type: 'MAINTENANCE', date: '16 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'TKT-2026-077', notes: 'Splicing ulang pigtail' },
        status: 'ACTIVE',
      },
      {
        portNumber: 2,
        isOccupied: true,
        customerName: 'Dewi Lestari',
        siaNumber: 'SIA-2024-005',
        attenuation: -19.2,
        attenuationHistory: [-19.5, -19.2],
        lastActivity: { type: 'PEMASANGAN', date: '11 Okt 2026', technician: 'Budi Santoso', ticketNumber: 'PSB-2026-112' },
        status: 'ACTIVE',
      },
      {
        portNumber: 3,
        isOccupied: true,
        customerName: 'Budi Santoso',
        siaNumber: 'SIA-2024-001',
        attenuation: -17.8,
        attenuationHistory: [-18.5, -17.8],
        lastActivity: { type: 'MAINTENANCE', date: '04 Okt 2026', technician: 'Dedi Kurniawan', ticketNumber: 'TKT-2026-069' },
        status: 'ACTIVE',
      },
      {
        portNumber: 4,
        isOccupied: false,
        lastActivity: { type: 'PENARIKAN', date: '28 Sep 2026', technician: 'Hendro Wijaya', ticketNumber: 'DIS-2026-018', notes: 'Pelanggan relokasi' },
      },
      {
        portNumber: 5,
        isOccupied: true,
        customerName: 'Siti Aminah',
        siaNumber: 'SIA-2024-002',
        attenuation: -20.1,
        attenuationHistory: [-20.8, -20.1],
        lastActivity: { type: 'PEMASANGAN', date: '19 Sep 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-091' },
        status: 'ACTIVE',
      },
      {
        portNumber: 6,
        isOccupied: false,
      },
      {
        portNumber: 7,
        isOccupied: true,
        customerName: 'Hendro Wijaya',
        siaNumber: 'SIA-2024-006',
        attenuation: -21.4,
        attenuationHistory: [-22.5, -21.4],
        lastActivity: { type: 'MAINTENANCE', date: '02 Sep 2026', technician: 'Budi Santoso', ticketNumber: 'TKT-2026-048', notes: 'Pembersihan adapter ferrule' },
        status: 'ACTIVE',
      },
      {
        portNumber: 8,
        isOccupied: false,
      },
    ],
  },
  {
    id: 'splitter-bdg-02',
    clusterCode: 'BDG-01',
    name: 'Bandung Utara',
    splitterCode: 'ODP-BDG-02',
    usedPorts: 3,
    maxPorts: 8,
    lat: -6.91612,
    lng: 107.61145,
    ports: [
      {
        portNumber: 1,
        isOccupied: true,
        customerName: 'Kurnia Meiga',
        siaNumber: 'SIA-2024-011',
        attenuation: -18.1,
        attenuationHistory: [-18.6, -18.1],
        lastActivity: { type: 'PEMASANGAN', date: '15 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-121' },
        status: 'ACTIVE',
      },
      {
        portNumber: 2,
        isOccupied: true,
        customerName: 'Yanto Basna',
        siaNumber: 'SIA-2024-012',
        attenuation: -19.0,
        attenuationHistory: [-19.0],
        lastActivity: { type: 'PEMASANGAN', date: '08 Okt 2026', technician: 'Dedi Kurniawan', ticketNumber: 'PSB-2026-105' },
        status: 'ACTIVE',
      },
      {
        portNumber: 3,
        isOccupied: false,
        lastActivity: { type: 'PENARIKAN', date: '01 Okt 2026', technician: 'Budi Santoso', ticketNumber: 'DIS-2026-022' },
      },
      {
        portNumber: 4,
        isOccupied: true,
        customerName: 'Bambang Pamungkas',
        siaNumber: 'SIA-2024-014',
        attenuation: -18.7,
        attenuationHistory: [-19.4, -18.7],
        lastActivity: { type: 'MAINTENANCE', date: '25 Sep 2026', technician: 'Hendro Wijaya', ticketNumber: 'TKT-2026-061' },
        status: 'ACTIVE',
      },
      { portNumber: 5, isOccupied: false },
      { portNumber: 6, isOccupied: false },
      { portNumber: 7, isOccupied: false },
      { portNumber: 8, isOccupied: false },
    ],
  },
  {
    id: 'splitter-bdg-03',
    clusterCode: 'BDG-02',
    name: 'Bandung Selatan',
    splitterCode: 'ODP-BDG-03',
    usedPorts: 7,
    maxPorts: 16,
    lat: -6.953245,
    lng: 107.628912,
    ports: Array.from({ length: 16 }, (_, i) => {
      const pNum = i + 1;
      const occupied = [1, 2, 3, 5, 7, 9, 12].includes(pNum);
      const names: Record<number, string> = {
        1: 'Ahmad Dahlan',
        2: 'Farida Nur',
        3: 'Iwan Fals',
        5: 'Rina Nose',
        7: 'Agus Salim',
        9: 'Dedi Kusnandar',
        12: 'Citra Kirana',
      };
      const atts: Record<number, number> = {
        1: -18.9, 2: -19.5, 3: -22.4, 5: -17.6, 7: -23.1, 9: -18.2, 12: -20.8
      };
      const historyMap: Record<number, number[]> = {
        1: [-19.5, -18.9],
        2: [-19.8, -19.5],
        3: [-23.5, -22.4],
        5: [-18.2, -17.6],
        7: [-24.2, -23.1],
        9: [-18.2],
        12: [-21.4, -20.8],
      };
      const activityMap: Record<number, SplitterPortActivity> = {
        1: { type: 'MAINTENANCE', date: '17 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'TKT-2026-079' },
        2: { type: 'PEMASANGAN', date: '14 Okt 2026', technician: 'Budi Santoso', ticketNumber: 'PSB-2026-118' },
        3: { type: 'MAINTENANCE', date: '10 Okt 2026', technician: 'Dedi Kurniawan', ticketNumber: 'TKT-2026-071', notes: 'Redaman tinggi diturunkan' },
        5: { type: 'PEMASANGAN', date: '01 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-098' },
        7: { type: 'MAINTENANCE', date: '24 Sep 2026', technician: 'Hendro Wijaya', ticketNumber: 'TKT-2026-059' },
        9: { type: 'PEMASANGAN', date: '15 Sep 2026', technician: 'Budi Santoso', ticketNumber: 'PSB-2026-087' },
        12: { type: 'PEMASANGAN', date: '01 Sep 2026', technician: 'Dedi Kurniawan', ticketNumber: 'PSB-2026-074' },
      };

      const isDismantled = pNum === 4;

      return {
        portNumber: pNum,
        isOccupied: occupied,
        customerName: occupied ? names[pNum] || `Pelanggan Port ${pNum}` : undefined,
        siaNumber: occupied ? `SIA-2024-${String(pNum).padStart(3, '0')}` : undefined,
        attenuation: occupied ? atts[pNum] : undefined,
        attenuationHistory: occupied ? historyMap[pNum] : undefined,
        lastActivity: occupied
          ? activityMap[pNum]
          : isDismantled
          ? { type: 'PENARIKAN', date: '18 Sep 2026', technician: 'Hendro Wijaya', ticketNumber: 'DIS-2026-015' }
          : undefined,
        status: occupied ? 'ACTIVE' : undefined,
      };
    }),
  },
  {
    id: 'splitter-bdg-04',
    clusterCode: 'BDG-02',
    name: 'Bandung Selatan',
    splitterCode: 'ODP-BDG-04',
    usedPorts: 4,
    maxPorts: 8,
    lat: -6.95511,
    lng: 107.63025,
    ports: [
      {
        portNumber: 1,
        isOccupied: true,
        customerName: 'Slamet Riyadi',
        siaNumber: 'SIA-2024-BS01',
        attenuation: -18.3,
        attenuationHistory: [-18.9, -18.3],
        lastActivity: { type: 'PEMASANGAN', date: '13 Okt 2026', technician: 'Budi Santoso', ticketNumber: 'PSB-2026-115' },
        status: 'ACTIVE',
      },
      {
        portNumber: 2,
        isOccupied: true,
        customerName: 'Hartono Wijaya',
        siaNumber: 'SIA-2024-BS02',
        attenuation: -19.4,
        attenuationHistory: [-19.4],
        lastActivity: { type: 'PEMASANGAN', date: '06 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-102' },
        status: 'ACTIVE',
      },
      {
        portNumber: 3,
        isOccupied: false,
        lastActivity: { type: 'PENARIKAN', date: '29 Sep 2026', technician: 'Dedi Kurniawan', ticketNumber: 'DIS-2026-020' },
      },
      {
        portNumber: 4,
        isOccupied: true,
        customerName: 'Endang Sukamti',
        siaNumber: 'SIA-2024-BS03',
        attenuation: -19.0,
        attenuationHistory: [-19.6, -19.0],
        lastActivity: { type: 'MAINTENANCE', date: '22 Sep 2026', technician: 'Hendro Wijaya', ticketNumber: 'TKT-2026-056' },
        status: 'ACTIVE',
      },
      {
        portNumber: 5,
        isOccupied: true,
        customerName: 'Totok Suharto',
        siaNumber: 'SIA-2024-BS04',
        attenuation: -18.7,
        attenuationHistory: [-18.7],
        lastActivity: { type: 'PEMASANGAN', date: '12 Sep 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-085' },
        status: 'ACTIVE',
      },
      { portNumber: 6, isOccupied: false },
      { portNumber: 7, isOccupied: false },
      { portNumber: 8, isOccupied: false },
    ],
  },
  {
    id: 'splitter-bdg-05',
    clusterCode: 'BDG-03',
    name: 'Bandung Timur',
    splitterCode: 'ODP-BDG-05',
    usedPorts: 10,
    maxPorts: 16,
    lat: -6.924812,
    lng: 107.662145,
    ports: Array.from({ length: 16 }, (_, i) => {
      const pNum = i + 1;
      const occupied = pNum <= 10;
      const currAtt = occupied ? Number((-18.5 - pNum * 0.3).toFixed(1)) : undefined;
      const prevAtt = occupied ? Number((currAtt! - 0.5).toFixed(1)) : undefined;

      const activityTypes: Array<'PEMASANGAN' | 'MAINTENANCE'> = [
        'MAINTENANCE', 'PEMASANGAN', 'MAINTENANCE', 'PEMASANGAN',
        'MAINTENANCE', 'PEMASANGAN', 'MAINTENANCE', 'PEMASANGAN',
        'MAINTENANCE', 'PEMASANGAN'
      ];

      return {
        portNumber: pNum,
        isOccupied: occupied,
        customerName: occupied ? `Pelanggan BT-${pNum}` : undefined,
        siaNumber: occupied ? `SIA-2024-BT${String(pNum).padStart(2, '0')}` : undefined,
        attenuation: currAtt,
        attenuationHistory: occupied ? [prevAtt!, currAtt!] : undefined,
        lastActivity: occupied
          ? {
              type: activityTypes[pNum - 1],
              date: `${19 - pNum} Okt 2026`,
              technician: pNum % 2 === 0 ? 'Budi Santoso' : 'Andi Pratama',
              ticketNumber: activityTypes[pNum - 1] === 'MAINTENANCE' ? `TKT-2026-0${80 + pNum}` : `PSB-2026-1${10 + pNum}`,
              notes: activityTypes[pNum - 1] === 'MAINTENANCE' ? 'Optimasi sambungan kabel drop core' : 'Instalasi modem ONT & drop wire',
            }
          : pNum === 11
          ? {
              type: 'PENARIKAN',
              date: '05 Okt 2026',
              technician: 'Dedi Kurniawan',
              ticketNumber: 'DIS-2026-025',
              notes: 'Terminasi kontrak pelanggan',
            }
          : undefined,
        status: occupied ? 'ACTIVE' : undefined,
      };
    }),
  },
  {
    id: 'splitter-bdg-06',
    clusterCode: 'BDG-03',
    name: 'Bandung Timur',
    splitterCode: 'ODP-BDG-06',
    usedPorts: 6,
    maxPorts: 16,
    lat: -6.92715,
    lng: 107.6645,
    ports: Array.from({ length: 16 }, (_, i) => {
      const pNum = i + 1;
      const occupied = [1, 2, 4, 6, 8, 10].includes(pNum);
      return {
        portNumber: pNum,
        isOccupied: occupied,
        customerName: occupied ? `Pelanggan BT-B${pNum}` : undefined,
        siaNumber: occupied ? `SIA-2024-BTB${String(pNum).padStart(2, '0')}` : undefined,
        attenuation: occupied ? Number((-19.0 - pNum * 0.2).toFixed(1)) : undefined,
        attenuationHistory: occupied ? [Number((-19.5 - pNum * 0.2).toFixed(1)), Number((-19.0 - pNum * 0.2).toFixed(1))] : undefined,
        lastActivity: occupied
          ? {
              type: pNum % 2 === 0 ? 'MAINTENANCE' : 'PEMASANGAN',
              date: `${15 - pNum} Okt 2026`,
              technician: 'Hendro Wijaya',
              ticketNumber: `TKT-2026-0${70 + pNum}`,
            }
          : undefined,
        status: occupied ? 'ACTIVE' : undefined,
      };
    }),
  },
  {
    id: 'splitter-bdg-07',
    clusterCode: 'BDG-04',
    name: 'Bandung Barat',
    splitterCode: 'ODP-BDG-07',
    usedPorts: 2,
    maxPorts: 8,
    lat: -6.8905,
    lng: 107.5654,
    ports: [
      {
        portNumber: 1,
        isOccupied: true,
        customerName: 'Yayan Ruhian',
        siaNumber: 'SIA-2024-BB01',
        attenuation: -18.0,
        attenuationHistory: [-18.5, -18.0],
        lastActivity: { type: 'PEMASANGAN', date: '16 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-124' },
        status: 'ACTIVE',
      },
      {
        portNumber: 2,
        isOccupied: true,
        customerName: 'Cecep Arif',
        siaNumber: 'SIA-2024-BB02',
        attenuation: -19.2,
        attenuationHistory: [-19.2],
        lastActivity: { type: 'MAINTENANCE', date: '09 Okt 2026', technician: 'Budi Santoso', ticketNumber: 'TKT-2026-073' },
        status: 'ACTIVE',
      },
      { portNumber: 3, isOccupied: false },
      { portNumber: 4, isOccupied: false },
      { portNumber: 5, isOccupied: false },
      { portNumber: 6, isOccupied: false },
      { portNumber: 7, isOccupied: false },
      { portNumber: 8, isOccupied: false },
    ],
  },
  {
    id: 'splitter-bdg-08',
    clusterCode: 'BDG-04',
    name: 'Bandung Barat',
    splitterCode: 'ODP-BDG-08',
    usedPorts: 3,
    maxPorts: 8,
    lat: -6.892341,
    lng: 107.567812,
    ports: [
      {
        portNumber: 1,
        isOccupied: true,
        customerName: 'Ferry Salim',
        siaNumber: 'SIA-2024-BB03',
        attenuation: -17.5,
        attenuationHistory: [-18.1, -17.5],
        lastActivity: { type: 'MAINTENANCE', date: '14 Okt 2026', technician: 'Dedi Kurniawan', ticketNumber: 'TKT-2026-075' },
        status: 'ACTIVE',
      },
      { portNumber: 2, isOccupied: false },
      {
        portNumber: 3,
        isOccupied: true,
        customerName: 'Gita Gutawa',
        siaNumber: 'SIA-2024-BB04',
        attenuation: -19.0,
        attenuationHistory: [-19.0],
        lastActivity: { type: 'PEMASANGAN', date: '07 Okt 2026', technician: 'Andi Pratama', ticketNumber: 'PSB-2026-104' },
        status: 'ACTIVE',
      },
      {
        portNumber: 4,
        isOccupied: false,
        lastActivity: { type: 'PENARIKAN', date: '26 Sep 2026', technician: 'Hendro Wijaya', ticketNumber: 'DIS-2026-017' },
      },
      {
        portNumber: 5,
        isOccupied: true,
        customerName: 'Haris Munandar',
        siaNumber: 'SIA-2024-BB05',
        attenuation: -18.2,
        attenuationHistory: [-18.9, -18.2],
        lastActivity: { type: 'MAINTENANCE', date: '18 Sep 2026', technician: 'Budi Santoso', ticketNumber: 'TKT-2026-052' },
        status: 'ACTIVE',
      },
      { portNumber: 6, isOccupied: false },
      { portNumber: 7, isOccupied: false },
      { portNumber: 8, isOccupied: false },
    ],
  },
];

export class NetworkService {
  /**
   * Lists network clusters & ODP splitters with live port occupancy from PostgreSQL Prisma.
   */
  public static async listClusters(
    search = '',
    clusterFilter = 'Semua cluster'
  ): Promise<ClusterListItem[]> {
    try {
      const clusters = await prisma.networkCluster.findMany({
        include: {
          splitters: {
            include: {
              customers: {
                where: { status: 'ACTIVE' },
                select: { portNumber: true, fullName: true, siaNumber: true, currentAttenuation: true, status: true },
              },
            },
          },
        },
        orderBy: { clusterCode: 'asc' },
      });

      if (clusters.length > 0) {
        const result: ClusterListItem[] = [];

        for (const c of clusters) {
          for (const s of c.splitters) {
            const customerMap = new Map<number, { fullName: string; siaNumber: string; attenuation?: number; status?: string }>();
            for (const cust of s.customers) {
              if (cust.portNumber) {
                customerMap.set(cust.portNumber, {
                  fullName: cust.fullName,
                  siaNumber: cust.siaNumber,
                  attenuation: cust.currentAttenuation ? Number(cust.currentAttenuation) : undefined,
                  status: cust.status,
                });
              }
            }

            const ports: SplitterPortState[] = [];
            for (let p = 1; p <= s.maxPorts; p++) {
              const custInfo = customerMap.get(p);
              ports.push({
                portNumber: p,
                isOccupied: Boolean(custInfo),
                customerName: custInfo?.fullName,
                siaNumber: custInfo?.siaNumber,
                attenuation: custInfo?.attenuation,
                status: custInfo?.status,
              });
            }

            const usedPorts = ports.filter((p) => p.isOccupied).length;

            result.push({
              id: s.id,
              clusterCode: c.clusterCode,
              name: c.name,
              splitterCode: s.splitterCode,
              usedPorts,
              maxPorts: s.maxPorts,
              lat: Number(s.lat),
              lng: Number(s.lng),
              ports,
            });
          }
        }

        let filtered = result;
        if (clusterFilter && clusterFilter !== 'Semua cluster') {
          filtered = filtered.filter((item) => item.name.includes(clusterFilter.replace('Bandung ', '')));
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          filtered = filtered.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              item.clusterCode.toLowerCase().includes(q) ||
              item.splitterCode.toLowerCase().includes(q)
          );
        }
        return filtered;
      }
    } catch (err) {
      console.warn('[NetworkService] DB listClusters failed, using fallback:', (err as Error).message);
    }

    // Graceful fallback
    let fallback = [...FALLBACK_CLUSTERS];
    if (clusterFilter && clusterFilter !== 'Semua cluster') {
      fallback = fallback.filter((c) => c.name.includes(clusterFilter.replace('Bandung ', '')));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      fallback = fallback.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.clusterCode.toLowerCase().includes(q) ||
          c.splitterCode.toLowerCase().includes(q)
      );
    }
    return fallback;
  }

  public static async getSplitterDetail(splitterCode: string): Promise<ClusterListItem> {
    const list = await this.listClusters();
    const item = list.find((c) => c.splitterCode === splitterCode);
    if (!item) {
      throw new Error(`Splitter ${splitterCode} tidak ditemukan`);
    }
    return item;
  }

  public static async getNetworkStats() {
    const list = await this.listClusters();
    const totalClusters = new Set(list.map((c) => c.clusterCode)).size;
    const totalSplitters = list.length;
    const totalCapacity = list.reduce((acc, c) => acc + c.maxPorts, 0);
    const usedCapacity = list.reduce((acc, c) => acc + c.usedPorts, 0);
    const availableCapacity = totalCapacity - usedCapacity;

    return {
      totalClusters,
      totalSplitters,
      totalCapacity,
      usedCapacity,
      availableCapacity,
    };
  }
}
