import { classifyDbm } from '@isp/shared';

export interface DbTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: 'Pasang baru' | 'Maintenance';
  cluster: string;
  assignedTech: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Selesai' | 'Dibatalkan';
  currentAttenuation: number;
  adminNotes?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DbCustomer {
  id: string;
  siaNumber: string;
  fullName: string;
  address: string;
  cluster: string;
  splitterCode: string;
  portNumber: number;
  currentAttenuation: number;
  status: 'ACTIVE' | 'PENDING_INSTALL' | 'ISOLATED' | 'DISMANTLED';
  updatedAt: string;
}

export interface DbCluster {
  id: string;
  clusterCode: string;
  name: string;
  splitterCode: string;
  usedPorts: number;
  maxPorts: number;
  lat: number;
  lng: number;
  ports: { portNumber: number; isOccupied: boolean; customerName?: string; siaNumber?: string }[];
}

export interface DbTechnician {
  id: string;
  username: string;
  fullName: string;
  cluster: string;
  initials: string;
  isActive: boolean;
  activeTicketsCount: number;
  completedTicketsCount: number;
}

export interface DbAttenuationHistory {
  id: string;
  submissionId: string; // UUID v4 Idempotency Key
  ticketId: string;
  siaNumber: string;
  techName: string;
  oldAttenuation?: number;
  newAttenuation: number;
  splitterCode: string;
  portNumber: number;
  photoObjectKey: string;
  submittedLat: number;
  submittedLng: number;
  distanceToSplitterM?: number;
  isLocationFlagged: boolean;
  clientRecordedAt?: string;
  createdAt: string; // Server timestamp
}

