'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ClusterListItem, ClusterOptionItem } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';

export interface OverviewNetworkMapProps {
  clusters: ClusterListItem[];
  clusterOptions?: ClusterOptionItem[];
  selectedCluster?: string;
  isLoading?: boolean;
}

type NodeStatus = 'normal' | 'warning' | 'critical';

interface ProjectedNode {
  id: string;
  label: string;
  locationName?: string;
  clusterName: string;
  clusterCode: string;
  usedPorts: number;
  maxPorts: number;
  x: number;
  y: number;
  status: NodeStatus;
}

interface ProjectedClusterLabel {
  key: string;
  name: string;
  code: string;
  x: number;
  y: number;
  radius: number;
}

const SVG_WIDTH = 800;
const SVG_HEIGHT = 300;
const MAP_PAD_X = 88;
const MAP_PAD_Y = 56;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.4;

const SUMSEL_BOUNDS = {
  MIN_LAT: -4.0,
  MAX_LAT: -2.0,
  MIN_LNG: 103.5,
  MAX_LNG: 106.0,
};
const MIN_LAT_SPAN = 0.06;
const MIN_LNG_SPAN = 0.08;

function resolveNodeStatus(item: ClusterListItem): NodeStatus {
  const ports = Array.isArray(item.ports) ? item.ports : [];
  const hasCriticalAttenuation = ports.some(
    (p) => typeof p.attenuation === 'number' && p.attenuation < -25,
  );
  if (hasCriticalAttenuation || (item.maxPorts > 0 && item.usedPorts >= item.maxPorts)) {
    return 'critical';
  }

  const hasWarningAttenuation = ports.some(
    (p) => typeof p.attenuation === 'number' && p.attenuation < -22,
  );
  const utilization = item.maxPorts > 0 ? item.usedPorts / item.maxPorts : 0;
  if (hasWarningAttenuation || utilization >= 0.75) {
    return 'warning';
  }

  return 'normal';
}

