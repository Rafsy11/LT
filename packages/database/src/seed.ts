import bcrypt from 'bcryptjs';
import { prisma } from './index';

const BCRYPT_SALT_ROUNDS = 10;

async function ensureValidBcryptHash(username: string, fallbackHash: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { passwordHash: true },
  });
  if (
    existing?.passwordHash &&
    existing.passwordHash.startsWith('$2') &&
    !existing.passwordHash.includes('mockSecureHash')
  ) {
    return existing.passwordHash;
  }
  return fallbackHash;
}

export async function seedDatabase() {
  console.log('--- Memulai Seeding Master Data FiberOps (On-Premise) ---');

  const seedPassword = process.env.SEED_DEFAULT_PASSWORD || 'FiberOps#2026';
  const defaultPasswordHash = await bcrypt.hash(seedPassword, BCRYPT_SALT_ROUNDS);

  // 1. ROLES & RBAC MATRIX (Selaras dengan ROLE_PRESETS)
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: { permissions: ['*'], hierarchyLevel: 100 },
    create: {
      name: 'Super Admin',
      permissions: ['*'],
      hierarchyLevel: 100,
    },
  });

  const adminNocRole = await prisma.role.upsert({
    where: { name: 'Admin Operasional' },
    update: {},
    create: {
      name: 'Admin Operasional',
      permissions: [
        'customer:read',
        'customer:update',
        'network:read',
        'network:update',
        'ticket:read',
        'ticket:create',
        'ticket:assign',
        'tech:manage',
        'ai:use',
      ],
      hierarchyLevel: 50,
    },
  });

  await prisma.role.upsert({
    where: { name: 'NOC Monitoring' },
    update: {},
    create: {
      name: 'NOC Monitoring',
      permissions: ['customer:read', 'network:read', 'ticket:read'],
      hierarchyLevel: 30,
    },
  });

  await prisma.role.upsert({
    where: { name: 'Customer Support' },
    update: {},
    create: {
      name: 'Customer Support',
      permissions: ['customer:read', 'ticket:read', 'ticket:create'],
      hierarchyLevel: 20,
    },
  });

  const techRole = await prisma.role.upsert({
    where: { name: 'Vendor / Teknisi Lapangan' },
    update: {
      permissions: ['ticket:read', 'ticket:submit'],
    },
    create: {
      name: 'Vendor / Teknisi Lapangan',
      permissions: ['ticket:read', 'ticket:submit'],
      hierarchyLevel: 10,
    },
  });

  // 2. USERS (Hash bcrypt valid — tidak memakai placeholder mock)
  const superAdminHash = await ensureValidBcryptHash('superadmin', defaultPasswordHash);
  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: { nik: '882041', passwordHash: superAdminHash, assignedClusters: ['Global Scope'] },
    create: {
      nik: '882041',
      username: 'superadmin',
      fullName: 'Aditya Saputra',
      passwordHash: superAdminHash,
      roleId: superAdminRole.id,
      userType: 'SUPER_ADMIN',
      isActive: true,
      twoFactorEnabled: false,
      assignedClusters: ['Global Scope'],
    },
  });

  const adminNocHash = await ensureValidBcryptHash('admin.noc', defaultPasswordHash);
  const adminNoc = await prisma.user.upsert({
    where: { username: 'admin.noc' },
    update: { nik: '882042', passwordHash: adminNocHash },
    create: {
      nik: '882042',
      username: 'admin.noc',
      fullName: 'Budi Hartono',
      passwordHash: adminNocHash,
      roleId: adminNocRole.id,
      userType: 'ADMIN',
      isActive: true,
      twoFactorEnabled: false,
      assignedClusters: ['BDG-01', 'BDG-03'],
    },
  });

  const techAndiHash = await ensureValidBcryptHash('tech.andi', defaultPasswordHash);
  const techAndi = await prisma.user.upsert({
    where: { username: 'tech.andi' },
    update: { nik: '882043', vendorCompany: 'PT Mitra Fiber Nusantara', passwordHash: techAndiHash },
    create: {
      nik: '882043',
      username: 'tech.andi',
      fullName: 'Andi Pratama',
      vendorCompany: 'PT Mitra Fiber Nusantara',
      passwordHash: techAndiHash,
      roleId: techRole.id,
      userType: 'TECHNICIAN',
      isActive: true,
      twoFactorEnabled: false,
      assignedClusters: ['BDG-01'],
    },
  });

  const techRizkyHash = await ensureValidBcryptHash('tech.rizky', defaultPasswordHash);
  const techRizky = await prisma.user.upsert({
    where: { username: 'tech.rizky' },
    update: { nik: '882044', vendorCompany: 'PT Sarana Optik Bandung', passwordHash: techRizkyHash },
    create: {
      nik: '882044',
      username: 'tech.rizky',
      fullName: 'Rizky Maulana',
      vendorCompany: 'PT Sarana Optik Bandung',
      passwordHash: techRizkyHash,
      roleId: techRole.id,
      userType: 'TECHNICIAN',
      isActive: true,
      twoFactorEnabled: false,
      assignedClusters: ['BDG-03'],
    },
  });

  // 3. MASTER CLUSTERS (Single Source of Truth)
  const clusterUtara = await prisma.networkCluster.upsert({
    where: { clusterCode: 'BDG-01' },
    update: { name: 'Bandung Utara' },
    create: {
      clusterCode: 'BDG-01',
      name: 'Bandung Utara',
      centerLat: -6.885,
      centerLng: 107.615,
      isActive: true,
    },
  });

  await prisma.networkCluster.upsert({
    where: { clusterCode: 'BDG-02' },
    update: { name: 'Bandung Selatan' },
    create: {
      clusterCode: 'BDG-02',
      name: 'Bandung Selatan',
      centerLat: -6.949,
      centerLng: 107.611,
      isActive: true,
    },
  });

  const clusterTimur = await prisma.networkCluster.upsert({
    where: { clusterCode: 'BDG-03' },
    update: { name: 'Bandung Timur' },
    create: {
      clusterCode: 'BDG-03',
      name: 'Bandung Timur',
      centerLat: -6.918,
      centerLng: 107.668,
      isActive: true,
    },
  });

  await prisma.networkCluster.upsert({
    where: { clusterCode: 'BDG-04' },
    update: { name: 'Bandung Barat' },
    create: {
      clusterCode: 'BDG-04',
      name: 'Bandung Barat',
      centerLat: -6.898,
      centerLng: 107.552,
      isActive: true,
    },
  });

  // 4. ODP SPLITTERS (Kapasitas 8 & 16 Port)
  const odp1 = await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-BDG01-01' },
    update: {},
    create: {
      clusterId: clusterUtara.id,
      splitterCode: 'ODP-BDG01-01',
      lat: -6.886,
      lng: 107.616,
      maxPorts: 16,
      isActive: true,
    },
  });

  const odp2 = await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-BDG01-02' },
    update: {},
    create: {
      clusterId: clusterUtara.id,
      splitterCode: 'ODP-BDG01-02',
      lat: -6.8875,
      lng: 107.6175,
      maxPorts: 8,
      isActive: true,
    },
  });

  const odp3 = await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-BDG03-01' },
    update: {},
    create: {
      clusterId: clusterTimur.id,
      splitterCode: 'ODP-BDG03-01',
      lat: -6.919,
      lng: 107.669,
      maxPorts: 16,
      isActive: true,
    },
  });

  await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-BDG03-02' },
    update: {},
    create: {
      clusterId: clusterTimur.id,
      splitterCode: 'ODP-BDG03-02',
      lat: -6.9205,
      lng: 107.6705,
      maxPorts: 8,
      isActive: true,
    },
  });

  // 5. CUSTOMERS
  const cust1 = await prisma.customer.upsert({
    where: { siaNumber: '100245' },
    update: {},
    create: {
      siaNumber: '100245',
      fullName: 'Budi Santoso',
      address: 'Jl. Dago Atas No. 42, Coblong, Bandung',
      lat: -6.8862,
      lng: 107.6162,
      clusterId: clusterUtara.id,
      splitterId: odp1.id,
      portNumber: 3,
      currentAttenuation: -26.4,
      status: 'ACTIVE',
    },
  });

  const cust2 = await prisma.customer.upsert({
    where: { siaNumber: '100244' },
    update: {},
    create: {
      siaNumber: '100244',
      fullName: 'Siti Rahmawati',
      address: 'Jl. Soekarno Hatta No. 210, Arcamanik, Bandung',
      lat: -6.9192,
      lng: 107.6692,
      clusterId: clusterTimur.id,
      splitterId: odp3.id,
      portNumber: 1,
      currentAttenuation: -19.2,
      status: 'ACTIVE',
    },
  });

  await prisma.customer.upsert({
    where: { siaNumber: '100243' },
    update: {},
    create: {
      siaNumber: '100243',
      fullName: 'Dedi Kurniawan',
      address: 'Jl. Ir. H. Juanda No. 88, Bandung Utara',
      lat: -6.8877,
      lng: 107.6177,
      clusterId: clusterUtara.id,
      splitterId: odp2.id,
      portNumber: 2,
      currentAttenuation: -23.5,
      status: 'ACTIVE',
    },
  });

  await prisma.customer.upsert({
    where: { siaNumber: '100246' },
    update: {},
    create: {
      siaNumber: '100246',
      fullName: 'Agus Setiawan',
      address: 'Jl. Cikutra Barat No. 15, Bandung',
      clusterId: clusterUtara.id,
      splitterId: null,
      portNumber: null,
      currentAttenuation: -20.0,
      status: 'PENDING_INSTALL',
    },
  });

  // 6. INITIAL TICKETS (Work Orders)
  await prisma.ticket.upsert({
    where: { ticketNumber: 'WO-2025-0842' },
    update: {},
    create: {
      ticketNumber: 'WO-2025-0842',
      ticketType: 'MAINTENANCE',
      customerId: cust1.id,
      assignedTechId: techAndi.id,
      createdByAdminId: adminNoc.id,
      status: 'IN_PROGRESS',
      vendorName: 'PT Mitra Fiber Nusantara',
      complaintSummary:
        'Pelanggan melaporkan koneksi putus-nyambung dan redaman drop sejak pagi hari.',
      customerPhone: '+62 812-2200-1045',
      serviceAddress: 'Jl. Dago Atas No. 42, Coblong, Bandung',
      locationPlace: 'Ruko Dago Vista Lt. 2 (Sebelah Apotek)',
      targetLat: -6.8862,
      targetLng: 107.6162,
      dispatchedAt: new Date(Date.now() - 1000 * 60 * 45),
      startedAt: new Date(Date.now() - 1000 * 60 * 20),
      adminNotes:
        'Redaman optik drop drastis di bawah -25.0 dBm (-26.40 dBm). Lakukan re-splicing di ODP-BDG01-01.',
      assignedAt: new Date(),
    },
  });

  const ticketCompleted = await prisma.ticket.upsert({
    where: { ticketNumber: 'WO-2025-0841' },
    update: {},
    create: {
      ticketNumber: 'WO-2025-0841',
      ticketType: 'PSB',
      customerId: cust2.id,
      assignedTechId: techRizky.id,
      createdByAdminId: superAdmin.id,
      status: 'COMPLETED',
      vendorName: 'PT Sarana Optik Bandung',
      complaintSummary: 'Permintaan instalasi baru layanan internet bisnis 50 Mbps.',
      customerPhone: '+62 813-9900-2211',
      serviceAddress: 'Jl. Soekarno Hatta No. 210, Arcamanik, Bandung',
      locationPlace: 'Kantor Cabang Arcamanik Blok B',
      targetLat: -6.9192,
      targetLng: 107.6692,
      dispatchedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      adminNotes: 'Aktivasi pelanggan baru paket 50 Mbps. Port 1 ODP-BDG03-01.',
      assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      completedAt: new Date(Date.now() - 1000 * 60 * 15),
    },
  });

  // 7. BASELINE ATTENUATION HISTORY (Real DB history for /network)
  await prisma.attenuationHistory.upsert({
    where: { submissionId: 'seed-sub-wo-2025-0841' },
    update: {},
    create: {
      submissionId: 'seed-sub-wo-2025-0841',
      ticketId: ticketCompleted.id,
      customerId: cust2.id,
      techId: techRizky.id,
      oldAttenuation: -21.0,
      newAttenuation: -19.2,
      splitterId: odp3.id,
      portNumber: 1,
      photoObjectKey: 'seed/wo-2025-0841-opm.jpg',
      submittedLat: -6.91924,
      submittedLng: 107.66925,
      distanceToSplitterM: 28.4,
      isLocationFlagged: false,
      clientRecordedAt: new Date(Date.now() - 1000 * 60 * 30),
    },
  });

  console.log('✓ Seeding Master Data FiberOps berhasil diselesaikan.');
}

if (process.argv[1]?.includes('seed')) {
  seedDatabase().catch((err) => {
    console.warn('Prisma seeder runtime note (opsional jika DB offline saat build):', err.message);
  });
}
