export type DbmStatus = 'Normal' | 'Warning' | 'Critical';

// Ambang batas redaman optik (PRD 3.4 & AGENT.md Section 5)
export const ATTENUATION_THRESHOLDS = {
  NORMAL_MIN: -22.0,
  NORMAL_MAX: -15.0,
  WARNING_MIN: -25.0,
  WARNING_MAX: -22.1,
  CRITICAL_BELOW: -25.0, // Di bawah -25 dBm (lebih buruk dari -25.0)
  CRITICAL_ABOVE: -10.0, // Optik terbakar/overpower
} as const;

export function classifyDbm(value: number | string): DbmStatus {
  const v = typeof value === 'number' ? value : Number(value);
  if (isNaN(v)) return 'Warning';
  if (v < ATTENUATION_THRESHOLDS.CRITICAL_BELOW || v > ATTENUATION_THRESHOLDS.CRITICAL_ABOVE) {
    return 'Critical';
  }
  if (v >= ATTENUATION_THRESHOLDS.NORMAL_MIN && v <= ATTENUATION_THRESHOLDS.NORMAL_MAX) {
    return 'Normal';
  }
  return 'Warning';
}

export const dbmTone = (value: number | string): 'green' | 'orange' | 'red' => {
  const status = classifyDbm(value);
  switch (status) {
    case 'Normal':
      return 'green';
    case 'Warning':
      return 'orange';
    case 'Critical':
      return 'red';
  }
};

// Batas toleransi jarak geofencing anti-fake GPS teknisi terhadap ODP (PRD 3.3 & AGENT.md Section 4)
export const MAX_GEOFENCE_RADIUS_METERS = 100;

// Versi minimum aplikasi mobile teknisi (Law 4 - App Version Gate HTTP 426)
export const MIN_MOBILE_APP_VERSION = '1.0.0';
export const CURRENT_MOBILE_APP_VERSION = '1.0.0';

export const TICKET_TYPES = {
  PSB: 'PSB',
  MAINTENANCE: 'MAINTENANCE',
} as const;

export type TicketTypeEnum = (typeof TICKET_TYPES)[keyof typeof TICKET_TYPES];

export const TICKET_STATUSES = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TicketStatusEnum = (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];

export const CUSTOMER_STATUSES = {
  PENDING_INSTALL: 'PENDING_INSTALL',
  ACTIVE: 'ACTIVE',
  ISOLATED: 'ISOLATED',
  DISMANTLED: 'DISMANTLED',
} as const;

export type CustomerStatusEnum = (typeof CUSTOMER_STATUSES)[keyof typeof CUSTOMER_STATUSES];

export const USER_TYPES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  TECHNICIAN: 'TECHNICIAN',
} as const;

export type UserTypeEnum = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export const HIERARCHY_LEVELS = {
  SUPER_ADMIN: 100,
  ADMIN: 50,
  TECHNICIAN: 10,
} as const;

// Header unbuffered Nginx SSE (AGENT.md Section 5)
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

