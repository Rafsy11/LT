import {
  ATTENUATION_THRESHOLDS,
  MAX_GEOFENCE_RADIUS_METERS,
  classifyDbm,
  type DbTicket,
} from '@repo/shared';

export type MonitoringSeverity = 'Normal' | 'Warning' | 'Critical' | 'Unmeasured';
export type MonitoringTab = 'Semua' | MonitoringSeverity;
export type CriticalReason = 'low' | 'overpower' | null;

export const SPECTRUM_MIN_DBM = -35;
export const SPECTRUM_MAX_DBM = -10;
export const SPECTRUM_RANGE_DBM = SPECTRUM_MAX_DBM - SPECTRUM_MIN_DBM;
export const SPECTRUM_MIN_VISIBLE_PCT = 4;
export const GEOFENCE_RADIUS_METERS = MAX_GEOFENCE_RADIUS_METERS;

export interface LiveReportItem extends DbTicket {
  isLiveIncoming?: boolean;
}

export interface MonitoringValidationSummary {
  gpsStatus: 'ok' | 'warn' | 'missing';
  gpsDistanceMeters: number | null;
  gpsCompactLabel: string;
  gpsDetailLabel: string;
  gpsTitle: string;
  geofenceStatus: 'ok' | 'warn' | 'missing';
  geofenceDetailLabel: string;
  opmStatus: 'pending_review' | 'recorded' | 'missing';
  opmCompactLabel: string;
  opmDetailLabel: string;
  opmTitle: string;
}

/**
 * Checks whether an attenuation reading represents a real OPM measurement.
 * `0`, `null`, `undefined`, and `NaN` are treated as unmeasured because open
 * tickets default to `0` prior to technician field submission.
 *
 * @param value - Raw attenuation value in dBm.
 * @returns `true` if a non-zero finite measurement exists.
 * @example
 * isAttenuationMeasured(-21.4); // true
 * isAttenuationMeasured(0); // false
 */