export function OverviewNetworkMap({
  clusters,
  clusterOptions = [],
  selectedCluster = 'Semua cluster',
  isLoading = false,
}: OverviewNetworkMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(
    null,
  );

  const { nodes, clusterZones, clusterCount } = useMemo(() => {
    const filterActive = selectedCluster && selectedCluster !== 'Semua cluster';

    const scopedSplitters = (clusters || []).filter((item) => {
      if (!filterActive) return true;
      return item.name === selectedCluster || item.clusterCode === selectedCluster;
    });

    const rawPoints: Array<{
      id: string;
      label: string;
      locationName?: string;
      clusterName: string;
      clusterCode: string;
      usedPorts: number;
      maxPorts: number;
      lat: number;
      lng: number;
      status: NodeStatus;
    }> =
      scopedSplitters.length > 0
        ? scopedSplitters
            .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
            .map((s) => ({
              id: s.id,
              label: s.splitterCode,
              locationName: s.locationName,
              clusterName: s.name,
              clusterCode: s.clusterCode,
              usedPorts: s.usedPorts,
              maxPorts: s.maxPorts,
              lat: s.lat,
              lng: s.lng,
              status: resolveNodeStatus(s),
            }))
        : (clusterOptions || [])
            .filter((opt) => {
              if (!filterActive) return true;
              return opt.name === selectedCluster || opt.clusterCode === selectedCluster;
            })
            .filter((opt) => Number.isFinite(opt.centerLat) && Number.isFinite(opt.centerLng))
            .map((opt) => ({
              id: opt.id,
              label: `${opt.clusterCode} (${opt.splittersCount} ODP)`,
              locationName: undefined,
              clusterName: opt.name,
              clusterCode: opt.clusterCode,
              usedPorts: 0,
              maxPorts: 0,
              lat: opt.centerLat,
              lng: opt.centerLng,
              status: 'normal' as NodeStatus,
            }));

    const filteredPoints = rawPoints.filter(
      (p) =>
        p.lat >= SUMSEL_BOUNDS.MIN_LAT &&
        p.lat <= SUMSEL_BOUNDS.MAX_LAT &&
        p.lng >= SUMSEL_BOUNDS.MIN_LNG &&
        p.lng <= SUMSEL_BOUNDS.MAX_LNG,
    );

    if (filteredPoints.length === 0) {
      return {
        nodes: [] as ProjectedNode[],
        clusterZones: [] as ProjectedClusterLabel[],
        clusterCount: 0,
      };
    }

    const lats = filteredPoints.map((p) => p.lat);
    const lngs = filteredPoints.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(MIN_LAT_SPAN, maxLat - minLat);
    const lngSpan = Math.max(MIN_LNG_SPAN, maxLng - minLng);

    const innerW = SVG_WIDTH - MAP_PAD_X * 2;
    const innerH = SVG_HEIGHT - MAP_PAD_Y * 2;

    const coordCounts = new Map<string, number>();

    const projectedNodes: ProjectedNode[] = filteredPoints.map((pt) => {
      const coordKey = `${pt.lat.toFixed(4)}:${pt.lng.toFixed(4)}`;
      const dupIndex = coordCounts.get(coordKey) ?? 0;
      coordCounts.set(coordKey, dupIndex + 1);

      const baseX =
        lngSpan > 0.0001
          ? MAP_PAD_X + ((pt.lng - minLng) / lngSpan) * innerW
          : SVG_WIDTH / 2;
      const baseY =
        latSpan > 0.0001
          ? MAP_PAD_Y + (1 - (pt.lat - minLat) / latSpan) * innerH
          : SVG_HEIGHT / 2;

      const angle = dupIndex * 2.1;
      const jitterR = dupIndex === 0 ? 0 : Math.min(28, 12 + dupIndex * 4);
      const x = Math.round((baseX + Math.cos(angle) * jitterR) * 10) / 10;
      const y = Math.round((baseY + Math.sin(angle) * jitterR) * 10) / 10;

      return {
        id: pt.id,
        label: pt.label,
        locationName: pt.locationName,
        clusterName: pt.clusterName,
        clusterCode: pt.clusterCode,
        usedPorts: pt.usedPorts,
        maxPorts: pt.maxPorts,
        x,
        y,
        status: pt.status,
      };
    });

    const groupedByCluster = new Map<string, ProjectedNode[]>();
    for (const node of projectedNodes) {
      const existing = groupedByCluster.get(node.clusterCode) ?? [];
      existing.push(node);
      groupedByCluster.set(node.clusterCode, existing);
    }

    const zones: ProjectedClusterLabel[] = [];
    groupedByCluster.forEach((group, code) => {
      const avgX = group.reduce((sum, n) => sum + n.x, 0) / group.length;
      const avgY = group.reduce((sum, n) => sum + n.y, 0) / group.length;
      const maxDist = group.reduce(
        (max, n) => Math.max(max, Math.hypot(n.x - avgX, n.y - avgY)),
        0,
      );
      zones.push({
        key: code,
        name: group[0].clusterName,
        code,
        x: Math.round(avgX * 10) / 10,
        y: Math.round(avgY * 10) / 10,
        radius: Math.max(38, Math.min(95, Math.round(maxDist + 26))),
      });
    });

    return {
      nodes: projectedNodes,
      clusterZones: zones,
      clusterCount: groupedByCluster.size,
    };
  }, [clusters, clusterOptions, selectedCluster]);

  const activeHoveredNode = useMemo(
    () => nodes.find((n) => n.id === hoveredNodeId) || null,
    [nodes, hoveredNodeId],
  );

  const spinePath = useMemo(() => {
    if (clusterZones.length < 2) return '';
    const ordered = [...clusterZones].sort((a, b) => a.x - b.x);
    return ordered
      .map((zone, index) => `${index === 0 ? 'M' : 'L'} ${zone.x} ${zone.y}`)
      .join(' ');
  }, [clusterZones]);

  const handleZoomIn = () => {
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2)));
      if (next <= MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleResetView = () => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zoom <= MIN_ZOOM) return;
    dragOriginRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = (e.clientX - origin.x) / zoom;
    const dy = (e.clientY - origin.y) / zoom;
    setPan({
      x: Math.max(-220, Math.min(220, origin.startPanX + dx)),
      y: Math.max(-110, Math.min(110, origin.startPanY + dy)),
    });
  };

  const handlePointerUp = () => {
    dragOriginRef.current = null;
  };

  return (
    <section className="panel overview-map-panel" aria-label="Peta Sebaran Jaringan FTTH">
      <div className="panel-inner">
        <header className="panel-heading">
          <div>
            <h2>Sebaran Jaringan</h2>
            <p>Visibilitas cluster &amp; titik ODP langsung dari PostgreSQL</p>
          </div>
          <Link href="/network" className="link-arrow">
            <span>Lihat jaringan</span>
          </Link>
        </header>

        <figure className="clean-map-container">
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            className="clean-map-svg"
            style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
            role="img"
            aria-label="Topologi cluster fiber dan titik ODP terpasang berdasarkan data PostgreSQL"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <pattern id="cleanGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  className="map-grid-line"
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="#e8f2f8"
                  strokeWidth="0.8"
                  opacity="0.85"
                />
              </pattern>
            </defs>

            {/* Base Surface */}
            <rect className="map-base-rect" width={SVG_WIDTH} height={SVG_HEIGHT} fill="#f7fafd" />
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#cleanGrid)" />

            <g
              transform={`translate(${SVG_WIDTH / 2 + pan.x}, ${SVG_HEIGHT / 2 + pan.y}) scale(${zoom}) translate(${-SVG_WIDTH / 2}, ${-SVG_HEIGHT / 2})`}
            >
              {/* Dynamic Trunk Spine between Cluster Hubs */}
              {spinePath && (
                <>
                  <path
                    className="map-river-bg"
                    d={spinePath}
                    fill="none"
                    stroke="#e0edf7"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    className="map-river-fg"
                    d={spinePath}
                    fill="none"
                    stroke="#bfdaf0"
                    strokeWidth="2.5"
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Cluster Halos projected from live coordinates */}
              {clusterZones.map((zone) => (
                <g key={zone.key}>
                  <circle
                    className="map-zone-poly"
                    cx={zone.x}
                    cy={zone.y}
                    r={zone.radius}
                    fill="#1b5ca2"
                    fillOpacity="0.06"
                    stroke="#1b5ca2"
                    strokeWidth="1.25"
                    strokeDasharray="5 4"
                  />
                  <text
                    className="map-label-sub"
                    x={zone.x}
                    y={Math.max(22, zone.y - zone.radius - 6)}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight="700"
                    fontFamily="var(--font-sans)"
                    fill="#334155"
                  >
                    {zone.name}
                  </text>
                </g>
              ))}

              {/* Real ODP / Cluster Nodes */}
              {nodes.map((node) => {
                const isCrit = node.status === 'critical';
                const isWarn = node.status === 'warning';
                const isHovered = hoveredNodeId === node.id;
                const fillDot = isCrit ? '#dc2626' : isWarn ? '#d97706' : '#16a34a';
                const halo = isCrit ? '#fee2e2' : isWarn ? '#fef3c7' : '#dcfce7';
                const portSummary =
                  node.maxPorts > 0 ? ` · ${node.usedPorts}/${node.maxPorts} port` : '';

                return (
                  <g
                    key={node.id}
                    className="map-node-group"
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId((prev) => (prev === node.id ? null : prev))}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`${node.label}${node.locationName ? ` · ${node.locationName}` : ''} (${node.clusterName})${portSummary}`}</title>
                    <circle
                      className="map-node-halo"
                      cx={node.x}
                      cy={node.y}
                      r={isHovered ? 11 : isCrit ? 8.5 : 6.5}
                      fill={halo}
                    />
                    <circle
                      className="map-node-dot"
                      cx={node.x}
                      cy={node.y}
                      r={isHovered ? 4.8 : 3.4}
                      fill={fillDot}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}

              {nodes.length === 0 && (
                <text
                  className="map-label-sub"
                  x={SVG_WIDTH / 2}
                  y={SVG_HEIGHT / 2}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="600"
                  fill="#64748b"
                >
                  {isLoading
                    ? 'Memuat koordinat topologi cluster & ODP...'
                    : 'Belum ada titik ODP terdaftar untuk cakupan filter ini.'}
                </text>
              )}
            </g>
          </svg>

          {/* Floating HUD Top Pill */}
          <div className="map-hud-top">
            <span className="map-hud-pill">
              <span className="status-dot green" aria-hidden="true" />
              <b>{clusterCount} cluster aktif</b>
              <span className="sep" aria-hidden="true">·</span>
              <span>{nodes.length} titik ODP</span>
              {zoom > 1 && (
                <>
                  <span className="sep" aria-hidden="true">·</span>
                  <span>{Math.round(zoom * 100)}%</span>
                </>
              )}
            </span>
          </div>

          {/* Floating Zoom Controls */}
          <nav className="map-zoom-controls" aria-label="Kontrol Zoom Peta">
            <button
              type="button"
              className="map-zoom-btn"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Perbesar peta"
            >
              +
            </button>
            <button
              type="button"
              className="map-zoom-btn"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Perkecil peta"
            >
              −
            </button>
            <button
              type="button"
              className="map-zoom-btn compass"
              onClick={handleResetView}
              disabled={zoom === MIN_ZOOM && pan.x === 0 && pan.y === 0}
              aria-label="Reset zoom dan posisi peta"
              title="Reset posisi peta"
            >
              <Icon name="compass" size={13} />
            </button>
          </nav>

          <figcaption className="map-hud-bottom">
            <div className="map-legend-pills">
              <span className="legend-item">
                <i className="legend-dot green-bg" aria-hidden="true" /> Normal
              </span>
              <span className="legend-item">
                <i className="legend-dot amber-bg" aria-hidden="true" /> Warning
              </span>
              <span className="legend-item">
                <i className="legend-dot red-bg" aria-hidden="true" /> Critical
              </span>
              {activeHoveredNode && (
                <span className="legend-item legend-active-node">
                  {activeHoveredNode.label} ({activeHoveredNode.clusterName})
                  {activeHoveredNode.maxPorts > 0
                    ? ` · ${activeHoveredNode.usedPorts}/${activeHoveredNode.maxPorts} port`
                    : ''}
                </span>
              )}
            </div>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
