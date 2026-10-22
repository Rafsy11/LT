import { prisma } from './index';

export async function seedDatabase() {
  console.log('--- Memulai Seeding Master Data FiberOps (On-Premise) ---');

  // 1. ROLES & RBAC MATRIX (Super Admin, Admin NOC, Teknisi)
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: {
      name: 'Super Admin',
      permissions: ['*'],
      hierarchyLevel: 100,
    },
  });

  const adminNocRole = await prisma.role.upsert({
    where: { name: 'Admin NOC' },
    update: {},
    create: {
      name: 'Admin NOC',
      permissions: [
        'ticket:read',
        'ticket:create',
        'ticket:assign',
        'network:read',
        'network:update',
        'customer:read',
        'customer:update',
        'ai:use',
      ],
      hierarchyLevel: 50,
    },
  });

  const techRole = await prisma.role.upsert({
    where: { name: 'Teknisi' },
    update: {},
    create: {
      name: 'Teknisi',
      permissions: ['ticket:read', 'ticket:submit'],
      hierarchyLevel: 10,
    },
  });

  // 2. USERS (Super Admin, Admin NOC, 2 Teknisi)
  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      fullName: 'Aditya Saputra',
      passwordHash: '$2b$10$epw1...mockSecureHashForSuperAdmin',
      roleId: superAdminRole.id,
      userType: 'SUPER_ADMIN',
      isActive: true,
      assignedClusters: ['CL-01', 'CL-02'],
    },
  });

  const adminNoc = await prisma.user.upsert({
    where: { username: 'admin.noc' },
    update: {},
    create: {
      username: 'admin.noc',
      fullName: 'Budi Hartono',
      passwordHash: '$2b$10$epw1...mockSecureHashForAdminNoc',
      roleId: adminNocRole.id,
      userType: 'ADMIN',
      isActive: true,
      assignedClusters: ['CL-01', 'CL-02'],
    },
  });

  const techAndi = await prisma.user.upsert({
    where: { username: 'tech.andi' },
    update: {},
    create: {
      username: 'tech.andi',
      fullName: 'Andi Pratama',
      passwordHash: '$2b$10$epw1...mockSecureHashForTechAndi',
      roleId: techRole.id,
      userType: 'TECHNICIAN',
      isActive: true,
      assignedClusters: ['CL-01'],
    },
  });

  const techRizky = await prisma.user.upsert({
    where: { username: 'tech.rizky' },
    update: {},
    create: {
      username: 'tech.rizky',
      fullName: 'Rizky Maulana',
      passwordHash: '$2b$10$epw1...mockSecureHashForTechRizky',
      roleId: techRole.id,
      userType: 'TECHNICIAN',
      isActive: true,
      assignedClusters: ['CL-02'],
    },
  });

  // 3. 2 CLUSTERS
  const clusterUtara = await prisma.networkCluster.upsert({
    where: { clusterCode: 'CL-01' },
    update: {},
    create: {
      clusterCode: 'CL-01',
      name: 'Bandung Utara',
      centerLat: -6.8850,
      centerLng: 107.6150,
      isActive: true,
    },
  });

  const clusterTimur = await prisma.networkCluster.upsert({
    where: { clusterCode: 'CL-02' },
    update: {},
    create: {
      clusterCode: 'CL-02',
      name: 'Bandung Timur',
      centerLat: -6.9180,
      centerLng: 107.6680,
      isActive: true,
    },
  });

  // 4. 4 ODP SPLITTERS (Kapasitas 8 & 16 Port)
  const odp1 = await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-CL01-01' },
    update: {},
    create: {
      clusterId: clusterUtara.id,
      splitterCode: 'ODP-CL01-01',
      lat: -6.8860,
      lng: 107.6160,
      maxPorts: 16, // 16 Port
      isActive: true,
    },
  });

  const odp2 = await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-CL01-02' },
    update: {},
    create: {
      clusterId: clusterUtara.id,
      splitterCode: 'ODP-CL01-02',
      lat: -6.8875,
      lng: 107.6175,
      maxPorts: 8, // 8 Port
      isActive: true,
    },
  });

  const odp3 = await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-CL02-01' },
    update: {},
    create: {
      clusterId: clusterTimur.id,
      splitterCode: 'ODP-CL02-01',
      lat: -6.9190,
      lng: 107.6690,
      maxPorts: 16, // 16 Port
      isActive: true,
    },
  });

  await prisma.networkSplitter.upsert({
    where: { splitterCode: 'ODP-CL02-02' },
    update: {},
    create: {
      clusterId: clusterTimur.id,
      splitterCode: 'ODP-CL02-02',
      lat: -6.9205,
      lng: 107.6705,
      maxPorts: 8, // 8 Port
      isActive: true,
    },
  });

  // 5. SAMPLE SIA CUSTOMERS
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
      currentAttenuation: -26.40, // Critical (> -25 dBm)
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
      currentAttenuation: -19.20, // Normal (-15 s/d -22 dBm)
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
      currentAttenuation: -23.50, // Warning (-22.1 s/d -25 dBm)
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
      currentAttenuation: -20.00,
      status: 'PENDING_INSTALL', // Menunggu instalasi pasang baru
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
      adminNotes: 'Redaman optik drop drastis di bawah -25.0 dBm (-26.40 dBm). Lakukan re-splicing di ODP-CL01-01.',
      assignedAt: new Date(),
    },
  });

  await prisma.ticket.upsert({
    where: { ticketNumber: 'WO-2025-0841' },
    update: {},
    create: {
      ticketNumber: 'WO-2025-0841',
      ticketType: 'PSB',
      customerId: cust2.id,
      assignedTechId: techRizky.id,
      createdByAdminId: superAdmin.id,
      status: 'COMPLETED',
      adminNotes: 'Aktivasi pelanggan baru paket 50 Mbps. Port 1 ODP-CL02-01.',
      assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      completedAt: new Date(Date.now() - 1000 * 60 * 15),
    },
  });

  console.log('✓ Seeding Master Data FiberOps berhasil diselesaikan.');
}

if (process.argv[1]?.includes('seed')) {
  seedDatabase().catch((err) => {
    console.warn('Prisma seeder runtime note (opsional jika DB offline saat build):', err.message);
  });
}