export interface DbActivityLog {
  id: string;
  actorUserId: string;
  actorRole: string;
  actionType: string;
  targetEntity: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

class MasterDataStore {
  public tickets: DbTicket[] = [
    {
      id: 't-1',
      ticketNumber: 'WO-2025-0842',
      customerName: 'Budi Santoso',
      siaNumber: '100245',
      ticketType: 'Maintenance',
      cluster: 'Bandung Utara',
      assignedTech: 'Andi Pratama',
      techInitials: 'AP',
      status: 'Dalam proses',
      currentAttenuation: -26.4,
      adminNotes: 'Redaman drop drastis di bawah -25 dBm. Periksa sambungan ODP.',
      createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 't-2',
      ticketNumber: 'WO-2025-0841',
      customerName: 'Siti Rahmawati',
      siaNumber: '100244',
      ticketType: 'Pasang baru',
      cluster: 'Bandung Timur',
      assignedTech: 'Rizky Maulana',
      techInitials: 'RM',
      status: 'Selesai',
      currentAttenuation: -19.2,
      adminNotes: 'Instalasi pelanggan baru paket 50 Mbps.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    },
    {
      id: 't-3',
      ticketNumber: 'WO-2025-0840',
      customerName: 'Dedi Kurniawan',
      siaNumber: '100243',
      ticketType: 'Maintenance',
      cluster: 'Bandung Barat',
      assignedTech: 'Fajar Hidayat',
      techInitials: 'FH',
      status: 'Menunggu',
      currentAttenuation: -23.5,
      adminNotes: 'Pelanggan melaporkan lampu LOS berkedip sesekali.',
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: 't-4',
      ticketNumber: 'WO-2025-0839',
      customerName: 'Rina Wulandari',
      siaNumber: '100242',
      ticketType: 'Pasang baru',
      cluster: 'Bandung Selatan',
      assignedTech: 'Dimas Saputra',
      techInitials: 'DS',
      status: 'Selesai',
      currentAttenuation: -18.7,
      adminNotes: 'Aktivasi port splitter nomor 4.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(),
    },
  ];

  public clusters: DbCluster[] = [
    {
      id: 'cl-1',
      clusterCode: 'CL-01',
      name: 'Bandung Utara',
      splitterCode: 'ODP-CL01-01',
      usedPorts: 8,
      maxPorts: 16,
      lat: -6.885,
      lng: 107.615,
      ports: Array.from({ length: 16 }, (_, i) => ({
        portNumber: i + 1,
        isOccupied: i < 8,
        customerName: i < 8 ? `Pelanggan Port ${i + 1}` : undefined,
        siaNumber: i < 8 ? `1002${40 + i}` : undefined,
      })),
    },
    {
      id: 'cl-2',
      clusterCode: 'CL-02',
      name: 'Bandung Timur',
      splitterCode: 'ODP-CL02-01',
      usedPorts: 6,
      maxPorts: 16,
      lat: -6.918,
      lng: 107.668,
      ports: Array.from({ length: 16 }, (_, i) => ({
        portNumber: i + 1,
        isOccupied: i < 6,
        customerName: i < 6 ? `Pelanggan Port ${i + 1}` : undefined,
        siaNumber: i < 6 ? `1003${10 + i}` : undefined,
      })),
    },
    {
      id: 'cl-3',
      clusterCode: 'CL-03',
      name: 'Bandung Barat',
      splitterCode: 'ODP-CL03-01',
      usedPorts: 9,
      maxPorts: 16,
      lat: -6.892,
      lng: 107.568,
      ports: Array.from({ length: 16 }, (_, i) => ({
        portNumber: i + 1,
        isOccupied: i < 9,
        customerName: i < 9 ? `Pelanggan Port ${i + 1}` : undefined,
        siaNumber: i < 9 ? `1004${10 + i}` : undefined,
      })),
    },
    {
      id: 'cl-4',
      clusterCode: 'CL-04',
      name: 'Bandung Selatan',
      splitterCode: 'ODP-CL04-01',
      usedPorts: 4,
      maxPorts: 16,
      lat: -6.958,
      lng: 107.625,
      ports: Array.from({ length: 16 }, (_, i) => ({
        portNumber: i + 1,
        isOccupied: i < 4,
        customerName: i < 4 ? `Pelanggan Port ${i + 1}` : undefined,
        siaNumber: i < 4 ? `1005${10 + i}` : undefined,
      })),
    },
  ];

  public customers: DbCustomer[] = [
    {
      id: 'c-1',
      siaNumber: '100245',
      fullName: 'Budi Santoso',
      address: 'Jl. Dago Atas No. 42, Coblong',
      cluster: 'Bandung Utara',
      splitterCode: 'ODP-CL01-01',
      portNumber: 3,
      currentAttenuation: -26.4,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'c-2',
      siaNumber: '100244',
      fullName: 'Siti Rahmawati',
      address: 'Jl. Soekarno Hatta No. 210, Arcamanik',
      cluster: 'Bandung Timur',
      splitterCode: 'ODP-CL02-01',
      portNumber: 1,
      currentAttenuation: -19.2,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'c-3',
      siaNumber: '100243',
      fullName: 'Dedi Kurniawan',
      address: 'Jl. Surya Sumantri No. 88, Sukajadi',
      cluster: 'Bandung Barat',
      splitterCode: 'ODP-CL03-01',
      portNumber: 5,
      currentAttenuation: -23.5,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'c-4',
      siaNumber: '100242',
      fullName: 'Rina Wulandari',
      address: 'Jl. Buah Batu Indah Blok C-4',
      cluster: 'Bandung Selatan',
      splitterCode: 'ODP-CL04-01',
      portNumber: 4,
      currentAttenuation: -18.7,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    },
  ];

  public technicians: DbTechnician[] = [
    {
      id: 'tech-1',
      username: 'andi.pratama',
      fullName: 'Andi Pratama',
      cluster: 'Bandung Utara',
      initials: 'AP',
      isActive: true,
      activeTicketsCount: 1,
      completedTicketsCount: 14,
    },
    {
      id: 'tech-2',
      username: 'rizky.maulana',
      fullName: 'Rizky Maulana',
      cluster: 'Bandung Timur',
      initials: 'RM',
      isActive: true,
      activeTicketsCount: 0,
      completedTicketsCount: 19,
    },
    {
      id: 'tech-3',
      username: 'fajar.hidayat',
      fullName: 'Fajar Hidayat',
      cluster: 'Bandung Barat',
      initials: 'FH',
      isActive: true,
      activeTicketsCount: 1,
      completedTicketsCount: 11,
    },
    {
      id: 'tech-4',
      username: 'dimas.saputra',
      fullName: 'Dimas Saputra',
      cluster: 'Bandung Selatan',
      initials: 'DS',
      isActive: true,
      activeTicketsCount: 0,
      completedTicketsCount: 23,
    },
  ];

  // APPEND-ONLY: No update/delete
  public attenuationHistories: DbAttenuationHistory[] = [
    {
      id: 'att-1',
      submissionId: 'e81a3d54-1b12-4cf4-9271-9c8e10024501',
      ticketId: 't-1',
      siaNumber: '100245',
      techName: 'Andi Pratama',
      oldAttenuation: -20.1,
      newAttenuation: -26.4,
      splitterCode: 'ODP-CL01-01',
      portNumber: 3,
      photoObjectKey: 'proofs/2025/02/t-1-opm.webp',
      submittedLat: -6.8851,
      submittedLng: 107.6152,
      distanceToSplitterM: 18.4,
      isLocationFlagged: false,
      clientRecordedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
  ];

  // APPEND-ONLY: Audit trail
  public activityLogs: DbActivityLog[] = [
    {
      id: 'log-1',
      actorUserId: 'superadmin-1',
      actorRole: 'Super Admin',
      actionType: 'SYSTEM_INITIALIZED',
      targetEntity: 'system',
      targetId: 'workspace-1',
      details: { workspace: 'Nusantara Network', deployment: 'on-premise' },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
  ];

  // Processed submission IDs for Idempotency
  public processedSubmissions: Set<string> = new Set([
    'e81a3d54-1b12-4cf4-9271-9c8e10024501',
  ]);
}

declare global {
  // eslint-disable-next-line no-var
  var masterDataStoreGlobal: MasterDataStore | undefined;
}

export const dataStore = global.masterDataStoreGlobal || new MasterDataStore();

if (process.env.NODE_ENV !== 'production') {
  global.masterDataStoreGlobal = dataStore;
}