export function isAttenuationMeasured(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

/**
 * Classifies an attenuation reading for NOC monitoring without falsely flagging
 * unmeasured (`0 dBm`) tickets as Critical overpower alerts.
 *
 * @param value - Raw attenuation value in dBm.
 * @returns One of `'Normal'`, `'Warning'`, `'Critical'`, or `'Unmeasured'`.
 * @example
 * classifyMonitoringDbm(0); // 'Unmeasured'
 * classifyMonitoringDbm(-29.2); // 'Critical'
 */
export function classifyMonitoringDbm(value: number | null | undefined): MonitoringSeverity {
  if (!isAttenuationMeasured(value)) {
    return 'Unmeasured';
  }
  const sharedStatus = classifyDbm(value);
  if (sharedStatus === 'Neutral') {
    return 'Unmeasured';
  }
  return sharedStatus;
}

/**
 * Determines whether a critical reading is caused by excessive loss (`< -28 dBm`)
 * or excessive receive power (`> -10 dBm`).
 *
 * @param value - Raw attenuation value in dBm.
 * @returns `'low'`, `'overpower'`, or `null` when not critical.
 * @example
 * getCriticalReason(-30.5); // 'low'
 * getCriticalReason(-7.2); // 'overpower'
 */
export function getCriticalReason(value: number | null | undefined): CriticalReason {
  if (!isAttenuationMeasured(value)) {
    return null;
  }
  if (value < ATTENUATION_THRESHOLDS.CRITICAL_BELOW) {
    return 'low';
  }
  if (value > ATTENUATION_THRESHOLDS.CRITICAL_ABOVE) {
    return 'overpower';
  }
  return null;
}

/**
 * Returns the localized Indonesian severity label for screen readers and badges.
 *
 * @param severity - Monitoring severity category.
 * @returns Human-readable Indonesian label.
 * @example
 * getSeverityLabel('Warning'); // 'Peringatan'
 */
export function getSeverityLabel(severity: MonitoringSeverity): string {
  switch (severity) {
    case 'Normal':
      return 'Normal';
    case 'Warning':
      return 'Peringatan';
    case 'Critical':
      return 'Kritis';
    case 'Unmeasured':
      return 'Belum diukur';
  }
}

/**
 * Maps an attenuation value onto the aligned `[-35 dBm, -10 dBm]` spectrum scale.
 * Returns `0` for unmeasured readings so the gauge stays empty instead of full.
 *
 * @param value - Attenuation value in dBm.
 * @returns Percentage between `0` and `100`.
 * @example
 * getSpectrumMeterPercentage(-25); // 40
 * getSpectrumMeterPercentage(0); // 0
 */
export function getSpectrumMeterPercentage(value: number | null | undefined): number {
  if (!isAttenuationMeasured(value)) {
    return 0;
  }
  const rawPct = ((value - SPECTRUM_MIN_DBM) / SPECTRUM_RANGE_DBM) * 100;
  const clamped = Math.min(Math.max(rawPct, SPECTRUM_MIN_VISIBLE_PCT), 100);
  return Math.round(clamped * 10) / 10;
}

/**
 * Derives factual GPS, geofence, and OPM proof states from actual ticket fields
 * without inventing default distances or verification claims.
 *
 * @param report - Live ticket report item.
 * @returns Structured factual validation metadata.
 * @example
 * resolveValidationSummary(ticket);
 */
export function resolveValidationSummary(report: LiveReportItem): MonitoringValidationSummary {
  const rawDistance = report.pendingSubmission?.distanceToSplitterM ?? report.distanceToSplitterM;
  const hasGps = typeof rawDistance === 'number' && Number.isFinite(rawDistance) && rawDistance >= 0;
  const roundedDistance = hasGps ? Math.round(rawDistance) : null;
  const isFlagged = Boolean(
    report.pendingSubmission?.isLocationFlagged ??
      report.isLocationFlagged ??
      (roundedDistance !== null && roundedDistance > GEOFENCE_RADIUS_METERS),
  );

  const gpsStatus: 'ok' | 'warn' | 'missing' = !hasGps
    ? 'missing'
    : isFlagged
      ? 'warn'
      : 'ok';

  const gpsCompactLabel =
    roundedDistance === null
      ? 'Belum ada GPS'
      : isFlagged
        ? `${roundedDistance}m (> ${GEOFENCE_RADIUS_METERS}m)`
        : `${roundedDistance}m (OK)`;

  const gpsDetailLabel =
    roundedDistance === null
      ? 'Belum ada data koordinat GPS'
      : isFlagged
        ? `${roundedDistance}m (Di luar radius ${GEOFENCE_RADIUS_METERS}m)`
        : `${roundedDistance}m (Sesuai radius <= ${GEOFENCE_RADIUS_METERS}m)`;

  const gpsTitle =
    roundedDistance === null
      ? 'Koordinat GPS lapangan belum dikirim teknisi'
      : isFlagged
        ? `Jarak teknisi ${roundedDistance} meter melebihi batas ${GEOFENCE_RADIUS_METERS} meter dari ODP`
        : `Jarak teknisi ${roundedDistance} meter berada dalam batas ${GEOFENCE_RADIUS_METERS} meter dari ODP`;

  const geofenceStatus: 'ok' | 'warn' | 'missing' = isFlagged
    ? 'warn'
    : hasGps
      ? 'ok'
      : 'missing';

  const geofenceDetailLabel = isFlagged
    ? 'Ditandai anomali lokasi'
    : hasGps
      ? 'Dalam radius ODP'
      : 'Menunggu verifikasi lokasi';

  const hasPendingPhoto = Boolean(
    report.pendingSubmission?.photoObjectKey || report.pendingSubmission?.photoUrl,
  );
  const hasRecordedProof =
    report.status === 'Selesai' &&
    isAttenuationMeasured(report.currentAttenuation) &&
    Boolean(report.completedAt);

  const opmStatus: 'pending_review' | 'recorded' | 'missing' = hasPendingPhoto
    ? 'pending_review'
    : hasRecordedProof
      ? 'recorded'
      : 'missing';

  const opmCompactLabel =
    opmStatus === 'pending_review'
      ? 'Foto OPM menunggu tinjauan'
      : opmStatus === 'recorded'
        ? 'Bukti OPM tercatat'
        : 'Belum ada bukti OPM';

  const opmDetailLabel =
    opmStatus === 'pending_review'
      ? 'Tersedia (Menunggu verifikasi)'
      : opmStatus === 'recorded'
        ? 'Tercatat saat penyelesaian'
        : 'Belum diunggah';

  const opmTitle =
    opmStatus === 'pending_review'
      ? 'Bukti foto OPM telah diunggah teknisi dan menunggu verifikasi admin'
      : opmStatus === 'recorded'
        ? 'Pengukuran dan bukti OPM tercatat pada penyelesaian tiket'
        : 'Teknisi belum mengunggah bukti foto OPM untuk tiket ini';

  return {
    gpsStatus,
    gpsDistanceMeters: roundedDistance,
    gpsCompactLabel,
    gpsDetailLabel,
    gpsTitle,
    geofenceStatus,
    geofenceDetailLabel,
    opmStatus,
    opmCompactLabel,
    opmDetailLabel,
    opmTitle,
  };
}

/**
 * Matches a ticket against the active cluster dropdown selection by cluster name
 * or cluster code without relying on legacy city-prefix string hacks.
 *
 * @param report - Live ticket report item.
 * @param selectedCluster - Cluster name or `'Semua cluster'`.
 * @returns `true` if the report belongs to the selected cluster scope.
 * @example
 * matchesClusterSelection(report, 'Semua cluster'); // true
 */
export function matchesClusterSelection(report: LiveReportItem, selectedCluster: string): boolean {
  if (!selectedCluster || selectedCluster === 'Semua cluster') {
    return true;
  }
  const normalizedSelected = selectedCluster.trim().toLowerCase();
  const normalizedName = (report.cluster || '').trim().toLowerCase();
  const normalizedCode = (report.clusterCode || '').trim().toLowerCase();

  return (
    normalizedName === normalizedSelected ||
    normalizedCode === normalizedSelected ||
    normalizedName.includes(normalizedSelected)
  );
}