// 1. RBAC & PERMISSION MATRIX (PRD Section 2 & Requirement 3)
export const PERMISSIONS = {
  ALL: '*',
  TICKET_READ: 'ticket:read',
  TICKET_CREATE: 'ticket:create',
  TECH_MANAGE: 'tech:manage',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_UPDATE: 'customer:update',
  ROLE_EDIT: 'role:edit',
  AI_USE: 'ai:use',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface RolePreset {
  id: string;
  name: string;
  userType: UserTypeEnum;
  hierarchyLevel: number;
  permissions: string[];
  description: string;
}

export const ROLE_PRESETS: Record<string, RolePreset> = {
  SUPER_ADMIN: {
    id: 'role-super-admin',
    name: 'Super Admin',
    userType: 'SUPER_ADMIN',
    hierarchyLevel: 100,
    permissions: [PERMISSIONS.ALL],
    description: 'Akses global tak terbatas: Role Editor, Force Logout, Master Data, AI Assistant & Konfigurasi Sistem.',
  },
  NOC_ADMIN: {
    id: 'role-noc-admin',
    name: 'Admin Operasional / NOC',
    userType: 'ADMIN',
    hierarchyLevel: 50,
    permissions: [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.TICKET_CREATE,
      PERMISSIONS.TECH_MANAGE,
      PERMISSIONS.CUSTOMER_READ,
      PERMISSIONS.CUSTOMER_UPDATE,
      PERMISSIONS.AI_USE,
    ],
    description: 'Mengelola tiket, master cluster terikat, force logout teknisi, live monitoring, dan AI operational tools.',
  },
  FIELD_DISPATCHER: {
    id: 'role-dispatcher',
    name: 'Dispatcher / Helpdesk',
    userType: 'ADMIN',
    hierarchyLevel: 30,
    permissions: [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.TICKET_CREATE,
      PERMISSIONS.CUSTOMER_READ,
    ],
    description: 'Hanya dapat melihat data pelanggan dan membuat tiket baru (tanpa izin Force Logout atau Role Editor).',
  },
  AUDITOR_VIEWER: {
    id: 'role-auditor',
    name: 'Auditor & Read-Only',
    userType: 'ADMIN',
    hierarchyLevel: 20,
    permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.CUSTOMER_READ],
    description: 'Akses peninjauan read-only. Tidak dapat membuat tiket, mengubah peran, atau menghentikan teknisi.',
  },
  TECHNICIAN: {
    id: 'role-technician',
    name: 'Teknisi Lapangan',
    userType: 'TECHNICIAN',
    hierarchyLevel: 10,
    permissions: [PERMISSIONS.TICKET_READ],
    description: 'Aplikasi mobile: Menerima tiket aktif, uji redaman OPM, cek GPS, dan submit laporan lapangan.',
  },
};

// 2. KODE ERROR TERPUSAT (PRD Section 5 & Requirement 1)
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_REVOKED: 'SESSION_REVOKED',
  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED', // HTTP 426 Upgrade Required
  IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
  PORT_OCCUPIED: 'PORT_OCCUPIED',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  TECH_NOT_FOUND: 'TECH_NOT_FOUND',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  CLUSTER_NOT_FOUND: 'CLUSTER_NOT_FOUND',
  INVALID_GEOFENCE: 'INVALID_GEOFENCE',
  MOCK_LOCATION_DETECTED: 'MOCK_LOCATION_DETECTED',
  AI_ACTION_EXPIRED: 'AI_ACTION_EXPIRED',
  INVALID_ACTION_TOKEN: 'INVALID_ACTION_TOKEN',
  HIERARCHY_VIOLATION: 'HIERARCHY_VIOLATION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  GPS_ANOMALY_DETECTED: 'GPS_ANOMALY_DETECTED',
  IDOR_VIOLATION: 'IDOR_VIOLATION',
  ACTION_TOKEN_REPLAYED: 'ACTION_TOKEN_REPLAYED',
  TICKET_ALREADY_CLOSED: 'TICKET_ALREADY_CLOSED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Peta Pesan Error UI Aman (Anti-Information Leakage).
 * Memetakan error.code ke pesan bahasa Indonesia yang aman untuk ditampilkan
 * di Toast, Alert, atau Modal. DILARANG merender error.stack, nama tabel Prisma,
 * atau query SQL mentah ke hadapan pengguna.
 */
