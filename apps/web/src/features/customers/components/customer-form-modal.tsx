'use client';

import React, { useState, useEffect } from 'react';
import type { CreateCustomerInput } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/providers';

export interface CustomerFormModalProps {
  isOpen: boolean;
  clusterOptions: string[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

const DEFAULT_CLUSTER_CODES: Record<string, string> = {
  'Bandung Utara': 'BDG-01',
  'Bandung Tengah': 'BDG-02',
  'Bandung Selatan': 'BDG-03',
  'Bandung Timur': 'BDG-04',
  Cimahi: 'BDG-05',
};

function inferClusterCode(label: string): string {
  if (/^[A-Z0-9-]+$/.test(label.trim())) {
    return label.trim();
  }
  return DEFAULT_CLUSTER_CODES[label] || 'BDG-01';
}

export function CustomerFormModal({
  isOpen,
  clusterOptions,
  onClose,
  onCreated,
}: CustomerFormModalProps) {
  const { showSuccess, showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [siaNumber, setSiaNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [clusterCode, setClusterCode] = useState('BDG-01');
  const [splitterCode, setSplitterCode] = useState('');
  const [portNumber, setPortNumber] = useState('');
  const [status, setStatus] = useState<'PENDING_INSTALL' | 'ACTIVE'>('PENDING_INSTALL');

  useEffect(() => {
    if (!isOpen) return;
    setSiaNumber('');
    setFullName('');
    setAddress('');
    setClusterCode('BDG-01');
    setSplitterCode('');
    setPortNumber('');
    setStatus('PENDING_INSTALL');
  }, [isOpen]);

  if (!isOpen) return null;

  const selectableClusterCodes = Array.from(
    new Set([
      ...Object.values(DEFAULT_CLUSTER_CODES),
      ...clusterOptions
        .filter((c) => c !== 'Semua cluster')
        .map((c) => inferClusterCode(c)),
    ]),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const parsedPort = portNumber.trim() ? Number.parseInt(portNumber.trim(), 10) : undefined;
      if (parsedPort !== undefined && (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 32)) {
        throw new Error('Nomor port splitter harus antara 1 hingga 32.');
      }

      const payload: CreateCustomerInput = {
        siaNumber: siaNumber.trim().toUpperCase(),
        fullName: fullName.trim(),
        address: address.trim(),
        clusterCode: clusterCode.trim().toUpperCase(),
        status,
        ...(splitterCode.trim() ? { splitterCode: splitterCode.trim().toUpperCase() } : {}),
        ...(parsedPort !== undefined ? { portNumber: parsedPort } : {}),
      };

      const res = await fetch('/api/v1/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal mendaftarkan pelanggan baru');
      }

      showSuccess(`Pelanggan ${payload.fullName} (${payload.siaNumber}) berhasil didaftarkan.`);
      await onCreated();
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal mendaftarkan pelanggan baru');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      className="overlay"
      open
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-form-modal-title"
    >
      <article
        className="modal"
        style={{ maxWidth: '540px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="modal-icon-wrap">
              <Icon name="users" size={18} />
            </div>
            <div>
              <h2 id="customer-form-modal-title" className="modal-heading">
                Daftarkan Pelanggan FTTH Baru
              </h2>
              <p className="modal-subheading">
                Master data pelanggan SIA &amp; alokasi awal port ODP
              </p>
            </div>
          </div>
          <button className="dots" type="button" onClick={onClose} aria-label="Tutup modal">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="field">
                <span>Nomor SIA Pelanggan</span>
                <input
                  type="text"
                  required
                  placeholder="SIA-2026-0991"
                  value={siaNumber}
                  onChange={(e) => setSiaNumber(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Status Layanan Awal</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'PENDING_INSTALL' | 'ACTIVE')}
                >
                  <option value="PENDING_INSTALL">Pending Install (Siap PSB)</option>
                  <option value="ACTIVE">Aktif</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Nama Lengkap / Perusahaan</span>
              <input
                type="text"
                required
                placeholder="PT Mitra Nusantara Jaya"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Alamat Pemasangan</span>
              <input
                type="text"
                required
                placeholder="Jl. Dago Pakar Raya No. 18, Bandung"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <label className="field">
                <span>Kode Cluster</span>
                <select
                  value={clusterCode}
                  onChange={(e) => setClusterCode(e.target.value)}
                >
                  {selectableClusterCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Kode ODP (Opsional)</span>
                <input
                  type="text"
                  placeholder="ODP-BDG-01"
                  value={splitterCode}
                  onChange={(e) => setSplitterCode(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Port # (Opsional)</span>
                <input
                  type="number"
                  min={1}
                  max={32}
                  placeholder="1-32"
                  value={portNumber}
                  onChange={(e) => setPortNumber(e.target.value)}
                />
              </label>
            </div>
          </div>

          <footer className="modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Daftarkan Pelanggan'}
            </button>
          </footer>
        </form>
      </article>
    </dialog>
  );
}

