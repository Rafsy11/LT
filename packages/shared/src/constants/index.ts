export * from './network.constant';
export * from './palembang-odp.constant';

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

export function classifyDbm(
  value: number | string | null | undefined,
): DbmStatus | 'Neutral' {
  if (value === null || value === undefined || value === '') return 'Neutral';
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

export const dbmTone = (
  value: number | string | null | undefined,
): 'green' | 'orange' | 'red' | 'gray' => {
  const status = classifyDbm(value);
  switch (status) {
    case 'Normal':
      return 'green';
    case 'Warning':
      return 'orange';
    case 'Critical':
      return 'red';
    case 'Neutral':
      return 'gray';
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
  PENDING_APPROVAL: 'PENDING_APPROVAL',
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
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

// 1. RBAC & PERMISSION MATRIX (PRD Section 2 & Requirement 3)
export const PERMISSIONS = {
  ALL: '*',
  TICKET_READ: 'ticket:read',
  TICKET_CREATE: 'ticket:create',
  TICKET_SUBMIT: 'ticket:submit',
  TECH_MANAGE: 'tech:manage',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_UPDATE: 'customer:update',
  NETWORK_READ: 'network:read',
  NETWORK_UPDATE: 'network:update',
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
    description:
      'Akses global tak terbatas: Role Editor, Force Logout, Master Data, AI Assistant & Konfigurasi Sistem.',
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
      PERMISSIONS.NETWORK_READ,
      PERMISSIONS.NETWORK_UPDATE,
      PERMISSIONS.AI_USE,
    ],
    description:
      'Mengelola tiket, master cluster terikat, force logout teknisi, live monitoring, dan AI operational tools.',
  },
  FIELD_DISPATCHER: {
    id: 'role-dispatcher',
    name: 'Dispatcher / Helpdesk',
    userType: 'ADMIN',
    hierarchyLevel: 30,
    permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_CREATE, PERMISSIONS.CUSTOMER_READ],
    description:
      'Hanya dapat melihat data pelanggan dan membuat tiket baru (tanpa izin Force Logout atau Role Editor).',
  },
  AUDITOR_VIEWER: {
    id: 'role-auditor',
    name: 'Auditor & Read-Only',
    userType: 'ADMIN',
    hierarchyLevel: 20,
    permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.CUSTOMER_READ, PERMISSIONS.NETWORK_READ],
    description:
      'Akses peninjauan read-only. Tidak dapat membuat tiket, mengubah peran, atau menghentikan teknisi.',
  },
  TECHNICIAN: {
    id: 'role-technician',
    name: 'Vendor / Teknisi Lapangan',
    userType: 'TECHNICIAN',
    hierarchyLevel: 10,
    permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_SUBMIT],
    description:
      'Teknisi Mitra Lapangan (Aplikasi Mobile & Bot Telegram): Menerima tugas berlokasi, check-in eksekusi, uji OPM/GPS, dan mengirim laporan terbaru ke Pusat.',
  },
};

