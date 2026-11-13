'use client';

import React, { useState, useEffect } from 'react';
import type {
  CreateClusterInput,
  CreateSplitterInput,
  UpdateSplitterInput,
} from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useToast } from '@/providers';

export type NetworkEntityModalMode = 'CREATE_CLUSTER' | 'CREATE_SPLITTER' | 'EDIT_SPLITTER';

export interface NetworkClusterOption {
  clusterCode: string;
  name: string;
}

export interface EditableSplitterTarget {
  splitterCode: string;
  clusterCode: string;
  name: string;
  maxPorts: number;
  lat: number;
  lng: number;
  isActive?: boolean;
}

export interface NetworkEntityModalProps {
  isOpen: boolean;
  mode: NetworkEntityModalMode;
  clusters: NetworkClusterOption[];
  initialSplitter?: EditableSplitterTarget | null;
  onClose: () => void;
  onCreateCluster: (data: CreateClusterInput) => Promise<void>;
  onCreateSplitter: (data: CreateSplitterInput) => Promise<void>;
  onUpdateSplitter: (data: UpdateSplitterInput) => Promise<void>;
}

export function NetworkEntityModal({
  isOpen,
  mode,
  clusters,
  initialSplitter,
  onClose,
  onCreateCluster,
  onCreateSplitter,
  onUpdateSplitter,
}: NetworkEntityModalProps) {
  const { showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Cluster fields
  const [clusterCode, setClusterCode] = useState('');
  const [clusterName, setClusterName] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');

  // Splitter fields
  const [selectedClusterCode, setSelectedClusterCode] = useState('');
  const [splitterCode, setSplitterCode] = useState('');
  const [maxPorts, setMaxPorts] = useState<8 | 16 | 32>(16);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'CREATE_CLUSTER') {
      setClusterCode('');
      setClusterName('');
      setCenterLat('');
      setCenterLng('');
    } else if (mode === 'CREATE_SPLITTER') {
      setSelectedClusterCode(
        initialSplitter?.clusterCode || clusters[0]?.clusterCode || '',
      );
      setSplitterCode('');
      setMaxPorts(16);
      setLat(initialSplitter?.lat !== undefined ? String(initialSplitter.lat) : '');
      setLng(initialSplitter?.lng !== undefined ? String(initialSplitter.lng) : '');
    } else if (mode === 'EDIT_SPLITTER' && initialSplitter) {
      setSelectedClusterCode(initialSplitter.clusterCode);
      setSplitterCode(initialSplitter.splitterCode);
      const validPorts =
        initialSplitter.maxPorts === 8 || initialSplitter.maxPorts === 32
          ? initialSplitter.maxPorts
          : 16;
      setMaxPorts(validPorts);
      setLat(String(initialSplitter.lat));
      setLng(String(initialSplitter.lng));
      setIsActive(initialSplitter.isActive ?? true);
    }
  }, [isOpen, mode, clusters, initialSplitter]);

  if (!isOpen) return null;

  const title =
    mode === 'CREATE_CLUSTER'
      ? 'Tambah Wilayah Cluster Baru'
      : mode === 'CREATE_SPLITTER'
        ? 'Tambah Optical Distribution Point (ODP)'
        : `Perbarui ODP ${initialSplitter?.splitterCode || ''}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      if (mode === 'CREATE_CLUSTER') {
        const parsedLat = Number.parseFloat(centerLat);
        const parsedLng = Number.parseFloat(centerLng);
        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
          throw new Error('Koordinat pusat cluster tidak valid.');
        }
        await onCreateCluster({
          clusterCode: clusterCode.trim().toUpperCase(),
          name: clusterName.trim(),
          centerLat: parsedLat,
          centerLng: parsedLng,
        });
      } else if (mode === 'CREATE_SPLITTER') {
        const parsedLat = Number.parseFloat(lat);
        const parsedLng = Number.parseFloat(lng);
        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
          throw new Error('Koordinat tiang ODP tidak valid.');
        }
        await onCreateSplitter({
          clusterCode: selectedClusterCode.trim().toUpperCase(),
          splitterCode: splitterCode.trim().toUpperCase(),
          maxPorts,
          lat: parsedLat,
          lng: parsedLng,
        });
      } else {
        const parsedLat = Number.parseFloat(lat);
        const parsedLng = Number.parseFloat(lng);
        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
          throw new Error('Koordinat tiang ODP tidak valid.');
        }
        await onUpdateSplitter({
          splitterCode: splitterCode.trim().toUpperCase(),
          maxPorts,
          lat: parsedLat,
          lng: parsedLng,
          isActive,
        });
      }
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal menyimpan master data jaringan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="network-entity-modal-title">
      <article
        className="modal"
        style={{ maxWidth: '520px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="modal-icon-wrap">
              <Icon name="network" size={18} />
            </div>
            <div>
              <h2 id="network-entity-modal-title" className="modal-heading">
                {title}
              </h2>
              <p className="modal-subheading">
                Master data topologi FTTH Bandung Raya
              </p>
            </div>
          </div>
          <button className="dots" type="button" onClick={onClose} aria-label="Tutup modal">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'CREATE_CLUSTER' ? (
              <>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label className="field">
                    <span>Kode Cluster</span>
                    <input
                      type="text"
                      required
                      placeholder="BDG-06"
                      value={clusterCode}
                      onChange={(e) => setClusterCode(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Nama Wilayah</span>
                    <input
                      type="text"
                      required
                      placeholder="Bandung Barat"
                      value={clusterName}
                      onChange={(e) => setClusterName(e.target.value)}
                    />
                  </label>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label className="field">
                    <span>Latitude Pusat</span>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="-6.917500"
                      required
                      value={centerLat}
                      onChange={(e) => setCenterLat(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Longitude Pusat</span>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="107.619100"
                      required
                      value={centerLng}
                      onChange={(e) => setCenterLng(e.target.value)}
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label className="field">
                    <span>Wilayah Cluster</span>
                    {mode === 'EDIT_SPLITTER' ? (
                      <input type="text" value={selectedClusterCode} disabled />
                    ) : clusters.length > 0 ? (
                      <select
                        value={selectedClusterCode}
                        onChange={(e) => setSelectedClusterCode(e.target.value)}
                        required
                      >
                        {clusters.map((c) => (
                          <option key={c.clusterCode} value={c.clusterCode}>
                            {c.name} ({c.clusterCode})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        placeholder="BDG-01"
                        value={selectedClusterCode}
                        onChange={(e) => setSelectedClusterCode(e.target.value)}
                      />
                    )}
                  </label>

                  <label className="field">
                    <span>Kode ODP Splitter</span>
                    <input
                      type="text"
                      required
                      placeholder="ODP-BDG-09"
                      value={splitterCode}
                      disabled={mode === 'EDIT_SPLITTER'}
                      onChange={(e) => setSplitterCode(e.target.value)}
                    />
                  </label>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <label className="field">
                    <span>Kapasitas Port</span>
                    <select
                      value={maxPorts}
                      onChange={(e) => setMaxPorts(Number(e.target.value) as 8 | 16 | 32)}
                    >
                      <option value={8}>8 Port</option>
                      <option value={16}>16 Port</option>
                      <option value={32}>32 Port</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Latitude Tiang</span>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="-6.917500"
                      required
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Longitude Tiang</span>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="107.619100"
                      required
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                    />
                  </label>
                </div>

                {mode === 'EDIT_SPLITTER' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span>ODP Aktif Beroperasi</span>
                  </label>
                )}
              </>
            )}
          </div>

          <footer className="modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : mode === 'EDIT_SPLITTER' ? 'Simpan Perubahan' : 'Tambahkan'}
            </button>
          </footer>
        </form>
      </article>
    </ModalOverlay>
  );
}
