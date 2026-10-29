import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function OverviewNetworkMap() {
  return (
    <section className="panel overview-map-panel" aria-label="Peta Sebaran Jaringan FTTH">
      <div className="panel-inner">
        <div className="panel-heading">
          <div>
            <h2>Sebaran Jaringan</h2>
            <p>Visibilitas seluruh cluster dan titik ODP</p>
          </div>
          <Link href="/network" className="link-arrow">
            <span>Lihat jaringan</span>
          </Link>
        </div>

        <div className="clean-map-container">
          <svg
            viewBox="0 0 800 300"
            preserveAspectRatio="xMidYMid slice"
            className="clean-map-svg"
            role="img"
            aria-label="Peta topologi cluster fiber dan sebaran ODP Kota Bandung"
          >
            <defs>
              <pattern id="cleanGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e8f2f8" strokeWidth="0.8" opacity="0.8" />
              </pattern>
            </defs>

            {/* Base Surface */}
            <rect width="800" height="300" fill="#f7fafd" />
            <rect width="800" height="300" fill="url(#cleanGrid)" />

            {/* River / Fiber Spine Arterial Trace */}
            <path
              d="M80 0Q150 80 310 100T440 210T780 300"
              fill="none"
              stroke="#e0edf7"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M80 0Q150 80 310 100T440 210T780 300"
              fill="none"
              stroke="#bfdaf0"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Road Network Grid Lines */}
            <path
              d="M0 230 800 60 M270 0 500 300 M0 80 800 190"
              stroke="#ffffff"
              strokeWidth="8"
            />
            <path
              d="M0 230 800 60 M270 0 500 300 M0 80 800 190"
              stroke="#e5eef5"
              strokeWidth="2.5"
            />

            {/* Cluster Zones with Lintasarta Blue Polygons */}
            <polygon
              points="140,45 285,35 330,130 220,190 120,140"
              fill="#1b5ca2"
              fillOpacity="0.06"
              stroke="#1b5ca2"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <polygon
              points="440,65 640,80 695,200 550,230 425,165"
              fill="#1b5ca2"
              fillOpacity="0.06"
              stroke="#1b5ca2"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />

            {/* ODP Distribution Nodes */}
            {[
              { x: 200, y: 80, status: 'normal' },
              { x: 270, y: 130, status: 'normal' },
              { x: 170, y: 150, status: 'normal' },
              { x: 490, y: 110, status: 'normal' },
              { x: 580, y: 160, status: 'critical' },
              { x: 630, y: 120, status: 'warning' },
              { x: 365, y: 225, status: 'normal' },
              { x: 430, y: 190, status: 'normal' },
              { x: 550, y: 250, status: 'normal' },
            ].map((node, i) => {
              const isCrit = node.status === 'critical';
              const isWarn = node.status === 'warning';
              const fillDot = isCrit ? '#dc2626' : isWarn ? '#f59e0b' : '#16a34a';
              const halo = isCrit ? '#fee2e2' : isWarn ? '#fef3c7' : '#dcfce7';

              return (
                <g key={i}>
                  <circle cx={node.x} cy={node.y} r={isCrit ? '12' : '9'} fill={halo} />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="4"
                    fill={fillDot}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}

            {/* Topographic Typography matching image.png */}
            <g fill="#475569" fontSize="13" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
              <text x="330" y="38" fill="#334155" fontWeight="600">Bandung Utara</text>
              <text x="305" y="152" fontSize="16" fontWeight="800" fill="#0f172a">Bandung</text>
              <text x="75" y="210" fill="#64748b" fontWeight="500">Sukajadi</text>
              <text x="560" y="240" fill="#64748b" fontWeight="500">Antapani</text>
            </g>
          </svg>

          {/* Floating HUD Badges */}
          <div className="map-hud-top">
            <span className="map-hud-pill">
              <span className="status-dot green" />
              <b>12 cluster aktif</b>
              <span className="sep">·</span>
              <span>64 titik ODP</span>
            </span>
          </div>

          {/* Floating Zoom Controls matching image.png */}
          <div className="map-zoom-controls">
            <button type="button" className="map-zoom-btn" aria-label="Zoom in">+</button>
            <button type="button" className="map-zoom-btn" aria-label="Zoom out">−</button>
            <button type="button" className="map-zoom-btn compass" aria-label="Reset arah">
              <Icon name="compass" size={13} />
            </button>
          </div>

          <div className="map-hud-bottom">
            <div className="map-legend-pills">
              <span className="legend-item"><i className="legend-dot green-bg" /> Normal</span>
              <span className="legend-item"><i className="legend-dot amber-bg" /> Warning</span>
              <span className="legend-item"><i className="legend-dot red-bg" /> Critical</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