// 2. KODE ERROR TERPUSAT (PRD Section 5 & Requirement 1)
export const STANDARD_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Kredensial yang dimasukkan tidak valid.',
  SYSTEM_PROCESSING_ERROR:
    'Terjadi gangguan pemrosesan pada sistem. Silakan coba beberapa saat lagi.',
  DATA_LOAD_FAILED:
    'Gagal memuat data operasional. Periksa koneksi jaringan Anda dan coba kembali.',
} as const;

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
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
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  CLUSTER_ACCESS_DENIED: 'CLUSTER_ACCESS_DENIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  OTP_COOLDOWN_ACTIVE: 'OTP_COOLDOWN_ACTIVE',
  TELEGRAM_DELIVERY_FAILED: 'TELEGRAM_DELIVERY_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export const OTP_CONFIG = {
  EXPIRY_SECONDS: 300,
  RESEND_COOLDOWN_SECONDS: 60,
  MAX_ATTEMPTS: 3,
  CODE_LENGTH: 6,
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
  [ERROR_CODES.INVALID_CREDENTIALS]: STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS,
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
  [ERROR_CODES.CUSTOMER_NOT_FOUND]: 'Data pelanggan (SIA) tidak ditemukan dalam basis data master.',
  [ERROR_CODES.TECH_NOT_FOUND]:
    'Data teknisi yang ditugaskan tidak ditemukan atau sedang tidak aktif.',
  [ERROR_CODES.TICKET_NOT_FOUND]: 'Nomor tiket atau work order tidak ditemukan dalam sistem.',
  [ERROR_CODES.CLUSTER_NOT_FOUND]:
    'Wilayah cluster jaringan tidak valid atau berada di luar cakupan wewenang Anda.',
  [ERROR_CODES.INVALID_GEOFENCE]:
    'Peringatan Geofence: Titik koordinat GPS Anda berada di luar radius toleransi ODP (maksimal 100 meter).',
  [ERROR_CODES.MOCK_LOCATION_DETECTED]:
    'Sistem Keamanan Integritas Lapangan: Terdeteksi Mock Location / Fake GPS pada perangkat. Tombol Submit dikunci.',
  [ERROR_CODES.AI_ACTION_EXPIRED]:
    'Batas waktu persetujuan aksi AI telah kedaluwarsa. Silakan ajukan perintah baru pada AI Assistant.',
  [ERROR_CODES.INVALID_ACTION_TOKEN]: 'Token kriptografi aksi AI tidak valid atau telah dirusak.',
  [ERROR_CODES.HIERARCHY_VIOLATION]:
    'Pelanggaran Hierarki Keamanan: Anda tidak diizinkan mengubah akun dengan tingkat wewenang setara atau lebih tinggi.',
  [ERROR_CODES.VALIDATION_ERROR]:
    'Format data tidak valid. Pastikan semua kolom terisi sesuai spesifikasi teknis.',
  [ERROR_CODES.INTERNAL_ERROR]: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
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
  [ERROR_CODES.TOKEN_EXPIRED]:
    'Sesi akses Anda telah kedaluwarsa. Sistem sedang memperbarui token secara otomatis.',
  [ERROR_CODES.CLUSTER_ACCESS_DENIED]:
    'Akses ditolak: Anda tidak memiliki wewenang pada cluster wilayah ini.',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]:
    'Batas permintaan terlampaui. Silakan tunggu beberapa saat sebelum mencoba kembali.',
  [ERROR_CODES.OTP_INVALID]:
    'Kode OTP tidak sesuai. Periksa kembali pesan dari Bot Telegram Anda.',
  [ERROR_CODES.OTP_EXPIRED]:
    'Kode OTP telah kedaluwarsa (batas waktu 5 menit). Silakan minta kode OTP baru.',
  [ERROR_CODES.OTP_MAX_ATTEMPTS]:
    'Batas percobaan OTP terlampaui (maksimal 3x). Silakan masuk ulang dari halaman login.',
  [ERROR_CODES.OTP_COOLDOWN_ACTIVE]:
    'Harap tunggu jeda waktu sebelum meminta pengiriman ulang kode OTP.',
  [ERROR_CODES.TELEGRAM_DELIVERY_FAILED]:
    'Belum dapat mengirim kode OTP ke Telegram. Pastikan Anda telah menekan /start pada Bot Telegram NOC.',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
};

const TECHNICAL_ERROR_CODE_RE =
  /^(?:P\d{4}|(?:08|22|23|42|53|54|57|58|XX)[0-9A-Z]{3}|E(?:CONN|TIME|NOTFOUND|HOST|PIPE|AI_|NOENT|ACCES|PERM)[A-Z0-9_]*|ERR_[A-Z0-9_]+)$/i;

const RUNTIME_ERROR_NAME_RE =
  /^(?:TypeError|SyntaxError|ReferenceError|RangeError|EvalError|URIError|AbortError|DOMException|PrismaClient.*)$/;

