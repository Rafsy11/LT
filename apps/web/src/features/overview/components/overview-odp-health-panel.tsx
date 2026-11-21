'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ATTENUATION_THRESHOLDS,
  isAttenuationBad,
  type OdpMapRadarItem,
  type OdpRadarSummary,
} from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

const MAX_VISIBLE_ANOMALIES = 5;
const MAX_VISIBLE_CLUSTERS = 6;
const GOOD_LIMIT_DB = ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB;

type HealthPanelTab = 'anomalies' | 'clusters';

interface ClusterHealthRollup {
  clusterCode: string;
  clusterName: string;
  totalOdps: number;
  normalCount: number;
  abnormalCount: number;
  unmeasuredCount: number;
  badPortCount: number;
  usedPorts: number;
  maxPorts: number;
}

export interface OverviewOdpHealthPanelProps {
  items: OdpMapRadarItem[];
  summary: OdpRadarSummary;
  selectedCluster: string;
  selectedClusterCode?: string | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onResetCluster?: () => void;
  canReadNetwork?: boolean;
}

function buildMapsHref(params: {
  odp?: string;
  cluster?: string | null;
  status?: 'NORMAL' | 'ABNORMAL' | 'UNMEASURED';
}): string {
  const qs = new URLSearchParams();
  if (params.odp) qs.set('odp', params.odp);
  if (params.cluster) qs.set('cluster', params.cluster);
  if (params.status) qs.set('status', params.status);
  const query = qs.toString();
  return query ? `/maps?${query}` : '/maps';
}

function sortAnomalies(items: OdpMapRadarItem[]): OdpMapRadarItem[] {
  return items
    .filter((item) => item.radarStatus === 'ABNORMAL')
    .sort((a, b) => {
      const aWorst = a.worstAttenuation ?? 0;
      const bWorst = b.worstAttenuation ?? 0;
      if (aWorst !== bWorst) return aWorst - bWorst;
      if (b.openTicketCount !== a.openTicketCount) return b.openTicketCount - a.openTicketCount;
      return b.badPortCount - a.badPortCount;
    });
}

