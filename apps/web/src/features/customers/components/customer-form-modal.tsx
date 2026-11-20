'use client';

import React, { useState, useEffect } from 'react';
import type { CreateCustomerInput } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { webApiClient } from '@/lib/api-client';
import { isAppError, normalizeAppError } from '@/lib/error-normalizer';
import { useToast } from '@/providers';

export interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

type CustomerFieldKey =
  | 'siaNumber'
  | 'fullName'
  | 'address'
  | 'clusterCode'
  | 'splitterCode'
  | 'portNumber';

export function CustomerFormModal({
  isOpen,
  onClose,
  onCreated,
}: CustomerFormModalProps) {
  const { showSuccess, showError } = useToast();
  const { clusters: dbClusters } = useClusterOptions();
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CustomerFieldKey, string>>>({});

  const [siaNumber, setSiaNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [clusterCode, setClusterCode] = useState('');
  const [splitterCode, setSplitterCode] = useState('');
  const [portNumber, setPortNumber] = useState('');
  const [status, setStatus] = useState<'PENDING_INSTALL' | 'ACTIVE'>('PENDING_INSTALL');

  useEffect(() => {
    if (!isOpen) return;
    setSiaNumber('');
    setFullName('');
    setAddress('');
    setClusterCode('');
    setSplitterCode('');
    setPortNumber('');
    setStatus('PENDING_INSTALL');
    setFieldErrors({});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || clusterCode || dbClusters.length === 0) return;
    setClusterCode(dbClusters[0].clusterCode);
  }, [isOpen, clusterCode, dbClusters]);

  if (!isOpen) return null;

  const clearField = (key: CustomerFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateFields = (): { valid: boolean; parsedPort?: number } => {
    const errors: Partial<Record<CustomerFieldKey, string>> = {};
    if (!siaNumber.trim()) {
      errors.siaNumber = 'Nomor SIA pelanggan perlu diisi.';
    } else if (siaNumber.trim().length < 4) {
      errors.siaNumber = 'Nomor SIA minimal 4 karakter (contoh: SIA-2026-0991).';
    }

    if (!fullName.trim()) {
      errors.fullName = 'Nama lengkap atau perusahaan perlu diisi.';
    }

    if (!address.trim()) {
      errors.address = 'Alamat pemasangan perlu diisi.';
    }

    if (!clusterCode.trim()) {
      errors.clusterCode = 'Pilih cluster wilayah terlebih dahulu.';
    }

    const parsedPort = portNumber.trim() ? Number.parseInt(portNumber.trim(), 10) : undefined;
    if (
      parsedPort !== undefined &&
      (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 32)
    ) {
      errors.portNumber = 'Nomor port harus di antara 1 hingga 32.';
    }

    setFieldErrors(errors);
    return { valid: Object.keys(errors).length === 0, parsedPort };
  };

  const submitCustomer = async () => {
    const { valid, parsedPort } = validateFields();
    if (!valid) return;

    try {
      setSubmitting(true);
      const payload: CreateCustomerInput = {
        siaNumber: siaNumber.trim().toUpperCase(),
        fullName: fullName.trim(),
        address: address.trim(),
        clusterCode: clusterCode.trim().toUpperCase(),
        status,
        ...(splitterCode.trim() ? { splitterCode: splitterCode.trim().toUpperCase() } : {}),
        ...(parsedPort !== undefined ? { portNumber: parsedPort } : {}),
      };

      const res = await webApiClient.post('/api/v1/admin/customers', payload);
      if (!res.success) {
        throw normalizeAppError(res.error, {
          fallbackMessage: 'Pelanggan baru belum dapat disimpan saat ini.',
        });
      }

      showSuccess(`Pelanggan ${payload.fullName} (${payload.siaNumber}) berhasil didaftarkan.`);
      await onCreated();
      onClose();
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, {
        fallbackMessage: 'Pelanggan baru belum dapat disimpan saat ini.',
      });
      if (isAppError(err) && err.fieldErrors) {
        setFieldErrors((prev) => ({
          ...prev,
          ...(err.fieldErrors as Partial<Record<CustomerFieldKey, string>>),
        }));
      }
      showError(normalized, {
        onRetry:
          normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
            ? () => void submitCustomer()
            : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCustomer();
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="customer-form-modal-title">
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

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="field">
                <span>Nomor SIA Pelanggan</span>
                <input
                  type="text"
                  required
                  aria-invalid={Boolean(fieldErrors.siaNumber)}
                  aria-describedby={fieldErrors.siaNumber ? 'cust-sia-err' : undefined}
                  className={fieldErrors.siaNumber ? 'ui-input-invalid' : ''}
                  placeholder="SIA-2026-0991"
                  value={siaNumber}
                  onChange={(e) => {
                    setSiaNumber(e.target.value);
                    clearField('siaNumber');
                  }}
                />
                <FieldError id="cust-sia-err" message={fieldErrors.siaNumber} />
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
                aria-invalid={Boolean(fieldErrors.fullName)}
                aria-describedby={fieldErrors.fullName ? 'cust-name-err' : undefined}
                className={fieldErrors.fullName ? 'ui-input-invalid' : ''}
                placeholder="PT Mitra Nusantara Jaya"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearField('fullName');
                }}
              />
              <FieldError id="cust-name-err" message={fieldErrors.fullName} />
            </label>

            <label className="field">
              <span>Alamat Pemasangan</span>
              <input
                type="text"
                required
                aria-invalid={Boolean(fieldErrors.address)}
                aria-describedby={fieldErrors.address ? 'cust-addr-err' : undefined}
                className={fieldErrors.address ? 'ui-input-invalid' : ''}
                placeholder="Jl. Angkatan 45 No. 12, Kec. Ilir Barat I, Palembang"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  clearField('address');
                }}
              />
              <FieldError id="cust-addr-err" message={fieldErrors.address} />
            </label>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <label className="field">
                <span>Kode Cluster</span>
                <select
                  value={clusterCode}
                  aria-invalid={Boolean(fieldErrors.clusterCode)}
                  aria-describedby={fieldErrors.clusterCode ? 'cust-cluster-err' : undefined}
                  className={fieldErrors.clusterCode ? 'ui-input-invalid' : ''}
                  onChange={(e) => {
                    setClusterCode(e.target.value);
                    clearField('clusterCode');
                  }}
                  required
                  disabled={submitting || dbClusters.length === 0}
                >
                  {dbClusters.length === 0 ? (
                    <option value="">Memuat daftar cluster...</option>
                  ) : (
                    dbClusters.map((item) => (
                      <option key={item.id} value={item.clusterCode}>
                        {item.clusterCode} - {item.name}
                      </option>
                    ))
                  )}
                </select>
                <FieldError id="cust-cluster-err" message={fieldErrors.clusterCode} />
              </label>

              <label className="field">
                <span>Kode ODP (Opsional)</span>
                <input
                  type="text"
                  aria-invalid={Boolean(fieldErrors.splitterCode)}
                  className={fieldErrors.splitterCode ? 'ui-input-invalid' : ''}
                  placeholder="ODP-PLB-001"
                  value={splitterCode}
                  onChange={(e) => {
                    setSplitterCode(e.target.value);
                    clearField('splitterCode');
                  }}
                />
                <FieldError message={fieldErrors.splitterCode} />
              </label>

              <label className="field">
                <span>Port # (Opsional)</span>
                <input
                  type="number"
                  min={1}
                  max={32}
                  aria-invalid={Boolean(fieldErrors.portNumber)}
                  aria-describedby={fieldErrors.portNumber ? 'cust-port-err' : undefined}
                  className={fieldErrors.portNumber ? 'ui-input-invalid' : ''}
                  placeholder="1-32"
                  value={portNumber}
                  onChange={(e) => {
                    setPortNumber(e.target.value);
                    clearField('portNumber');
                  }}
                />
                <FieldError id="cust-port-err" message={fieldErrors.portNumber} />
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
    </ModalOverlay>
  );
}

