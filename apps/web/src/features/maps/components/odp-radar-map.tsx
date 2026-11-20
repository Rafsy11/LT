'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { isAttenuationBad, type OdpMapRadarItem } from '@repo/shared';
import type { MapLayerStyle } from '../hooks/use-odp-maps';

interface OdpRadarMapProps {
  items: OdpMapRadarItem[];
  selectedOdp: OdpMapRadarItem | null;
  onSelectOdp: (id: string) => void;
  mapLayer: MapLayerStyle;
  showCustomerLinks: boolean;
}

const DEFAULT_CENTER: [number, number] = [-2.976074, 104.756554]; // Palembang
const DEFAULT_ZOOM = 13;
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

declare global {
  interface Window {
    google?: {
      maps?: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMapInstance;
        Marker: new (opts: Record<string, unknown>) => GoogleOverlay;
        Circle: new (opts: Record<string, unknown>) => GoogleOverlay;
        Polyline: new (opts: Record<string, unknown>) => GoogleOverlay;
        LatLngBounds: new () => {
          extend: (pos: { lat: number; lng: number }) => void;
        };
        SymbolPath: { CIRCLE: unknown };
      };
    };
  }
}

interface GoogleOverlay {
  setMap: (map: GoogleMapInstance | null) => void;
  addListener?: (event: string, fn: () => void) => void;
}

interface GoogleMapInstance {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  setMapTypeId: (typeId: string) => void;
  fitBounds: (bounds: unknown, pad?: number) => void;
}

function loadGoogleMapsScript(apiKey: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.maps) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.getElementById('fiberops-gmaps-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.maps)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'fiberops-gmaps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.google?.maps));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function hasValidCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lng) > 0.001 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Dual-Engine Interactive ODP Radar Map:
 * - Uses native Google Maps JavaScript SDK when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured.
 * - Automatically falls back to Leaflet Interactive Radar Canvas (Street + Satellite imagery)
 *   with zero billing watermark and direct Google Maps integration links.
 */