const DANGEROUS_UI_LEAK_RE =
  /prisma|postgresql|postgres|\bpg_[a-z_]+|sqlstate|\bsql\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\balter\b|\btable\b|\bcolumn\b|\brelation\b|constraint|syntax error|\bp\d{4}\b|invalid\s+`[^`]*`\s+invocation|invalid prisma|unique constraint|foreign key constraint|violates\s+|queryraw|executeraw|schema\s+"|docker|redis|minio|ollama|database_url|jwt_secret|hmac_action_secret|at\s+\S+\s*\(|node_modules|econnrefused|etimedout|enotfound|econnreset|ehostunreach|epipe|eai_again|enoent|eacces|eperm|socket hang up|fetch failed|failed to fetch|load failed|networkerror|network request failed|network error|aborterror|operation was aborted|signal is aborted|\berr_[a-z0-9_]+|getaddrinfo|connect\s+(?:econn|etimed|timeout)|timeout\s+(?:of\s+\d+\s*ms\s+)?exceeded|timed?\s*out|127\.0\.0\.1|localhost|172\.\d+\.|192\.168\.|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b0\.0\.0\.0\b|process\.env|typeerror|referenceerror|syntaxerror|rangeerror|evalerror|urierror|cannot read propert|cannot set propert|is not a function|is not defined|undefined is not|null is not|maximum call stack|out of memory|is not valid json|unexpected token|unexpected end of json|unexpected end of input|json\.parse|http\s*(?:status\s*)?[45]\d{2}|status\s*(?:http\s*|code\s*)?[45]\d{2}|permintaan gagal diproses\s*\(\d+\)|internal server error|service unavailable|bad gateway|gateway timeout|401 unauthorized|403 forbidden|404 not found|connection\s+(?:closed|lost|failed|refused|reset)|database\s+connection|connection\s+pool|pool\s+exhausted|request\s+failed|something\s+(?:went\s+wrong|broke)|unexpected\s+error|fatal\s+error|\berrno\b|\bsyscall\b|query failed|database error|server error|execution failed|internal error|stack trace|traceback|unknown error|no such file|\.tsx?:|\.jsx?:|[A-Za-z]:\\/i;

const SAFE_CONTRACT_MESSAGE_SET = new Set<string>([
  ...Object.values(STANDARD_ERROR_MESSAGES),
  ...Object.values(ERROR_MESSAGES_MAP),
]);

const SAFE_INDONESIAN_DOMAIN_CONTEXT_RE =
  /\b(tidak|gagal|sudah|belum|wajib|harus|melebihi|maksimal|minimal|silakan|anda|tiket|pelanggan|teknisi|odp|sesi|akses|izin|fitur|kapasitas|karakter|validasi|konflik|terdaftar|digunakan|ditemukan|tunggu|detik|meminta|baru|percobaan|dikunci|sementara|keamanan|batas|waktu|periksa|kembali|masukkan|perangkat|jaringan|koneksi|gangguan|pemrosesan|kredensial|terjadi)\b/i;

/**
 * Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1).
 * Mengamankan error sebelum dirender ke Toast/Modal/Alert.
 * Memastikan tidak ada stack trace, detail infrastruktur, atau query SQL yang bocor.
 */
export function sanitizeUiErrorMessage(rawError: unknown): {
  code: string;
  message: string;
  isSanitized: true;
} {
  if (!rawError) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      isSanitized: true,
    };
  }

  // 1. Jika objek error merupakan runtime error JS / AbortError / PrismaClient*
  interface RawErrorShape {
    name?: unknown;
    code?: unknown;
    errorCode?: unknown;
    statusCode?: unknown;
    message?: unknown;
    error?: { code?: unknown; message?: unknown };
  }
  const errorObj =
    typeof rawError === 'object' && rawError !== null ? (rawError as RawErrorShape) : null;

  if (
    rawError instanceof TypeError ||
    rawError instanceof SyntaxError ||
    rawError instanceof ReferenceError ||
    rawError instanceof RangeError ||
    rawError instanceof EvalError ||
    rawError instanceof URIError ||
    (typeof errorObj?.name === 'string' && RUNTIME_ERROR_NAME_RE.test(errorObj.name))
  ) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      isSanitized: true,
    };
  }

  // 2. Jika objek error memiliki properti code teknis atau terdaftar
  const rawCode = errorObj?.code || errorObj?.errorCode || errorObj?.error?.code;

  if (rawCode && typeof rawCode === 'string') {
    if (TECHNICAL_ERROR_CODE_RE.test(rawCode.trim())) {
      return {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
        isSanitized: true,
      };
    }

    const uppercaseCode = rawCode.trim().toUpperCase();
    if (ERROR_MESSAGES_MAP[uppercaseCode]) {
      return {
        code: uppercaseCode,
        message: ERROR_MESSAGES_MAP[uppercaseCode],
        isSanitized: true,
      };
    }
  }

  // 3. Deteksi teks error mentah atau detail internal infrastruktur/runtime
  const rawMessage =
    typeof rawError === 'string'
      ? rawError.trim()
      : typeof errorObj?.message === 'string'
        ? errorObj.message.trim()
        : typeof errorObj?.error?.message === 'string'
          ? errorObj.error.message.trim()
          : '';

  if (rawMessage) {
    const mappedByMsg = ERROR_MESSAGES_MAP[rawMessage.toUpperCase()];
    if (mappedByMsg) {
      return {
        code: rawMessage.toUpperCase(),
        message: mappedByMsg,
        isSanitized: true,
      };
    }
  }

  if (rawMessage && SAFE_CONTRACT_MESSAGE_SET.has(rawMessage)) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: rawMessage,
      isSanitized: true,
    };
  }

  if (
    !rawMessage ||
    rawMessage.includes('\n') ||
    rawMessage.length >= 120 ||
    DANGEROUS_UI_LEAK_RE.test(rawMessage)
  ) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      isSanitized: true,
    };
  }

  // 4. Fallback aman untuk pesan domain Indonesia singkat (tanpa membocorkan kode teknis)
  if (/^[A-Z0-9_:-]{3,}$/.test(rawMessage)) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      isSanitized: true,
    };
  }

  const isGenericErrorInstance =
    (rawError instanceof Error || errorObj?.name === 'Error') &&
    typeof errorObj?.statusCode !== 'number';
  if (
    isGenericErrorInstance &&
    !SAFE_CONTRACT_MESSAGE_SET.has(rawMessage) &&
    !SAFE_INDONESIAN_DOMAIN_CONTEXT_RE.test(rawMessage)
  ) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      isSanitized: true,
    };
  }

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: rawMessage,
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

// 4. STANDARD ACTION LABELS (PRD & Indonesian Style Guidelines)
export const STANDARD_ACTION_LABELS = {
  RESET_FILTER: 'Reset Filter',
  RELOAD_DATA: 'Muat Ulang Data',
  RECHECK_DEVICE: 'Periksa Ulang Status Perangkat',
  RETRY: 'Coba Lagi',
  BACK_HOME: 'Kembali ke Beranda',
  CREATE_TICKET: 'Buat Tiket Baru',
} as const;

// 5. STANDARD EMPTY STATES DICTIONARY (PRD & Indonesian Style Guidelines)
export const STANDARD_EMPTY_STATES = {
  TICKETS: {
    EMPTY_TITLE: 'Belum ada penugasan tiket',
    EMPTY_DESC:
      'Saat ini belum ada work order pasang baru atau pemeliharaan di wilayah operasional Anda.',
    FILTER_TITLE: 'Tidak ada tiket yang cocok dengan filter',
    FILTER_DESC:
      'Tidak ada nomor tiket, pelanggan, atau teknisi yang sesuai dengan parameter filter dan status yang Anda tentukan.',
  },
  CUSTOMERS: {
    EMPTY_TITLE: 'Belum ada data pelanggan SIA',
    EMPTY_DESC:
      'Belum ada master data pelanggan FTTH yang terdaftar pada sistem operasional.',
    FILTER_TITLE: 'Data pelanggan tidak ditemukan',
    FILTER_DESC:
      'Tidak ada pelanggan atau nomor SIA yang cocok dengan kombinasi kata kunci pencarian dan filter status layanan.',
  },
  NETWORK: {
    EMPTY_TITLE: 'Belum ada data jaringan ODP',
    EMPTY_DESC:
      'Belum ada master data cluster dan splitter ODP yang terdaftar pada sistem wilayah ini.',
    FILTER_TITLE: 'Splitter atau ODP tidak ditemukan',
    FILTER_DESC:
      'Tidak ditemukan cluster wilayah atau kode splitter ODP yang sesuai dengan kata kunci pencarian Anda.',
  },
  TECHNICIANS: {
    EMPTY_TITLE: 'Belum ada teknisi terdaftar',
    EMPTY_DESC:
      'Belum ada akun teknisi lapangan yang terdaftar pada cakupan wilayah operasional ini.',
    FILTER_TITLE: 'Tidak ada teknisi yang sesuai filter',
    FILTER_DESC:
      'Tidak ditemukan teknisi dengan kata kunci nama, wilayah cluster, atau status akun yang dipilih.',
  },
  MOBILE_TICKETS: {
    EMPTY_TITLE: 'Belum ada penugasan tiket',
    EMPTY_DESC:
      'Anda belum memiliki tiket pekerjaan pasang baru (PSB) atau gangguan (Maintenance) yang ditugaskan.',
    FILTER_TITLE: 'Tidak ada tiket yang sesuai filter',
    FILTER_DESC:
      'Tidak ditemukan tiket pekerjaan yang sesuai dengan kata kunci pencarian atau kategori filter saat ini.',
  },
} as const;

// 6. SECURITY GATE SCREEN STRINGS (PRD Section 3.3 & Requirement R3)
export const SECURITY_GATE_STRINGS = {
  MOBILE_BADGE: 'KEAMANAN PERANGKAT OPERASIONAL',
  MOBILE_TITLE: 'Perangkat Tidak Memenuhi Standar Keamanan',
  MOBILE_DESC:
    'Aplikasi FiberOps ditolak berjalan pada perangkat yang terdeteksi memiliki Opsi Pengembang (Developer Options), USB Debugging, atau lingkungan tidak aman demi menjaga kerahasiaan topologi jaringan ISP.',
  WEB_BADGE: 'KEAMANAN PORTAL MOBILE',
  WEB_TITLE: 'Matikan Developer Tools Terlebih Dahulu',
  WEB_DESC:
    'Demi keamanan kredensial dan sesi operasional FiberOps, halaman login tidak dapat diakses selama Developer Tools atau mode inspeksi aktif pada tampilan seluler.',
  RECHECK_BUTTON: STANDARD_ACTION_LABELS.RECHECK_DEVICE,
} as const;

