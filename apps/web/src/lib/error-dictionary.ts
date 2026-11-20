import { ERROR_CODES } from '@repo/shared';

export type AppErrorCategory =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'CONFLICT'
  | 'SERVER_ERROR';

export interface ErrorCopySpec {
  title: string;
  message: string;
  actionLabel: string;
  retryable: boolean;
}

export const ERROR_CATEGORY_DICTIONARY: Record<AppErrorCategory, ErrorCopySpec> = {
  VALIDATION: {
    title: 'Periksa Kembali Isian Formulir',
    message: 'Beberapa data yang dimasukkan belum sesuai format. Periksa kolom yang ditandai.',
    actionLabel: 'Perbaiki Isian',
    retryable: false,
  },
  NOT_FOUND: {
    title: 'Data Tidak Ditemukan',
    message: 'Data atau halaman yang dicari mungkin telah dipindahkan, dihapus, atau belum tersedia.',
    actionLabel: 'Kembali ke Beranda',
    retryable: false,
  },
  UNAUTHORIZED: {
    title: 'Sesi Telah Berakhir',
    message: 'Sesi Anda telah berakhir demi keamanan akun. Silakan masuk kembali untuk melanjutkan pekerjaan.',
    actionLabel: 'Masuk Kembali',
    retryable: false,
  },
  FORBIDDEN: {
    title: 'Akses Dibatasi',
    message: 'Akun Anda belum memiliki izin untuk membuka halaman atau menjalankan tindakan ini.',
    actionLabel: 'Kembali',
    retryable: false,
  },
  PAYLOAD_TOO_LARGE: {
    title: 'Ukuran Berkas Terlalu Besar',
    message: 'Berkas yang dipilih melebihi batas maksimal yang diizinkan. Perkecil ukuran berkas lalu coba kembali.',
    actionLabel: 'Pilih Berkas Lain',
    retryable: false,
  },
  UNSUPPORTED_FILE: {
    title: 'Format Berkas Belum Didukung',
    message: 'Jenis berkas tidak sesuai dengan format yang diterima. Pilih berkas dengan format yang disarankan.',
    actionLabel: 'Pilih Berkas Lain',
    retryable: false,
  },
  OFFLINE: {
    title: 'Koneksi Internet Terputus',
    message: 'Perangkat sedang tidak terhubung ke jaringan. Isian dan draf Anda tetap aman di halaman ini.',
    actionLabel: 'Coba Hubungkan',
    retryable: true,
  },
  TIMEOUT: {
    title: 'Waktu Permintaan Habis',
    message: 'Permintaan membutuhkan waktu terlalu lama untuk merespons. Periksa kualitas koneksi Anda lalu coba lagi.',
    actionLabel: 'Coba Lagi',
    retryable: true,
  },
  RATE_LIMITED: {
    title: 'Mohon Tunggu Sebentar',
    message: 'Terlalu banyak permintaan dalam waktu singkat. Tunggu hingga hitung mundur selesai sebelum mencoba kembali.',
    actionLabel: 'Tunggu Sebentar',
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    title: 'Layanan Sedang Pemeliharaan atau Padat',
    message: 'Layanan operasional sedang dalam pemeliharaan singkat atau menerima beban tinggi. Silakan coba kembali beberapa saat lagi.',
    actionLabel: 'Periksa Kembali',
    retryable: true,
  },
  CONFLICT: {
    title: 'Perubahan Data Terdeteksi',
    message: 'Data ini baru saja diperbarui oleh petugas lain. Tampilan telah disegarkan agar Anda bekerja dengan data terbaru.',
    actionLabel: 'Muat Ulang Data',
    retryable: true,
  },
  SERVER_ERROR: {
    title: 'Kendala Sementara pada Sistem',
    message: 'Maaf, terjadi kendala sementara saat memproses permintaan Anda. Data Anda tetap aman, silakan coba lagi beberapa saat lagi.',
    actionLabel: 'Coba Lagi',
    retryable: true,
  },
};

export const ERROR_CODE_FRIENDLY_TITLES: Record<string, string> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Nama Pengguna atau Kata Sandi Belum Sesuai',
  [ERROR_CODES.UNAUTHORIZED]: 'Sesi Telah Berakhir',
  [ERROR_CODES.SESSION_REVOKED]: 'Sesi Perangkat Dihentikan',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Sesi Telah Berakhir',
  [ERROR_CODES.TOKEN_REUSE_DETECTED]: 'Sesi Ditangguhkan demi Keamanan',
  [ERROR_CODES.FORBIDDEN]: 'Akses Dibatasi',
  [ERROR_CODES.HIERARCHY_VIOLATION]: 'Wewenang Tidak Mencukupi',
  [ERROR_CODES.IDOR_VIOLATION]: 'Akses Dibatasi',
  [ERROR_CODES.CLUSTER_ACCESS_DENIED]: 'Wilayah di Luar Cakupan Akses',
  [ERROR_CODES.VALIDATION_ERROR]: 'Periksa Kembali Isian',
  [ERROR_CODES.PORT_OCCUPIED]: 'Port Splitter Sudah Terisi',
  [ERROR_CODES.TICKET_ALREADY_CLOSED]: 'Tiket Sudah Selesai',
  [ERROR_CODES.OTP_INVALID]: 'Kode OTP Belum Sesuai',
  [ERROR_CODES.OTP_EXPIRED]: 'Masa Berlaku Kode OTP Habis',
  [ERROR_CODES.OTP_MAX_ATTEMPTS]: 'Batas Percobaan OTP Tercapai',
  [ERROR_CODES.OTP_COOLDOWN_ACTIVE]: 'Tunggu Jeda Pengiriman OTP',
  [ERROR_CODES.TELEGRAM_DELIVERY_FAILED]: 'Pengiriman OTP Telegram Tertunda',
  [ERROR_CODES.RATE_LIMITED]: 'Mohon Tunggu Sebentar',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Mohon Tunggu Sebentar',
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 'Ukuran Berkas Terlalu Besar',
  [ERROR_CODES.UNSUPPORTED_MEDIA_TYPE]: 'Format Berkas Belum Didukung',
  [ERROR_CODES.REQUEST_TIMEOUT]: 'Waktu Permintaan Habis',
  [ERROR_CODES.NETWORK_OFFLINE]: 'Koneksi Internet Terputus',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Layanan Sedang Pemeliharaan',
  [ERROR_CODES.INTERNAL_ERROR]: 'Kendala Sementara pada Sistem',
};

export function formatRetryCountdownMessage(seconds: number, baseMessage?: string): string {
  const safeSeconds = Math.max(1, Math.ceil(seconds));
  const prefix = baseMessage ? `${baseMessage.replace(/\.$/, '')}. ` : 'Terlalu banyak permintaan dalam waktu singkat. ';
  return `${prefix}Mohon tunggu ${safeSeconds} detik sebelum mencoba kembali.`;
}