export function OdpRadarMap({
  items,
  selectedOdp,
  onSelectOdp,
  mapLayer,
  showCustomerLinks,
}: OdpRadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engineMode, setEngineMode] = useState<'google' | 'leaflet'>(
    GOOGLE_MAPS_API_KEY ? 'google' : 'leaflet',
  );

  // Refs for Leaflet instance and layers
  const leafletMapRef = useRef<import('leaflet').Map | null>(null);
  const leafletTileRef = useRef<import('leaflet').TileLayer | null>(null);
  const leafletMarkersRef = useRef<import('leaflet').LayerGroup | null>(null);
  const leafletLinksRef = useRef<import('leaflet').LayerGroup | null>(null);

  // Refs for Google Maps instance and overlays
  const gmapRef = useRef<GoogleMapInstance | null>(null);
  const gmapOverlaysRef = useRef<GoogleOverlay[]>([]);

  const validItems = items.filter((item) => hasValidCoords(item.lat, item.lng));

  // Initialize Google Maps when API Key is provided; degrade cleanly to Leaflet on load error
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setEngineMode('leaflet');
      return;
    }

    let cancelled = false;
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then((loaded) => {
      if (cancelled) return;
      if (!loaded || !window.google?.maps || !containerRef.current) {
        setEngineMode('leaflet');
        return;
      }
      setEngineMode('google');
      if (!gmapRef.current) {
        gmapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
          zoom: DEFAULT_ZOOM,
          mapTypeId: mapLayer === 'satellite' ? 'hybrid' : 'roadmap',
          streetViewControl: true,
          fullscreenControl: true,
          mapTypeControl: false,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapLayer]);

  // Render overlays on Google Maps Engine
  useEffect(() => {
    if (engineMode !== 'google' || !gmapRef.current || !window.google?.maps) return;
    const gmaps = window.google.maps;
    const map = gmapRef.current;

    map.setMapTypeId(mapLayer === 'satellite' ? 'hybrid' : 'roadmap');

    for (const overlay of gmapOverlaysRef.current) {
      overlay.setMap(null);
    }
    gmapOverlaysRef.current = [];

    for (const item of validItems) {
      const isSelected = selectedOdp?.id === item.id;
      const color =
        item.radarStatus === 'ABNORMAL'
          ? '#dc2626'
          : item.radarStatus === 'NORMAL'
            ? '#16a34a'
            : '#64748b';

      if (item.radarStatus !== 'UNMEASURED') {
        const ring = new gmaps.Circle({
          map,
          center: { lat: item.lat, lng: item.lng },
          radius: item.radarStatus === 'ABNORMAL' ? 140 : 85,
          fillColor: color,
          fillOpacity: item.radarStatus === 'ABNORMAL' ? 0.22 : 0.14,
          strokeColor: color,
          strokeOpacity: item.radarStatus === 'ABNORMAL' ? 0.85 : 0.5,
          strokeWeight: item.radarStatus === 'ABNORMAL' ? 2 : 1,
          clickable: false,
        });
        gmapOverlaysRef.current.push(ring);
      }

      const marker = new gmaps.Marker({
        map,
        position: { lat: item.lat, lng: item.lng },
        title: `${item.name} (${item.splitterCode})`,
        icon: {
          path: gmaps.SymbolPath.CIRCLE,
          scale: isSelected ? 10 : 7,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: isSelected ? '#0e5b92' : '#ffffff',
          strokeWeight: isSelected ? 3 : 2,
        },
      });
      marker.addListener?.('click', () => onSelectOdp(item.id));
      gmapOverlaysRef.current.push(marker);
    }

    if (showCustomerLinks && selectedOdp && hasValidCoords(selectedOdp.lat, selectedOdp.lng)) {
      for (const cust of selectedOdp.customers) {
        if (cust.lat === null || cust.lng === null || !hasValidCoords(cust.lat, cust.lng)) {
          continue;
        }
        const bad = isAttenuationBad(cust.ontAttenuation ?? cust.currentAttenuation);
        const line = new gmaps.Polyline({
          map,
          path: [
            { lat: selectedOdp.lat, lng: selectedOdp.lng },
            { lat: cust.lat, lng: cust.lng },
          ],
          strokeColor: bad ? '#dc2626' : '#0e5b92',
          strokeOpacity: 0.75,
          strokeWeight: 2,
        });
        const custPin = new gmaps.Marker({
          map,
          position: { lat: cust.lat, lng: cust.lng },
          title: `${cust.fullName} (SIA ${cust.siaNumber})`,
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: bad ? '#dc2626' : '#0e5b92',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          },
        });
        gmapOverlaysRef.current.push(line, custPin);
      }
      map.setCenter({ lat: selectedOdp.lat, lng: selectedOdp.lng });
    }
  }, [engineMode, validItems, selectedOdp, mapLayer, showCustomerLinks, onSelectOdp]);

  // Initialize & render Leaflet Fallback Interactive Radar Map
  useEffect(() => {
    if (engineMode !== 'leaflet' || !containerRef.current) return;
    let cancelled = false;

    const renderLeaflet = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      if (!leafletMapRef.current) {
        const map = L.map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          zoomControl: true,
        });
        leafletMapRef.current = map;
        leafletMarkersRef.current = L.layerGroup().addTo(map);
        leafletLinksRef.current = L.layerGroup().addTo(map);
      }

      const map = leafletMapRef.current;

      if (leafletTileRef.current) {
        map.removeLayer(leafletTileRef.current);
      }

      const tileUrl =
        mapLayer === 'satellite'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const attribution =
        mapLayer === 'satellite'
          ? 'Tiles &copy; Esri &mdash; Imagery'
          : '&copy; OpenStreetMap contributors';

      leafletTileRef.current = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution,
      }).addTo(map);

      const markersLayer = leafletMarkersRef.current;
      const linksLayer = leafletLinksRef.current;
      if (!markersLayer || !linksLayer) return;

      markersLayer.clearLayers();
      linksLayer.clearLayers();

      for (const item of validItems) {
        const isSelected = selectedOdp?.id === item.id;
        const statusClass =
          item.radarStatus === 'ABNORMAL'
            ? 'odp-radar-marker--abnormal'
            : item.radarStatus === 'NORMAL'
              ? 'odp-radar-marker--normal'
              : 'odp-radar-marker--unmeasured';

        const icon = L.divIcon({
          className: 'odp-radar-icon-wrap',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          html: `<div class="odp-radar-marker ${statusClass} ${isSelected ? 'odp-radar-marker--selected' : ''}"><span class="odp-radar-ring"></span><span class="odp-radar-core"></span></div>`,
        });

        const statusText =
          item.radarStatus === 'ABNORMAL'
            ? 'Tidak Normal (> 28 dB / Gangguan)'
            : item.radarStatus === 'NORMAL'
              ? 'Normal (<= 28 dB)'
              : 'Belum Diukur';

        const marker = L.marker([item.lat, item.lng], {
          icon,
          zIndexOffset: isSelected ? 1000 : item.radarStatus === 'ABNORMAL' ? 500 : 100,
        });
        marker.bindTooltip(
          `<strong>${item.name}</strong><br/>${item.splitterCode} · ${statusText}${
            item.worstAttenuation !== null ? `<br/>Redaman terburuk: ${item.worstAttenuation.toFixed(1)} dBm` : ''
          }`,
          { direction: 'top', offset: [0, -10] },
        );
        marker.on('click', () => onSelectOdp(item.id));
        marker.addTo(markersLayer);
      }

      if (showCustomerLinks && selectedOdp && hasValidCoords(selectedOdp.lat, selectedOdp.lng)) {
        for (const cust of selectedOdp.customers) {
          if (cust.lat === null || cust.lng === null || !hasValidCoords(cust.lat, cust.lng)) {
            continue;
          }
          const bad = isAttenuationBad(cust.ontAttenuation ?? cust.currentAttenuation);
          L.polyline(
            [
              [selectedOdp.lat, selectedOdp.lng],
              [cust.lat, cust.lng],
            ],
            {
              color: bad ? '#dc2626' : '#0e5b92',
              weight: 2,
              opacity: 0.8,
              dashArray: '5, 5',
            },
          ).addTo(linksLayer);

          const custIcon = L.divIcon({
            className: 'odp-radar-icon-wrap',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            html: `<div class="odp-customer-pin ${bad ? 'is-bad' : ''}"></div>`,
          });

          const custMarker = L.marker([cust.lat, cust.lng], { icon: custIcon });
          custMarker.bindTooltip(
            `<strong>${cust.fullName}</strong><br/>SIA: ${cust.siaNumber}${
              cust.ontAttenuation !== null
                ? `<br/>ONT: ${cust.ontAttenuation.toFixed(1)} dB`
                : ''
            }`,
            { direction: 'top', offset: [0, -6] },
          );
          custMarker.addTo(linksLayer);
        }

        map.flyTo([selectedOdp.lat, selectedOdp.lng], Math.max(map.getZoom(), 15), {
          duration: 0.45,
        });
      }
    };

    void renderLeaflet();

    return () => {
      cancelled = true;
    };
  }, [engineMode, validItems, selectedOdp, mapLayer, showCustomerLinks, onSelectOdp]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="maps-canvas-shell" aria-label="Peta Radar Titik Datek ODP">
      <div className="maps-overlay-engine-badge">
        <span>
          {engineMode === 'google'
            ? 'Google Maps Live Engine'
            : 'Radar GIS + Integrasi Google Maps'}
        </span>
      </div>

      <div ref={containerRef} className="maps-canvas-mount" />

      <div className="maps-overlay-legend" role="note" aria-label="Legenda Radar ODP">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <i className="maps-dot maps-dot--normal" />
          Normal (≤ 28 dB)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <i className="maps-dot maps-dot--abnormal" />
          Tidak Normal (&gt; 28 dB / Gangguan)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <i className="maps-dot maps-dot--unmeasured" />
          Belum Diukur
        </span>
      </div>
    </div>
  );
}