function buildClusterRollups(items: OdpMapRadarItem[]): ClusterHealthRollup[] {
  const map = new Map<string, ClusterHealthRollup>();

  for (const item of items) {
    const existing = map.get(item.clusterCode);
    if (existing) {
      existing.totalOdps += 1;
      if (item.radarStatus === 'NORMAL') existing.normalCount += 1;
      else if (item.radarStatus === 'ABNORMAL') existing.abnormalCount += 1;
      else existing.unmeasuredCount += 1;
      existing.badPortCount += item.badPortCount;
      existing.usedPorts += item.usedPorts;
      existing.maxPorts += item.maxPorts;
    } else {
      map.set(item.clusterCode, {
        clusterCode: item.clusterCode,
        clusterName: item.clusterName,
        totalOdps: 1,
        normalCount: item.radarStatus === 'NORMAL' ? 1 : 0,
        abnormalCount: item.radarStatus === 'ABNORMAL' ? 1 : 0,
        unmeasuredCount: item.radarStatus === 'UNMEASURED' ? 1 : 0,
        badPortCount: item.badPortCount,
        usedPorts: item.usedPorts,
        maxPorts: item.maxPorts,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.abnormalCount !== a.abnormalCount) return b.abnormalCount - a.abnormalCount;
    if (b.badPortCount !== a.badPortCount) return b.badPortCount - a.badPortCount;
    return b.totalOdps - a.totalOdps;
  });
}

/**
 * Operational Cluster Health & ODP Anomaly Watchlist panel for the Overview dashboard (`/`).
 * Replaces the redundant abstract SVG map with actionable triage aligned to the 28 dB standard
 * and direct deep-links into `/maps`.
 *
 * @param props - Aggregated ODP radar items, summary metrics, active cluster filter, and UI states.
 * @returns Rendered operational ODP health triage panel.
 * @example
 * <OverviewOdpHealthPanel
 *   items={odpRadarItems}
 *   summary={odpRadarSummary}
 *   selectedCluster={cluster}
 *   selectedClusterCode={selectedClusterCode}
 * />
 */
export function OverviewOdpHealthPanel({
  items,
  summary,
  selectedCluster,
  selectedClusterCode = null,
  isLoading = false,
  errorMessage = null,
  onRetry,
  onResetCluster,
  canReadNetwork = true,
}: OverviewOdpHealthPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<HealthPanelTab>('anomalies');

  const activeClusterParam =
    selectedCluster && selectedCluster !== 'Semua cluster'
      ? selectedClusterCode || selectedCluster
      : null;

  const abnormalItems = useMemo(() => sortAnomalies(items), [items]);
  const visibleAnomalies = useMemo(
    () => abnormalItems.slice(0, MAX_VISIBLE_ANOMALIES),
    [abnormalItems],
  );
  const clusterRollups = useMemo(() => buildClusterRollups(items), [items]);
  const visibleClusters = useMemo(
    () => clusterRollups.slice(0, MAX_VISIBLE_CLUSTERS),
    [clusterRollups],
  );

  const totalOdps = summary.totalOdps;
  const normalPct = totalOdps > 0 ? Math.round((summary.normalCount / totalOdps) * 100) : 0;
  const abnormalPct = totalOdps > 0 ? Math.round((summary.abnormalCount / totalOdps) * 100) : 0;
  const unmeasuredPct = totalOdps > 0 ? Math.max(0, 100 - normalPct - abnormalPct) : 0;

  const fullMapsHref = buildMapsHref({ cluster: activeClusterParam });
  const abnormalMapsHref = buildMapsHref({ cluster: activeClusterParam, status: 'ABNORMAL' });
  const normalMapsHref = buildMapsHref({ cluster: activeClusterParam, status: 'NORMAL' });
  const unmeasuredMapsHref = buildMapsHref({ cluster: activeClusterParam, status: 'UNMEASURED' });

  return (
    <section
      className="panel odp-health-panel"
      aria-label="Kesehatan Cluster dan Radar Anomali ODP"
    >
      <div className="panel-inner">
        <header className="panel-heading odp-health-header">
          <div className="odp-health-heading-copy">
            <h2>Kesehatan Cluster &amp; Radar ODP</h2>
            <p>
              Standar redaman optik &le; {GOOD_LIMIT_DB} dB (Normal) vs &gt; {GOOD_LIMIT_DB} dB
              (Tidak Normal)
            </p>
          </div>
          <Link
            href={fullMapsHref}
            className="odp-open-maps-link"
            aria-label="Buka Peta Radar ODP di halaman Maps"
          >
            <Icon name="map" size={14} />
            <span>Buka Peta Radar</span>
          </Link>
        </header>

        {!canReadNetwork ? (
          <div className="odp-health-body">
            <EmptyState
              icon="lock"
              title="Akses data jaringan dibatasi"
              description="Akun Anda belum memiliki izin network:read untuk memantau status radar ODP per cluster."
              size="compact"
            />
          </div>
        ) : isLoading && items.length === 0 ? (
          <div className="odp-health-body" aria-busy="true" aria-label="Memuat status radar ODP">
            <Skeleton width="100%" height={8} borderRadius={4} style={{ marginBottom: '12px' }} />
            <div className="odp-summary-tiles">
              <Skeleton width="100%" height={56} borderRadius={6} />
              <Skeleton width="100%" height={56} borderRadius={6} />
              <Skeleton width="100%" height={56} borderRadius={6} />
            </div>
            <div className="odp-health-skel-rows">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} width="100%" height={46} borderRadius={6} />
              ))}
            </div>
          </div>
        ) : errorMessage && items.length === 0 ? (
          <div className="odp-health-body">
            <SafeErrorState
              error={errorMessage}
              title="Gagal Memuat Radar ODP"
              description={errorMessage}
              onRetry={onRetry}
              variant="compact"
            />
          </div>
        ) : totalOdps === 0 ? (
          <div className="odp-health-body">
            <EmptyState
              icon="network"
              title="Belum ada titik ODP terdaftar"
              description={
                activeClusterParam
                  ? `Tidak ada titik datek ODP ditemukan pada cakupan cluster ${selectedCluster}.`
                  : 'Tambahkan atau impor data master ODP untuk memantau status redaman optik.'
              }
              actionLabel={
                activeClusterParam && onResetCluster ? 'Tampilkan Semua Cluster' : 'Kelola Master ODP'
              }
              onAction={
                activeClusterParam && onResetCluster
                  ? onResetCluster
                  : () => router.push('/network')
              }
              size="compact"
            />
          </div>
        ) : (
          <div className="odp-health-body">
            {/* Stacked Health Ratio Bar */}
            <div
              className="odp-ratio-bar"
              role="img"
              aria-label={`Proporsi ODP: ${summary.normalCount} normal (${normalPct}%), ${summary.abnormalCount} tidak normal (${abnormalPct}%), ${summary.unmeasuredCount} belum diukur (${unmeasuredPct}%)`}
            >
              {summary.normalCount > 0 && (
                <span
                  className="odp-ratio-seg normal"
                  style={{ width: `${(summary.normalCount / totalOdps) * 100}%` }}
                />
              )}
              {summary.abnormalCount > 0 && (
                <span
                  className="odp-ratio-seg abnormal"
                  style={{ width: `${(summary.abnormalCount / totalOdps) * 100}%` }}
                />
              )}
              {summary.unmeasuredCount > 0 && (
                <span
                  className="odp-ratio-seg unmeasured"
                  style={{ width: `${(summary.unmeasuredCount / totalOdps) * 100}%` }}
                />
              )}
            </div>

            {/* 3 Interactive Summary Tiles Deep-Linked to /maps */}
            <div className="odp-summary-tiles" role="group" aria-label="Ringkasan status ODP">
              <Link href={normalMapsHref} className="odp-summary-tile is-normal">
                <div className="odp-tile-top">
                  <span className="odp-tile-dot normal" aria-hidden="true" />
                  <span className="odp-tile-label">Normal (&le; {GOOD_LIMIT_DB} dB)</span>
                </div>
                <div className="odp-tile-metric">
                  <strong>{summary.normalCount}</strong>
                  <span>{normalPct}% ODP</span>
                </div>
              </Link>

              <Link href={abnormalMapsHref} className="odp-summary-tile is-abnormal">
                <div className="odp-tile-top">
                  <span className="odp-tile-dot abnormal" aria-hidden="true" />
                  <span className="odp-tile-label">Tidak Normal (&gt; {GOOD_LIMIT_DB} dB)</span>
                </div>
                <div className="odp-tile-metric">
                  <strong>{summary.abnormalCount}</strong>
                  <span>
                    {summary.badAttenuationCustomers > 0
                      ? `${summary.badAttenuationCustomers} port buruk`
                      : 'anomali / tiket'}
                  </span>
                </div>
              </Link>

              <Link href={unmeasuredMapsHref} className="odp-summary-tile is-unmeasured">
                <div className="odp-tile-top">
                  <span className="odp-tile-dot unmeasured" aria-hidden="true" />
                  <span className="odp-tile-label">Belum Diukur</span>
                </div>
                <div className="odp-tile-metric">
                  <strong>{summary.unmeasuredCount}</strong>
                  <span>dari {totalOdps} ODP</span>
                </div>
              </Link>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="odp-panel-tabs-bar">
              <div className="odp-panel-tabs" role="tablist" aria-label="Mode ringkasan ODP">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'anomalies'}
                  className={`odp-panel-tab ${activeTab === 'anomalies' ? 'active' : ''}`}
                  onClick={() => setActiveTab('anomalies')}
                >
                  <span>Anomali ODP (&gt; {GOOD_LIMIT_DB} dB)</span>
                  <span
                    className={`odp-tab-count ${summary.abnormalCount > 0 ? 'is-critical' : ''}`}
                  >
                    {summary.abnormalCount}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'clusters'}
                  className={`odp-panel-tab ${activeTab === 'clusters' ? 'active' : ''}`}
                  onClick={() => setActiveTab('clusters')}
                >
                  <span>Ringkasan Cluster</span>
                  <span className="odp-tab-count">{clusterRollups.length}</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Critical ODP Anomalies Watchlist */}
            {activeTab === 'anomalies' ? (
              abnormalItems.length === 0 ? (
                <div className="odp-all-normal-card" role="status">
                  <span className="odp-all-normal-icon" aria-hidden="true">
                    <Icon name="checkCircle" size={18} />
                  </span>
                  <div className="odp-all-normal-copy">
                    <strong>Seluruh titik ODP dalam batas normal (&le; {GOOD_LIMIT_DB} dB)</strong>
                    <span>
                      {summary.normalCount} ODP terukur optimal
                      {summary.unmeasuredCount > 0
                        ? `, ${summary.unmeasuredCount} ODP menunggu pengukuran OPM/OLT.`
                        : ' tanpa indikasi gangguan redaman.'}
                    </span>
                  </div>
                  <Link href={fullMapsHref} className="odp-row-map-btn">
                    <Icon name="mapPin" size={13} />
                    <span>Buka Peta</span>
                  </Link>
                </div>
              ) : (
                <>
                  <ul className="odp-triage-list" aria-label="Daftar prioritas ODP tidak normal">
                    {visibleAnomalies.map((odp) => {
                      const isBadDbm =
                        odp.worstAttenuation !== null && isAttenuationBad(odp.worstAttenuation);
                      const primaryReason =
                        odp.anomalyReasons[0] ||
                        (odp.badPortCount > 0
                          ? `${odp.badPortCount} port melewati batas ${GOOD_LIMIT_DB} dB`
                          : `${odp.openTicketCount} tiket gangguan aktif`);

                      return (
                        <li key={odp.id} className="odp-triage-row">
                          <div className="odp-triage-main">
                            <div className="odp-triage-top">
                              <code className="odp-code-badge">{odp.splitterCode}</code>
                              <span className="odp-cluster-chip">{odp.clusterCode}</span>
                              {odp.openTicketCount > 0 && (
                                <span className="odp-ticket-chip">
                                  {odp.openTicketCount} tiket aktif
                                </span>
                              )}
                            </div>
                            <div className="odp-triage-name" title={odp.name}>
                              {odp.name}
                            </div>
                            <div className="odp-triage-reason" title={primaryReason}>
                              {primaryReason}
                            </div>
                          </div>

                          <div className="odp-triage-right">
                            <div className="odp-triage-metrics">
                              <span className={`odp-dbm-readout ${isBadDbm ? 'is-bad' : ''}`}>
                                {odp.worstAttenuation !== null
                                  ? `${odp.worstAttenuation.toFixed(1)} dB`
                                  : 'Anomali'}
                              </span>
                              <span className="odp-port-meta">
                                {odp.usedPorts}/{odp.maxPorts} port
                              </span>
                            </div>
                            <Link
                              href={buildMapsHref({ odp: odp.splitterCode })}
                              className="odp-row-map-btn"
                              aria-label={`Lihat lokasi ${odp.splitterCode} di Peta Radar Maps`}
                            >
                              <Icon name="mapPin" size={13} />
                              <span>Lihat di Peta</span>
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {abnormalItems.length > MAX_VISIBLE_ANOMALIES && (
                    <div className="odp-triage-footer">
                      <Link href={abnormalMapsHref} className="link-arrow">
                        <span>Lihat semua {abnormalItems.length} ODP tidak normal di Peta Radar</span>
                        <Icon name="arrowRight" size={13} />
                      </Link>
                    </div>
                  )}
                </>
              )
            ) : (
              /* Tab 2: Per-Cluster Health Rollup */
              <>
                <ul className="odp-cluster-list" aria-label="Ringkasan kesehatan per cluster">
                  {visibleClusters.map((c) => {
                    const measured = c.normalCount + c.abnormalCount;
                    const healthPct = measured > 0 ? Math.round((c.normalCount / measured) * 100) : 100;
                    const clusterHref = buildMapsHref({
                      cluster: c.clusterCode,
                      status: c.abnormalCount > 0 ? 'ABNORMAL' : undefined,
                    });

                    return (
                      <li key={c.clusterCode}>
                        <Link
                          href={clusterHref}
                          className={`odp-cluster-row ${c.abnormalCount > 0 ? 'has-anomaly' : ''}`}
                          aria-label={`Buka peta radar untuk cluster ${c.clusterName}`}
                        >
                          <div className="odp-cluster-info">
                            <div className="odp-cluster-title-row">
                              <strong>{c.clusterName}</strong>
                              <code className="odp-cluster-chip">{c.clusterCode}</code>
                            </div>
                            <div className="odp-cluster-bar-track" aria-hidden="true">
                              <span
                                className={`odp-cluster-bar-fill ${c.abnormalCount > 0 ? 'has-anomaly' : 'is-normal'}`}
                                style={{ width: `${measured > 0 ? healthPct : 0}%` }}
                              />
                            </div>
                          </div>

                          <div className="odp-cluster-stats">
                            <span
                              className={`odp-cluster-status-badge ${c.abnormalCount > 0 ? 'is-abnormal' : 'is-normal'}`}
                            >
                              {c.abnormalCount > 0
                                ? `${c.abnormalCount} tidak normal`
                                : `${c.normalCount} normal`}
                            </span>
                            <span className="odp-port-meta">
                              {c.totalOdps} ODP · {c.usedPorts}/{c.maxPorts} port
                            </span>
                          </div>

                          <Icon name="chevronRight" size={14} className="odp-cluster-chevron" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {clusterRollups.length > MAX_VISIBLE_CLUSTERS && (
                  <div className="odp-triage-footer">
                    <Link href={fullMapsHref} className="link-arrow">
                      <span>Lihat seluruh {clusterRollups.length} cluster di Peta Radar</span>
                      <Icon name="arrowRight" size={13} />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
