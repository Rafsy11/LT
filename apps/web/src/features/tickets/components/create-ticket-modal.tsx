'use client';

import React, { useState, useRef, useEffect } from 'react';
import type {
  CreateTicketInput,
  CustomerListItem,
  TechnicianListItem,
} from '@repo/shared';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { FieldError } from '@/components/ui/FieldError';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { webApiClient } from '@/lib/api-client';
import { isAppError, normalizeAppError } from '@/lib/error-normalizer';
import { useToast, useAuth } from '@/providers';
import '@/styles/components/ticket-modal.css';

type TicketFieldKey =
  | 'siaNumber'
  | 'customerName'
  | 'serviceAddress'
  | 'clusterCode'
  | 'assignedTechUsername'
  | 'targetLat'
  | 'targetLng';

export interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTicketInput) => Promise<void> | void;
  initialValues?: Partial<CreateTicketInput>;
}

interface VendorOption {
  username: string;
  fullName: string;
  vendorCompany: string;
  clusterLabel: string;
  telegramBound: boolean;
}

export function CreateTicketModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
}: CreateTicketModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { showSuccess, showError } = useToast();
  const { canCreateTicket } = useAuth();
  const { clusters: clusterOptions } = useClusterOptions();

  const [customerMode, setCustomerMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [technicians, setTechnicians] = useState<VendorOption[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [siaNumber, setSiaNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [ticketType, setTicketType] = useState<'PSB' | 'MAINTENANCE'>('MAINTENANCE');
  const [clusterCode, setClusterCode] = useState('');
  const [complaintSummary, setComplaintSummary] = useState('');
  const [locationPlace, setLocationPlace] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [targetLat, setTargetLat] = useState('');
  const [targetLng, setTargetLng] = useState('');
  const [assignedTechUsername, setAssignedTechUsername] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [lookupMatchedSia, setLookupMatchedSia] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TicketFieldKey, string>>>({});

  const clearField = (key: TicketFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    setCustomerName(initialValues?.customerName || '');
    setSiaNumber(initialValues?.siaNumber || '');
    setCustomerPhone(initialValues?.customerPhone || '');
    setTicketType(initialValues?.ticketType || (initialValues?.siaNumber ? 'MAINTENANCE' : 'PSB'));
    setClusterCode(initialValues?.clusterCode || '');
    setComplaintSummary(initialValues?.complaintSummary || '');
    setLocationPlace(initialValues?.locationPlace || '');
    setServiceAddress(initialValues?.serviceAddress || '');
    setTargetLat(
      typeof initialValues?.targetLat === 'number' ? String(initialValues.targetLat) : '',
    );
    setTargetLng(
      typeof initialValues?.targetLng === 'number' ? String(initialValues.targetLng) : '',
    );
    setAssignedTechUsername(initialValues?.assignedTechUsername || '');
    setVendorName(initialValues?.vendorName || '');
    setAdminNotes(initialValues?.adminNotes || '');
    setLookupMatchedSia(null);
    setFieldErrors({});
    setLoadingVendors(true);

    Promise.all([
      webApiClient.get<CustomerListItem[]>('/api/v1/admin/customers').catch(() => null),
      webApiClient.get<TechnicianListItem[]>('/api/v1/admin/technicians').catch(() => null),
    ]).then(([custJson, techJson]) => {
      if (!active) return;

      if (custJson?.success && Array.isArray(custJson.data)) {
        const custList = custJson.data as CustomerListItem[];
        setCustomers(custList);

        if (initialValues?.siaNumber) {
          const match = custList.find(
            (c) => c.siaNumber.toLowerCase() === initialValues.siaNumber!.toLowerCase(),
          );
          if (match) {
            setLookupMatchedSia(match.siaNumber);
            setCustomerMode('EXISTING');
            setCustomerName((prev) => prev || match.fullName);
            setClusterCode(match.cluster || initialValues.clusterCode || '');
            setServiceAddress((prev) => prev || match.address || '');
            if (match.lat !== null && match.lat !== undefined) {
              setTargetLat((prev) => prev || String(match.lat));
            }
            if (match.lng !== null && match.lng !== undefined) {
              setTargetLng((prev) => prev || String(match.lng));
            }
          }
        }
      }

      if (techJson?.success && Array.isArray(techJson.data)) {
        const mappedTechs = (techJson.data as TechnicianListItem[]).map((t) => ({
          username: t.username,
          fullName: t.fullName,
          vendorCompany: t.vendorCompany || 'Tim Vendor Lapangan',
          clusterLabel: t.cluster || 'Semua Cluster',
          telegramBound: Boolean(t.telegramBound),
        }));
        setTechnicians(mappedTechs);
        if (!initialValues?.assignedTechUsername && mappedTechs[0]) {
          setAssignedTechUsername(mappedTechs[0].username);
          setVendorName(mappedTechs[0].vendorCompany);
        }
      }
    }).finally(() => {
      if (active) {
        setLoadingVendors(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isOpen, initialValues]);

  useEffect(() => {
    if (!isOpen || clusterCode || clusterOptions.length === 0) return;
    setClusterCode(clusterOptions[0].name);
  }, [isOpen, clusterCode, clusterOptions]);

  if (!isOpen) return null;

  const applyCustomerRecord = (cust: CustomerListItem) => {
    setSiaNumber(cust.siaNumber);
    setCustomerName(cust.fullName);
    setClusterCode(cust.cluster || clusterOptions[0]?.name || '');
    setServiceAddress(cust.address || '');
    setLocationPlace(cust.fullName);
    setTargetLat(cust.lat !== null && cust.lat !== undefined ? String(cust.lat) : '');
    setTargetLng(cust.lng !== null && cust.lng !== undefined ? String(cust.lng) : '');
    setLookupMatchedSia(cust.siaNumber);
  };

  const handleSelectExistingCustomer = (sia: string) => {
    const match = customers.find((c) => c.siaNumber === sia);
    if (match) {
      applyCustomerRecord(match);
    }
  };

  const handleSiaChange = (val: string) => {
    setSiaNumber(val);
    const trimmed = val.trim().toLowerCase();
    const match = customers.find((c) => c.siaNumber.toLowerCase() === trimmed);
    if (match) {
      applyCustomerRecord(match);
    } else {
      setLookupMatchedSia(null);
    }
  };

  const handleModeSwitch = (mode: 'EXISTING' | 'NEW') => {
    setCustomerMode(mode);
    if (mode === 'NEW') {
      setTicketType('PSB');
      setLookupMatchedSia(null);
      if (!siaNumber.trim()) {
        const suffix = String(Date.now()).slice(-4);
        setSiaNumber(`SLA-${new Date().getFullYear()}-${suffix}`);
      }
    }
  };

  const handleVendorChange = (username: string) => {
    setAssignedTechUsername(username);
    const selected = technicians.find((t) => t.username === username);
    if (selected) {
      setVendorName(selected.vendorCompany);
    }
  };

  const parsedLat = targetLat.trim() !== '' ? Number(targetLat) : undefined;
  const parsedLng = targetLng.trim() !== '' ? Number(targetLng) : undefined;
  const hasValidCoords =
    parsedLat !== undefined &&
    parsedLng !== undefined &&
    !Number.isNaN(parsedLat) &&
    !Number.isNaN(parsedLng);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!canCreateTicket) {
      showError({
        code: 'FORBIDDEN',
        message: 'Akun Anda belum memiliki izin untuk membuat tiket baru.',
      });
      return;
    }

    const errors: Partial<Record<TicketFieldKey, string>> = {};
    if (!siaNumber.trim()) {
      errors.siaNumber = 'Nomor SIA pelanggan perlu diisi.';
    }
    if (!customerName.trim()) {
      errors.customerName = 'Nama pelanggan atau perusahaan perlu diisi.';
    }
    if (!clusterCode.trim()) {
      errors.clusterCode = 'Pilih cluster wilayah terlebih dahulu.';
    }
    if (!serviceAddress.trim()) {
      errors.serviceAddress = 'Alamat lengkap lokasi tugas perlu diisi.';
    }
    if (!assignedTechUsername.trim()) {
      errors.assignedTechUsername = 'Pilih vendor atau teknisi penanggung jawab terlebih dahulu.';
    }
    if (
      targetLat.trim() !== '' &&
      (parsedLat === undefined || Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90)
    ) {
      errors.targetLat = 'Nilai latitude harus berada di antara -90 hingga 90.';
    }
    if (
      targetLng.trim() !== '' &&
      (parsedLng === undefined || Number.isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180)
    ) {
      errors.targetLng = 'Nilai longitude harus berada di antara -180 hingga 180.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    const payload: CreateTicketInput = {
      customerName: customerName.trim(),
      siaNumber: siaNumber.trim(),
      ticketType,
      clusterCode,
      assignedTechUsername,
      vendorName: vendorName.trim() || undefined,
      complaintSummary: complaintSummary.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      serviceAddress: serviceAddress.trim() || undefined,
      locationPlace: locationPlace.trim() || undefined,
      targetLat: hasValidCoords ? parsedLat : undefined,
      targetLng: hasValidCoords ? parsedLng : undefined,
      adminNotes: adminNotes.trim() || undefined,
    };

    try {
      await onSubmit(payload);
      showSuccess(
        `Aduan & penugasan ${payload.customerName} (${payload.siaNumber}) dikirim ke vendor ${payload.assignedTechUsername}.`,
      );
      onClose();
    } catch (err: unknown) {
      const normalized = normalizeAppError(err);
      if (isAppError(err) && err.fieldErrors) {
        setFieldErrors((prev) => ({
          ...prev,
          ...(err.fieldErrors as Partial<Record<TicketFieldKey, string>>),
        }));
      }
      showError(normalized);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="create-ticket-modal-title">
      <article
        className="modal"
        style={{ maxWidth: '660px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <h2 id="create-ticket-modal-title">Catat Aduan Pelanggan &amp; Tugaskan Vendor</h2>
          <button className="dots" onClick={onClose} type="button" aria-label="Tutup modal">
            ×
          </button>
        </header>

        {!canCreateTicket && (
          <aside className="permission-lock-notice" role="alert">
            <b>Akses Dibatasi:</b> Akun Anda belum memiliki izin untuk membuat tiket baru. Tombol
            pembuatan tiket dinonaktifkan sementara.
          </aside>
        )}

        <form className="modal-body" onSubmit={handleSubmit} noValidate>
          <div className="ticket-mode-tabs" role="tablist" aria-label="Sumber Data Pelanggan">
            <button
              type="button"
              role="tab"
              aria-selected={customerMode === 'EXISTING'}
              className={`ticket-mode-btn ${customerMode === 'EXISTING' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('EXISTING')}
            >
              Pelanggan Terdaftar (Cari SIA)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={customerMode === 'NEW'}
              className={`ticket-mode-btn ${customerMode === 'NEW' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('NEW')}
            >
              Pelanggan Baru (Pasang Baru / PSB)
            </button>
          </div>

          {customerMode === 'EXISTING' && customers.length > 0 && (
            <label>
              Pilih cepat pelanggan dari Master SIA
              <select
                value={lookupMatchedSia || ''}
                onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                disabled={!canCreateTicket || submitting}
              >
                <option value="">-- Pilih pelanggan terdaftar (opsional) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.siaNumber}>
                    {c.siaNumber} · {c.fullName} ({c.cluster})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="ticket-form-grid">
            <label>
              Nomor SIA
              <input
                name="siaNumber"
                required
                aria-invalid={Boolean(fieldErrors.siaNumber)}
                className={fieldErrors.siaNumber ? 'ui-input-invalid' : ''}
                value={siaNumber}
                onChange={(e) => {
                  handleSiaChange(e.target.value);
                  clearField('siaNumber');
                }}
                placeholder="Contoh: SLA-100244-001"
                disabled={!canCreateTicket || submitting}
              />
              <FieldError message={fieldErrors.siaNumber} />
            </label>

            <label>
              Nama pelanggan
              <input
                name="customerName"
                required
                aria-invalid={Boolean(fieldErrors.customerName)}
                className={fieldErrors.customerName ? 'ui-input-invalid' : ''}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  clearField('customerName');
                }}
                placeholder="Nama perusahaan atau pelanggan"
                disabled={!canCreateTicket || submitting}
              />
              <FieldError message={fieldErrors.customerName} />
            </label>

            <label>
              No. Telepon / Kontak PIC
              <input
                name="customerPhone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+62 812-xxxx-xxxx"
                disabled={!canCreateTicket || submitting}
              />
            </label>

            <label>
              Tipe pekerjaan
              <select
                name="ticketType"
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value as 'PSB' | 'MAINTENANCE')}
                disabled={!canCreateTicket || submitting}
              >
                <option value="MAINTENANCE">MAINTENANCE · Aduan Gangguan / Redaman</option>
                <option value="PSB">PSB · Permintaan Pasang Baru</option>
              </select>
            </label>
          </div>

          <label>
            Aduan masalah / permintaan pelanggan
            <textarea
              name="complaintSummary"
              rows={2}
              value={complaintSummary}
              onChange={(e) => setComplaintSummary(e.target.value)}
              placeholder="Contoh: Koneksi putus sejak pagi, indikator ONT merah LOS..."
              disabled={!canCreateTicket || submitting}
            />
          </label>

          <div className="ticket-form-grid">
            <label>
              Nama tempat / patokan lokasi
              <input
                name="locationPlace"
                value={locationPlace}
                onChange={(e) => setLocationPlace(e.target.value)}
                placeholder="Contoh: Ruko Baros Sentral Blok C-4"
                disabled={!canCreateTicket || submitting}
              />
            </label>

            <label>
              Cluster wilayah
              <select
                name="clusterCode"
                value={clusterCode}
                aria-invalid={Boolean(fieldErrors.clusterCode)}
                className={fieldErrors.clusterCode ? 'ui-input-invalid' : ''}
                onChange={(e) => {
                  setClusterCode(e.target.value);
                  clearField('clusterCode');
                }}
                required
                disabled={!canCreateTicket || submitting}
              >
                {clusterOptions.length === 0 ? (
                  <option value={clusterCode}>
                    {clusterCode || 'Memuat daftar cluster...'}
                  </option>
                ) : (
                  <>
                    {clusterCode && !clusterOptions.some((c) => c.name === clusterCode) && (
                      <option value={clusterCode}>{clusterCode}</option>
                    )}
                    {clusterOptions.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name} ({item.clusterCode})
                      </option>
                    ))}
                  </>
                )}
              </select>
              <FieldError message={fieldErrors.clusterCode} />
            </label>
          </div>

          <label>
            Alamat lengkap lokasi tugas
            <input
              name="serviceAddress"
              required
              aria-invalid={Boolean(fieldErrors.serviceAddress)}
              className={fieldErrors.serviceAddress ? 'ui-input-invalid' : ''}
              value={serviceAddress}
              onChange={(e) => {
                setServiceAddress(e.target.value);
                clearField('serviceAddress');
              }}
              placeholder="Contoh: Jl. Sudirman No. 88, Kec. Ilir Timur I, Palembang"
              disabled={!canCreateTicket || submitting}
            />
            <FieldError message={fieldErrors.serviceAddress} />
          </label>

          <div className="ticket-form-grid">
            <label>
              Titik Latitude
              <input
                name="targetLat"
                type="number"
                step="any"
                aria-invalid={Boolean(fieldErrors.targetLat)}
                className={fieldErrors.targetLat ? 'ui-input-invalid' : ''}
                value={targetLat}
                onChange={(e) => {
                  setTargetLat(e.target.value);
                  clearField('targetLat');
                }}
                placeholder="-2.982000"
                disabled={!canCreateTicket || submitting}
              />
              <FieldError message={fieldErrors.targetLat} />
            </label>

            <label>
              Titik Longitude
              <input
                name="targetLng"
                type="number"
                step="any"
                aria-invalid={Boolean(fieldErrors.targetLng)}
                className={fieldErrors.targetLng ? 'ui-input-invalid' : ''}
                value={targetLng}
                onChange={(e) => {
                  setTargetLng(e.target.value);
                  clearField('targetLng');
                }}
                placeholder="104.754000"
                disabled={!canCreateTicket || submitting}
              />
              <FieldError message={fieldErrors.targetLng} />
              {hasValidCoords && (
                <a
                  href={`https://maps.google.com/?q=${parsedLat},${parsedLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ticket-map-link"
                  style={{ marginTop: '4px' }}
                >
                  Pratinjau titik di Google Maps
                </a>
              )}
            </label>
          </div>

          <div className="ticket-form-grid">
            <label>
              Tugaskan ke vendor / teknisi
              <select
                name="assignedTechUsername"
                required
                aria-invalid={Boolean(fieldErrors.assignedTechUsername)}
                className={fieldErrors.assignedTechUsername ? 'ui-input-invalid' : ''}
                value={assignedTechUsername}
                onChange={(e) => {
                  handleVendorChange(e.target.value);
                  clearField('assignedTechUsername');
                }}
                disabled={!canCreateTicket || submitting || loadingVendors}
              >
                {loadingVendors ? (
                  <option value="">Memuat daftar vendor / teknisi...</option>
                ) : technicians.length === 0 ? (
                  <option value="">Belum ada vendor / teknisi terdaftar</option>
                ) : (
                  technicians.map((t) => (
                    <option key={t.username} value={t.username}>
                      {t.fullName} - {t.vendorCompany}
                      {t.telegramBound ? ' (Telegram Aktif)' : ''}
                    </option>
                  ))
                )}
              </select>
              <FieldError message={fieldErrors.assignedTechUsername} />
            </label>

            <label>
              Perusahaan vendor / mitra
              <input
                name="vendorName"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Nama PT/CV Vendor Pelaksana"
                disabled={!canCreateTicket || submitting}
              />
            </label>
          </div>

          <label>
            Instruksi tambahan CS untuk vendor (opsional)
            <input
              name="adminNotes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Contoh: Bawa cadangan patchcord SC-UPC & koordinasi satpam gerbang timur"
              disabled={!canCreateTicket || submitting}
            />
          </label>

          <button
            className="button primary"
            disabled={submitting || !canCreateTicket}
            type="submit"
          >
            {submitting ? 'Mengirim Disposisi...' : 'Simpan Aduan & Tugaskan ke Vendor'}
          </button>
        </form>
      </article>
    </ModalOverlay>
  );
}
