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

  // 5. DEMO WORK ORDERS, CUSTOMER PROFILES & BASELINE ATTENUATION (PALEMBANG CONTEXT)
  const cust1 = await prisma.customer.findUniqueOrThrow({
    where: { siaNumber: '2025468390' },
  });
  const cust2 = await prisma.customer.findUniqueOrThrow({
    where: { siaNumber: '2025468388' },
  });

  await prisma.customer.update({
    where: { id: cust1.id },
    data: {
      oltAttenuation: -26.2,
      ontAttenuation: -25.8,
      currentAttenuation: -25.8,
      picName: 'Rahmat Hidayat',
      picPhone: '+62 812-2200-1045',
      picRole: 'Store Supervisor Sports Station PS Mall',
      profileDescription:
        'Gerai ritel Sports Station lantai 2 Palembang Square Mall. Jalur distribusi fiber melalui ODP rooftop PS Mall dengan jam akses teknisi mengikuti jam operasional mal (09.00-21.00 WIB).',
      lastActivityNote:
        'Redaman optik terukur -25.8 dBm (masih dalam batas layak <= 28 dB). Pembersihan konektor terjadwal.',
    },
  });

  await prisma.customer.update({
    where: { id: cust2.id },
    data: {
      oltAttenuation: -25.6,
      ontAttenuation: -25.3,
      currentAttenuation: -25.3,
      picName: 'Siti Rahmawati',
      picPhone: '+62 813-9900-2211',
      picRole: 'PIC Operasional Skechers PS Mall',
      profileDescription:
        'Outlet Skechers unit 12 lantai 1 Palembang Square Mall. Terkoneksi pada ODP rooftop PS Mall port 3 dengan layanan FTTH korporat stabil.',
      lastActivityNote: 'Instalasi ONT selesai dan sinyal normal (-25.3 dBm).',
    },
  });

  // Enrich sample Palembang customers matching client reference & radar demo (Normal <= 28 dB vs Abnormal > 28 dB)
  const bsiCustomer = await prisma.customer.findUnique({
    where: { siaNumber: '2024437353' },
  });
  if (bsiCustomer) {
    await prisma.customer.update({
      where: { id: bsiCustomer.id },
      data: {
        status: 'ACTIVE',
        portNumber: 2,
        oltAttenuation: -28.0,
        ontAttenuation: -27.0,
        currentAttenuation: -27.0,
        picName: 'Hendra Wijaya',
        picPhone: '+62 812-7311-4092',
        picRole: 'PIC Operasional ATM BSI Palembang',
        profileDescription:
          'Titik layanan BSI ATM di area Indomaret Jl. Parameswara, Palembang. Akses perangkat modem ONT berada di ruang mesin ATM bagian depan toko; koordinasi kunci dan izin akses dilakukan melalui PIC BSI atau kepala toko Indomaret.',
        lastActivityNote:
          'Kabel nya ketabrak, masih ada PR perlu pergantian kabel dropcore dari ODP Depan PT Sumber Terang menuju tiang akses Indomaret.',
      },
    });

    const bsiTickets: Array<{
      ticketNumber: string;
      status: 'COMPLETED' | 'OPEN';
      summary: string;
      daysAgo: number;
    }> = [
      {
        ticketNumber: '2026-001105823',
        status: 'COMPLETED',
        summary: 'Pengecekan berkala konektor dropcore dan pengukuran OPM ATM BSI Parameswara.',
        daysAgo: 21,
      },
      {
        ticketNumber: '2026-001105824',
        status: 'COMPLETED',
        summary: 'Re-terminasi fast connector port 2 ODP Depan PT Sumber Terang.',
        daysAgo: 12,
      },
      {
        ticketNumber: '2026-001105825',
        status: 'OPEN',
        summary: 'Kabel dropcore tertabrak kendaraan, perlu pergantian jalur dan penarikan ulang.',
        daysAgo: 2,
      },
      {
        ticketNumber: '2026-001105826',
        status: 'COMPLETED',
        summary: 'Verifikasi redaman OLT (-28 dB) & ONT (-27 dB) pasca penyesuaian sementara.',
        daysAgo: 1,
      },
    ];

    for (const item of bsiTickets) {
      await prisma.ticket.upsert({
        where: { ticketNumber: item.ticketNumber },
        update: {},
        create: {
          ticketNumber: item.ticketNumber,
          ticketType: 'MAINTENANCE',
          customerId: bsiCustomer.id,
          assignedTechId: techAndi.id,
          createdByAdminId: adminNoc.id,
          status: item.status,
          vendorName: 'PT Mitra Fiber Nusantara',
          complaintSummary: item.summary,
          customerPhone: '+62 812-7311-4092',
          serviceAddress: bsiCustomer.address,
          locationPlace: 'Indomaret Parameswara (Area ATM BSI)',
          targetLat: bsiCustomer.lat ? Number(bsiCustomer.lat) : -2.9790933,
          targetLng: bsiCustomer.lng ? Number(bsiCustomer.lng) : 104.7570692,
          adminNotes: item.summary,
          createdAt: new Date(Date.now() - item.daysAgo * 24 * 60 * 60 * 1000),
          completedAt:
            item.status === 'COMPLETED'
              ? new Date(Date.now() - (item.daysAgo * 24 - 3) * 60 * 60 * 1000)
              : null,
        },
      });
    }
  }

  const paninBatubara = await prisma.customer.findUnique({ where: { siaNumber: '2010008482' } });
  if (paninBatubara) {
    await prisma.customer.update({
      where: { id: paninBatubara.id },
      data: {
        status: 'ACTIVE',
        portNumber: 1,
        oltAttenuation: -21.8,
        ontAttenuation: -21.2,
        currentAttenuation: -21.2,
        picName: 'Rina Kusuma',
        picPhone: '+62 811-7809-112',
        picRole: 'IT Branch Support Bank Panin',
        profileDescription:
          'Gedung kantor cabang Bank Panin Jl. M. Salim Batubara Palembang. Jalur fiber korporat dedicated menuju ruang server lantai 2; teknisi wajib membawa surat tugas resmi Lintasarta.',
        lastActivityNote: 'Pemantauan rutin redaman optik stabil di -21.2 dBm (Normal Optimal).',
      },
    });
  }

  const bniTasik = await prisma.customer.findUnique({ where: { siaNumber: '2010006485' } });
  if (bniTasik) {
    await prisma.customer.update({
      where: { id: bniTasik.id },
      data: {
        status: 'ACTIVE',
        portNumber: 1,
        oltAttenuation: -30.4,
        ontAttenuation: -29.6,
        currentAttenuation: -29.6,
        picName: 'Darmawan Putra',
        picPhone: '+62 813-6844-2210',
        picRole: 'Koordinator Pengelola ATM BNI',
        profileDescription:
          'Unit ATM BNI kompleks Rumah Dinas Jl. Tasik Palembang. Terhubung ke ODP Simpang Jl. Let. Iskandar dengan prioritas SLA perbankan 4 jam.',
        lastActivityNote:
          'Redaman melewati batas normal 28 dB (-29.6 dBm). Terindikasi tekukan patchcord pada box ODP.',
      },
    });
  }

  const paninSalatin = await prisma.customer.findUnique({ where: { siaNumber: '2019005579' } });
  if (paninSalatin) {
    await prisma.customer.update({
      where: { id: paninSalatin.id },
      data: {
        status: 'ACTIVE',
        portNumber: 1,
        oltAttenuation: -31.8,
        ontAttenuation: -31.2,
        currentAttenuation: -31.2,
        picName: 'Fajar Nugroho',
        picPhone: '+62 812-7890-3341',
        picRole: 'Chief Engineering Salatin Hotel',
        profileDescription:
          'Lokasi ATM Bank Panin Dubai Syariah di lobby Salatin Hotel Jl. Demang Lebar Daun. Koordinasi akses ruang panel dilakukan melalui pos engineering hotel.',
        lastActivityNote:
          'Redaman kritis di atas 28 dB (-31.2 dBm). Perlu re-splicing kabel distribusi dari ODP Depan Pegadaian Demang.',
      },
    });
  }

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