export const ERROR_MESSAGES_MAP: Record<ErrorCode | string, string> = {
  [ERROR_CODES.UNAUTHORIZED]:
    'Sesi Anda telah berakhir atau belum terotentikasi. Silakan masuk kembali ke sistem.',
  [ERROR_CODES.FORBIDDEN]:
    'Akses ditolak: Akun Anda tidak memiliki izin (permission) yang memadai untuk operasi ini.',
  [ERROR_CODES.SESSION_REVOKED]:
    'Sesi perangkat telah dicabut oleh Administrator (Force Logout aktif). Akses dihentikan.',
  [ERROR_CODES.UPGRADE_REQUIRED]:
    'Versi aplikasi mobile Anda sudah usang. Wajib memperbarui versi aplikasi sebelum melanjutkan tugas.',
  [ERROR_CODES.IDEMPOTENT_REPLAY]:
    'Laporan ini telah berhasil diproses sebelumnya. Pengiriman ganda telah dicegah oleh sistem idempotency.',
  [ERROR_CODES.PORT_OCCUPIED]:
    'Port splitter yang dipilih sudah terisi oleh pelanggan aktif lain. Silakan pilih port lain.',
  [ERROR_CODES.CUSTOMER_NOT_FOUND]:
    'Data pelanggan (SIA) tidak ditemukan dalam basis data master.',
  [ERROR_CODES.TECH_NOT_FOUND]:
    'Data teknisi yang ditugaskan tidak ditemukan atau sedang tidak aktif.',
  [ERROR_CODES.TICKET_NOT_FOUND]:
    'Nomor tiket atau work order tidak ditemukan dalam sistem.',
  [ERROR_CODES.CLUSTER_NOT_FOUND]:
    'Wilayah cluster jaringan tidak valid atau berada di luar cakupan wewenang Anda.',
  [ERROR_CODES.INVALID_GEOFENCE]:
    'Peringatan Geofence: Titik koordinat GPS Anda berada di luar radius toleransi ODP (maksimal 100 meter).',
  [ERROR_CODES.MOCK_LOCATION_DETECTED]:
    'Sistem Keamanan Integritas Lapangan: Terdeteksi Mock Location / Fake GPS pada perangkat. Tombol Submit dikunci.',
  [ERROR_CODES.AI_ACTION_EXPIRED]:
    'Batas waktu persetujuan aksi AI telah kedaluwarsa. Silakan ajukan perintah baru pada AI Assistant.',
  [ERROR_CODES.INVALID_ACTION_TOKEN]:
    'Token kriptografi aksi AI tidak valid atau telah dirusak.',
  [ERROR_CODES.HIERARCHY_VIOLATION]:
    'Pelanggaran Hierarki Keamanan: Anda tidak diizinkan mengubah akun dengan tingkat wewenang setara atau lebih tinggi.',
  [ERROR_CODES.VALIDATION_ERROR]:
    'Format data tidak valid. Pastikan semua kolom terisi sesuai spesifikasi teknis.',
  [ERROR_CODES.INTERNAL_ERROR]:
    'Terjadi kendala pada server operasional internal. Hubungi tim Administrator NOC jika kendala berlanjut.',
  [ERROR_CODES.RATE_LIMITED]:
    'Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba kembali.',
  [ERROR_CODES.TOKEN_REUSE_DETECTED]:
    'Keamanan: Terdeteksi penggunaan ulang token yang telah dicabut. Seluruh sesi akun Anda telah ditangguhkan. Hubungi Administrator.',
  [ERROR_CODES.GPS_ANOMALY_DETECTED]:
    'Peringatan Anomali GPS: Koordinat yang dikirim identik dengan titik referensi ODP. Harap pastikan perangkat GPS aktif dan tidak dipalsukan.',
  [ERROR_CODES.IDOR_VIOLATION]:
    'Akses ditolak: Anda tidak berwenang mengakses atau memodifikasi sumber daya milik pengguna lain.',
  [ERROR_CODES.ACTION_TOKEN_REPLAYED]:
    'Token aksi AI telah digunakan sebelumnya (single-use). Silakan minta AI untuk menyiapkan aksi baru.',
  [ERROR_CODES.TICKET_ALREADY_CLOSED]:
    'Tiket ini sudah berstatus selesai atau dibatalkan dan tidak dapat dimutasi lagi.',
};

