'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { isAttenuationBad, type OdpMapRadarItem } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';

interface OdpInspectorPanelProps {
  odp: OdpMapRadarItem | null;
  highlightedSia?: string;
}

export function OdpInspectorPanel({ odp, highlightedSia }: OdpInspectorPanelProps) {
  const [showGoogleEmbed, setShowGoogleEmbed] = useState(false);

  if (!odp) {
    return (
      <aside className="maps-inspector" aria-label="Inspektor Titik ODP">
        <EmptyState
          icon="mapPin"
          title="Pilih Titik Datek ODP"
          description="Klik salah satu titik radar ODP di peta untuk melihat status redaman, daftar pelanggan, dan rute Google Maps."
          size="compact"
        />
      </aside>
    );
  }

  const statusMeta =
    odp.radarStatus === 'ABNORMAL'
      ? { label: 'TIDAK NORMAL (> 28 dB / Gangguan)', cls: 'is-abnormal' }
      : odp.radarStatus === 'NORMAL'
        ? { label: 'NORMAL (≤ 28 dB)', cls: 'is-normal' }
        : { label: 'BELUM DIUKUR', cls: 'is-unmeasured' };

  const hasSafeCoords =
    Number.isFinite(odp.lat) &&
    Number.isFinite(odp.lng) &&
    odp.lat >= -90 &&
    odp.lat <= 90 &&
    odp.lng >= -180 &&
    odp.lng <= 180;
  const safeLat = hasSafeCoords ? odp.lat : 0;
  const safeLng = hasSafeCoords ? odp.lng : 0;
  const googleSearchUrl = `https://www.google.com/maps/search/?api=1&query=${safeLat},${safeLng}`;
  const googleDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${safeLat},${safeLng}`;
  const googleEmbedUrl = `https://maps.google.com/maps?q=${safeLat},${safeLng}&z=17&output=embed`;

  return (
    <aside className="maps-inspector" aria-label={`Detail ODP ${odp.name}`}>
      <header className="maps-inspector-header">
        <span className={`maps-status-pill ${statusMeta.cls}`}>
          <i
            className={`maps-dot ${
              odp.radarStatus === 'ABNORMAL'
                ? 'maps-dot--abnormal'
                : odp.radarStatus === 'NORMAL'
                  ? 'maps-dot--normal'
                  : 'maps-dot--unmeasured'
            }`}
          />
          <span>{statusMeta.label}</span>
        </span>
        <h2 className="maps-inspector-title">{odp.name}</h2>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <code style={{ fontWeight: 600 }}>{odp.splitterCode}</code>
          <span>·</span>
          <span>{odp.clusterName} ({odp.clusterCode})</span>
        </div>
        <div style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-muted)' }}>
          {odp.lat.toFixed(6)}, {odp.lng.toFixed(6)}
        </div>
      </header>

      {odp.radarStatus === 'ABNORMAL' && odp.anomalyReasons.length > 0 && (
        <div className="maps-anomaly-box" role="alert">
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="alert" size={14} />
            <span>Alasan Status Tidak Normal</span>
          </div>
          {odp.anomalyReasons.map((reason, idx) => (
            <div key={idx}>• {reason}</div>
          ))}
        </div>
      )}

      {/* Telemetry Summary */}
      <div className="maps-metrics-strip">
        <div className="maps-metric-cell">
          <span className="maps-metric-label">Terburuk</span>
          <span
            className="maps-metric-val"
            style={{
              color:
                odp.worstAttenuation !== null && isAttenuationBad(odp.worstAttenuation)
                  ? '#dc2626'
                  : undefined,
            }}
          >
            {odp.worstAttenuation !== null ? `${odp.worstAttenuation.toFixed(1)} dB` : '-'}
          </span>
        </div>
        <div className="maps-metric-cell">
          <span className="maps-metric-label">Rata-rata</span>
          <span className="maps-metric-val">
            {odp.avgAttenuation !== null ? `${odp.avgAttenuation.toFixed(1)} dB` : '-'}
          </span>
        </div>
        <div className="maps-metric-cell">
          <span className="maps-metric-label">Port Terisi</span>
          <span className="maps-metric-val">
            {odp.usedPorts}/{odp.maxPorts}
          </span>
        </div>
      </div>

      {/* Google Maps Direct Actions */}
      <div className="maps-gmaps-actions">
        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button primary"
          style={{ flex: '1 1 140px', justifyContent: 'center' }}
        >
          <Icon name="externalLink" size={13} />
          <span>Buka Google Maps</span>
        </a>
        <a
          href={googleDirUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button secondary"
          style={{ flex: '1 1 120px', justifyContent: 'center' }}
        >
          <Icon name="navigation" size={13} />
          <span>Rute GMaps</span>
        </a>
        <button
          type="button"
          className="button secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => setShowGoogleEmbed((prev) => !prev)}
        >
          <Icon name="map" size={13} />
          <span>
            {showGoogleEmbed ? 'Sembunyikan Pratinjau Google Maps' : 'Pratinjau Lokasi di Google Maps'}
          </span>
        </button>
      </div>

      {showGoogleEmbed && hasSafeCoords && (
        <iframe
          title={`Pratinjau Google Maps untuk ${odp.name}`}
          src={googleEmbedUrl}
          className="maps-gmaps-embed-frame"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}

      {/* Attached Customers List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>
            Pelanggan Terhubung ({odp.customers.length})
          </span>
          <Link
            href={`/network?odp=${encodeURIComponent(odp.splitterCode)}`}
            style={{ fontSize: '11.5px', fontWeight: 600, color: '#0e5b92', textDecoration: 'none' }}
          >
            Buka Master ODP →
          </Link>
        </div>

        {odp.customers.length === 0 ? (
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Belum ada pelanggan aktif terpetakan pada ODP ini.
          </p>
        ) : (
          <div className="maps-customer-list">
            {odp.customers.map((c) => {
              const effDbm = c.ontAttenuation ?? c.currentAttenuation ?? c.oltAttenuation;
              const isBad = isAttenuationBad(effDbm);
              const isHighlighted =
                highlightedSia && c.siaNumber.toLowerCase() === highlightedSia.toLowerCase();

              return (
                <Link
                  key={c.id}
                  href={`/customers/${encodeURIComponent(c.siaNumber)}`}
                  className={`maps-customer-row ${isBad ? 'is-bad' : ''}`}
                  style={isHighlighted ? { outline: '2px solid #0e5b92' } : undefined}
                >
                  {c.photoUrl ? (
                    <img
                      src={c.photoUrl}
                      alt={`Lokasi ${c.fullName}`}
                      className="maps-customer-thumb"
                    />
                  ) : (
                    <div className="maps-customer-thumb-fallback" aria-hidden="true">
                      <Icon name="building" size={18} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.fullName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <code>{c.siaNumber}</code>
                      <span>· Port #{c.portNumber ?? '-'}</span>
                      {c.picName && <span>· PIC: {c.picName}</span>}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>
                      <span style={{ color: isBad ? '#dc2626' : effDbm !== null ? '#16a34a' : '#64748b' }}>
                        {effDbm !== null
                          ? `${effDbm.toFixed(1)} dB (${isBad ? 'Jelek > 28 dB' : 'Bagus ≤ 28 dB'})`
                          : 'Belum diukur'}
                      </span>
                      {c.openTicketNumber && (
                        <span style={{ marginLeft: '6px', color: '#dc2626' }}>
                          · TC: {c.openTicketNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  <Icon name="chevronRight" size={14} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
