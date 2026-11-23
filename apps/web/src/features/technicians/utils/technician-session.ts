import type { TechnicianListItem } from '@repo/shared';

export type TechnicianVisualState = 'locked' | 'active' | 'revoked' | 'idle';
export type TechnicianModalIntent = 'inspect' | 'force_logout' | 'lock_account' | 'unlock_account';

export interface TechnicianVisualMeta {
  state: TechnicianVisualState;
  badgeLabel: string;
  sessionLabel: string;
  bannerTitle: string;
  bannerDescription: string;
}

/**
 * Resolves a single authoritative visual state and honest operational copy
 * for a technician account and mobile device session.
 *
 * @param tech - Technician directory item.
 * @returns Visual state token and Indonesian operational labels.
 * @example
 * resolveTechnicianVisualState(tech);
 */
export function resolveTechnicianVisualState(tech: TechnicianListItem): TechnicianVisualMeta {
  if (!tech.isActive) {
    return {
      state: 'locked',
      badgeLabel: 'Terkunci',
      sessionLabel: 'Akun Terkunci',
      bannerTitle: 'Akun Teknisi Terkunci',
      bannerDescription:
        'Akses aplikasi mobile untuk akun ini sedang dinonaktifkan dan seluruh sesi perangkat telah dicabut. Aktifkan kembali akun jika teknisi sudah siap bertugas.',
    };
  }

  if (tech.sessionStatus === 'ACTIVE_SESSION') {
    return {
      state: 'active',
      badgeLabel: 'Sesi Aktif',
      sessionLabel: 'Sesi Aktif',
      bannerTitle: 'Sesi Mobile Aktif',
      bannerDescription:
        'Teknisi sedang terhubung dengan perangkat terdaftar dan dapat menerima serta melaporkan hasil pengerjaan tiket lapangan.',
    };
  }

  if (tech.sessionStatus === 'REVOKED') {
    return {
      state: 'revoked',
      badgeLabel: 'Sesi Dicabut',
      sessionLabel: 'Dicabut',
      bannerTitle: 'Sesi Perangkat Dicabut',
      bannerDescription:
        'Sesi terakhir perangkat ini telah dicabut oleh administrator. Teknisi perlu masuk ulang melalui aplikasi mobile untuk melanjutkan tugas.',
    };
  }

  return {
    state: 'idle',
    badgeLabel: 'Belum Login',
    sessionLabel: 'Belum Login',
    bannerTitle: 'Belum Ada Sesi Aktif',
    bannerDescription:
      'Akun teknisi aktif, namun belum ada sesi login perangkat mobile yang sedang berlangsung saat ini.',
  };
}

/**
 * Produces truthful Indonesian activity text based on both session state and
 * last recorded timestamp, avoiding misleading labels like "Online 3 hari yang lalu".
 *
 * @param tech - Technician directory item.
 * @returns Contextual activity label.
 * @example
 * formatTechnicianActivityText(tech);
 */
export function formatTechnicianActivityText(tech: TechnicianListItem): string {
  const lastActive = tech.lastActiveAt?.trim();
  if (!lastActive) {
    return 'Belum ada riwayat sesi';
  }

  if (!tech.isActive) {
    return `Akun dikunci · ${lastActive}`;
  }

  if (tech.sessionStatus === 'ACTIVE_SESSION') {
    return `Aktif ${lastActive}`;
  }

  if (tech.sessionStatus === 'REVOKED') {
    return `Dicabut · ${lastActive}`;
  }

  return `Terakhir aktif: ${lastActive}`;
}

/**
 * Matches a technician against the selected cluster filter cleanly without
 * legacy city-prefix string stripping.
 *
 * @param tech - Technician directory item.
 * @param selectedCluster - Active cluster dropdown value.
 * @returns `true` if technician belongs to the selected cluster filter.
 * @example
 * matchesTechnicianCluster(tech, 'Semua cluster'); // true
 */
export function matchesTechnicianCluster(
  tech: TechnicianListItem,
  selectedCluster: string,
): boolean {
  if (!selectedCluster || selectedCluster === 'Semua cluster') {
    return true;
  }
  const normalizedTarget = selectedCluster.trim().toLowerCase();
  const normalizedCluster = (tech.cluster || '').trim().toLowerCase();
  return (
    normalizedCluster === normalizedTarget ||
    normalizedCluster.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedCluster)
  );
}

/**
 * Searches technicians across full name, username, NIK, vendor company,
 * cluster, device ID, and device model.
 *
 * @param tech - Technician directory item.
 * @param query - Raw search input string.
 * @returns `true` if technician matches the query.
 * @example
 * matchesTechnicianSearch(tech, '882043'); // true
 */
export function matchesTechnicianSearch(tech: TechnicianListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return (
    tech.fullName.toLowerCase().includes(q) ||
    tech.username.toLowerCase().includes(q) ||
    (tech.cluster || '').toLowerCase().includes(q) ||
    Boolean(tech.nik && tech.nik.toLowerCase().includes(q)) ||
    Boolean(tech.vendorCompany && tech.vendorCompany.toLowerCase().includes(q)) ||
    Boolean(tech.deviceId && tech.deviceId.toLowerCase().includes(q)) ||
    Boolean(tech.deviceModel && tech.deviceModel.toLowerCase().includes(q))
  );
}