/**
 * Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1).
 * Mengamankan error sebelum dirender ke Toast/Modal/Alert.
 * Memastikan tidak ada stack trace, tabel PostgreSQL, atau kode Prisma yang bocor.
 */
export function sanitizeUiErrorMessage(rawError: unknown): {
  code: string;
  message: string;
  isSanitized: true;
} {
  if (!rawError) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: ERROR_MESSAGES_MAP[ERROR_CODES.INTERNAL_ERROR],
      isSanitized: true,
    };
  }

  // 1. Jika objek error memiliki properti code terdaftar
  const errorObj = typeof rawError === 'object' && rawError !== null ? (rawError as any) : null;
  const rawCode = errorObj?.code || errorObj?.errorCode || errorObj?.error?.code;

  if (rawCode && typeof rawCode === 'string') {
    const uppercaseCode = rawCode.toUpperCase();
    if (ERROR_MESSAGES_MAP[uppercaseCode]) {
      return {
        code: uppercaseCode,
        message: ERROR_MESSAGES_MAP[uppercaseCode],
        isSanitized: true,
      };
    }
  }

  // 2. Deteksi teks error mentah yang mencurigakan (Prisma / SQL / Stack trace)
  const rawMessage = typeof rawError === 'string' ? rawError : errorObj?.message || '';
  const isDangerousLeak =
    /prisma|postgresql|select|insert|update|delete|table|column|relation|p2002|p2003|at\s|node_modules/i.test(
      rawMessage
    );

  if (isDangerousLeak) {
    // Hard block data leakage
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        'Terjadi kendala saat memproses data pada server pusat. Hubungi tim NOC dengan kode ERR_INT_500.',
      isSanitized: true,
    };
  }

  // 3. Jika pesan cocok dengan kode yang dipetakan
  if (rawMessage && ERROR_MESSAGES_MAP[rawMessage]) {
    return {
      code: rawMessage,
      message: ERROR_MESSAGES_MAP[rawMessage],
      isSanitized: true,
    };
  }

  // 4. Fallback aman
  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: rawMessage && rawMessage.length < 120 && !isDangerousLeak
      ? rawMessage
      : ERROR_MESSAGES_MAP[ERROR_CODES.INTERNAL_ERROR],
    isSanitized: true,
  };
}

// 3. OUTDOOR UX & VISIBILITAS LAPANGAN (PRD Section 3.3 & Requirement 4)
export const OUTDOOR_CONTRAST_TOKENS = {
  // Sinyal Normal: -15.0 s/d -22.0 dBm
  NORMAL: {
    label: 'NORMAL',
    range: '-15.0 s/d -22.0 dBm',
    hex: '#059669',
    outdoorBg: '#056434', // Kontras tinggi outdoor
    outdoorText: '#ffffff',
    outdoorBorder: '#024221',
    badgeBg: '#dcfce7',
    badgeText: '#14532d',
    statusDot: '#22c55e',
  },
  // Sinyal Warning: -22.1 s/d -25.0 dBm
  WARNING: {
    label: 'WARNING',
    range: '-22.1 s/d -25.0 dBm',
    hex: '#d97706',
    outdoorBg: '#92400e', // Kontras tinggi outdoor
    outdoorText: '#ffffff',
    outdoorBorder: '#78350f',
    badgeBg: '#fef3c7',
    badgeText: '#78350f',
    statusDot: '#eab308',
  },
  // Sinyal Critical: < -25.0 dBm atau > -10.0 dBm
  CRITICAL: {
    label: 'CRITICAL',
    range: '< -25.0 dBm / Overpower',
    hex: '#dc2626',
    outdoorBg: '#991b1b', // Kontras tinggi outdoor
    outdoorText: '#ffffff',
    outdoorBorder: '#7f1d1d',
    badgeBg: '#fee2e2',
    badgeText: '#7f1d1d',
    statusDot: '#ef4444',
  },
} as const;

