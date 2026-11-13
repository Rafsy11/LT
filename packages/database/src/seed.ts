import bcrypt from 'bcryptjs';
import { prisma } from './index';
import { buildPalembangTopology, executePalembangImport } from './importers/palembang-datek';

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
  console.log('--- Memulai Seeding Master Data FiberOps (On-Premise Palembang) ---');

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

  // 2. USERS (Demo Accounts dengan Palembang Clusters)
  const palembangAllClusters = ['PLBHRAGA01', 'PLBBSGGA01', 'PLBKBNGR01', 'PLBTKEGR01'];
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
    update: {
      nik: '882042',
      passwordHash: adminNocHash,
      assignedClusters: palembangAllClusters,
    },
    create: {
      nik: '882042',
      username: 'admin.noc',
      fullName: 'Budi Hartono',
      passwordHash: adminNocHash,
      roleId: adminNocRole.id,
      userType: 'ADMIN',
      isActive: true,
      twoFactorEnabled: false,
      assignedClusters: palembangAllClusters,
    },
  });

  const techAndiHash = await ensureValidBcryptHash('tech.andi', defaultPasswordHash);
  const techAndi = await prisma.user.upsert({
    where: { username: 'tech.andi' },
    update: {
      nik: '882043',
      vendorCompany: 'PT Mitra Fiber Nusantara',
      passwordHash: techAndiHash,
      assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01'],
    },
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
      assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01'],
    },
  });

  const techRizkyHash = await ensureValidBcryptHash('tech.rizky', defaultPasswordHash);
  const techRizky = await prisma.user.upsert({
    where: { username: 'tech.rizky' },
    update: {
      nik: '882044',
      vendorCompany: 'PT Sarana Optik Palembang',
      passwordHash: techRizkyHash,
      assignedClusters: ['PLBKBNGR01', 'PLBTKEGR01'],
    },
    create: {
      nik: '882044',
      username: 'tech.rizky',
      fullName: 'Rizky Maulana',
      vendorCompany: 'PT Sarana Optik Palembang',
      passwordHash: techRizkyHash,
      roleId: techRole.id,
      userType: 'TECHNICIAN',
      isActive: true,
      twoFactorEnabled: false,
      assignedClusters: ['PLBKBNGR01', 'PLBTKEGR01'],
    },
  });

  // 3. CLEAN LEGACY BANDUNG DUMMY DATA (IF ANY)
  const legacyClusters = await prisma.networkCluster.findMany({
    where: { clusterCode: { in: ['BDG-01', 'BDG-02', 'BDG-03', 'BDG-04'] } },
    select: { id: true },
  });
  if (legacyClusters.length > 0) {
    const legacyClusterIds = legacyClusters.map((c) => c.id);
    await prisma.ticket.deleteMany({
      where: { customer: { clusterId: { in: legacyClusterIds } } },
    });
    await prisma.attenuationHistory.deleteMany({
      where: { customer: { clusterId: { in: legacyClusterIds } } },
    });
    await prisma.customer.deleteMany({
      where: { clusterId: { in: legacyClusterIds } },
    });
    await prisma.networkSplitter.deleteMany({
      where: { clusterId: { in: legacyClusterIds } },
    });
    await prisma.networkCluster.deleteMany({
      where: { id: { in: legacyClusterIds } },
    });
  }

  // 4. PALEMBANG MASTER TOPOLOGY IMPORT (Clusters, Splitters, Customers)
  console.log('Ingesting Palembang Master Data...');
  const topology = buildPalembangTopology();
  const importResult = await executePalembangImport(prisma, topology, {
    dryRun: false,
    actorUserId: adminNoc.id,
    actorRole: 'ADMIN',
  });
  console.log(
    `✓ Palembang Master Data Imported: ${importResult.counts?.clusters} clusters, ${importResult.counts?.splitters} splitters, ${importResult.counts?.customers} customers.`,
  );

  // 5. DEMO WORK ORDERS & BASELINE ATTENUATION (PALEMBANG CONTEXT)
  const cust1 = await prisma.customer.findUniqueOrThrow({
    where: { siaNumber: '2025468390' },
  });
  const cust2 = await prisma.customer.findUniqueOrThrow({
    where: { siaNumber: '2025468388' },
  });

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
        'Pelanggan melaporkan redaman drop di bawah standar operasi (-25.80 dBm).',
      customerPhone: '+62 812-2200-1045',
      serviceAddress: cust1.address,
      locationPlace: 'Palembang Square Mall Lt. 2 (Sports Station)',
      targetLat: cust1.lat ? Number(cust1.lat) : -2.97638,
      targetLng: cust1.lng ? Number(cust1.lng) : 104.74148,
      dispatchedAt: new Date(Date.now() - 1000 * 60 * 45),
      startedAt: new Date(Date.now() - 1000 * 60 * 20),
      adminNotes:
        'Redaman optik terdeteksi -25.80 dBm. Lakukan pemeriksaan konektor ODP rooftop PS Mall.',
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
      vendorName: 'PT Sarana Optik Palembang',
      complaintSummary: 'Aktivasi pelanggan baru MAP Skechers PS Mall port 3.',
      customerPhone: '+62 813-9900-2211',
      serviceAddress: cust2.address,
      locationPlace: 'Palembang Square Mall Lt. 1 Unit 12 (Skechers)',
      targetLat: cust2.lat ? Number(cust2.lat) : -2.97638,
      targetLng: cust2.lng ? Number(cust2.lng) : 104.74148,
      dispatchedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      adminNotes: 'Instalasi ONT SN rcmgd84921 di slot OLT 3@1/7/3.gpon.',
      assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      completedAt: new Date(Date.now() - 1000 * 60 * 15),
    },
  });

  // 6. BASELINE ATTENUATION HISTORY
  if (!cust2.splitterId) {
    throw new Error('Customer 2025468388 must have an assigned splitterId');
  }

  await prisma.attenuationHistory.upsert({
    where: { submissionId: 'seed-sub-wo-2025-0841' },
    update: {},
    create: {
      submissionId: 'seed-sub-wo-2025-0841',
      ticketId: ticketCompleted.id,
      customerId: cust2.id,
      techId: techRizky.id,
      oldAttenuation: -21.0,
      newAttenuation: -25.3,
      splitterId: cust2.splitterId,
      portNumber: cust2.portNumber || 3,
      photoObjectKey: 'seed/wo-2025-0841-opm.jpg',
      submittedLat: cust2.lat ? Number(cust2.lat) : -2.97638,
      submittedLng: cust2.lng ? Number(cust2.lng) : 104.74148,
      distanceToSplitterM: 18.2,
      isLocationFlagged: false,
      clientRecordedAt: new Date(Date.now() - 1000 * 60 * 30),
    },
  });

  console.log('✓ Seeding Master Data FiberOps (Palembang) berhasil diselesaikan.');
}

if (process.argv[1]?.includes('seed')) {
  seedDatabase().catch((err) => {
    console.warn('Prisma seeder runtime note (opsional jika DB offline saat build):', err.message);
  });
}
