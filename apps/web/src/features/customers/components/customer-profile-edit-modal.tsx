'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CustomerListItem, UpdateCustomerInput } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { webApiClient } from '@/lib/api-client';
import { isAppError, normalizeAppError } from '@/lib/error-normalizer';
import { useToast } from '@/providers';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

type EditTab = 'profile' | 'pic' | 'technical';

type ProfileFieldKey =
  | 'fullName'
  | 'address'
  | 'lat'
  | 'lng'
  | 'picName'
  | 'picPhone'
  | 'picRole'
  | 'profileDescription'
  | 'photoObjectKey'
  | 'photoCaption'
  | 'splitterCode'
  | 'portNumber'
  | 'oltAttenuation'
  | 'ontAttenuation'
  | 'lastActivityNote'
  | 'gponNode'
  | 'oltSlot'
  | 'ontSn'
  | 'notes';

export interface CustomerProfileEditModalProps {
  customer: CustomerListItem;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: CustomerListItem) => Promise<void> | void;
  /** Optional callback triggered immediately after a photo is uploaded or removed. */
  onPhotoChanged?: () => Promise<void> | void;
}

/**
 * Full customer profile editor modal strictly restricted to SUPER_ADMIN.
 * Supports uploading/replacing/removing the customer building photo, PIC contact,
 * profile description, ODP/port allocation, OLT/ONT attenuation, and activity notes.
 */
export function CustomerProfileEditModal({
  customer,
  isOpen,
  onClose,
  onSaved,
  onPhotoChanged,
}: CustomerProfileEditModalProps) {
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<EditTab>('profile');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldKey, string>>>({});

  const [fullName, setFullName] = useState('');
  const [status, setStatus] = useState<'PENDING_INSTALL' | 'ACTIVE' | 'ISOLATED' | 'DISMANTLED'>('ACTIVE');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [profileDescription, setProfileDescription] = useState('');

  const [photoObjectKey, setPhotoObjectKey] = useState('');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  const [picName, setPicName] = useState('');
  const [picPhone, setPicPhone] = useState('');
  const [picRole, setPicRole] = useState('');

  const [splitterCode, setSplitterCode] = useState('');
  const [portNumber, setPortNumber] = useState('');
  const [oltAttenuation, setOltAttenuation] = useState('');
  const [ontAttenuation, setOntAttenuation] = useState('');
  const [gponNode, setGponNode] = useState('');
  const [oltSlot, setOltSlot] = useState('');
  const [ontSn, setOntSn] = useState('');
  const [lastActivityNote, setLastActivityNote] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('profile');
    setFieldErrors({});
    setPhotoUploadError(null);
    setFullName(customer.fullName || '');
    setStatus(
      (customer.status as 'PENDING_INSTALL' | 'ACTIVE' | 'ISOLATED' | 'DISMANTLED') || 'ACTIVE',
    );
    setAddress(customer.address || '');
    setLat(customer.lat != null ? String(customer.lat) : '');
    setLng(customer.lng != null ? String(customer.lng) : '');
    setProfileDescription(customer.profileDescription || '');
    setPhotoObjectKey(customer.photoObjectKey || '');
    setPhotoPreviewUrl(customer.photoUrl || null);
    setPhotoCaption(customer.photoCaption || '');
    setPicName(customer.picName || '');
    setPicPhone(customer.picPhone || '');
    setPicRole(customer.picRole || '');
    setSplitterCode(customer.splitterCode || '');
    setPortNumber(customer.portNumber != null ? String(customer.portNumber) : '');
    setOltAttenuation(customer.oltAttenuation != null ? String(customer.oltAttenuation) : '');
    setOntAttenuation(
      customer.ontAttenuation != null
        ? String(customer.ontAttenuation)
        : customer.currentAttenuation != null
          ? String(customer.currentAttenuation)
          : '',
    );
    setGponNode(customer.gponNode || '');
    setOltSlot(customer.oltSlot || '');
    setOntSn(customer.ontSn || '');
    setLastActivityNote(customer.lastActivityNote || '');
    setNotes(customer.notes || '');
  }, [isOpen, customer]);

  if (!isOpen) return null;

  const clearField = (key: ProfileFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoUploadError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setPhotoUploadError(
        'Format foto belum didukung. Unggah gambar berformat JPG, PNG, atau WEBP (maksimal 5 MB).',
      );
      return;
    }
    if (file.size <= 0) {
      setPhotoUploadError('Berkas foto kosong. Pilih gambar lain.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoUploadError('Ukuran foto melebihi batas maksimal 5 MB. Perkecil gambar lalu coba lagi.');
      return;
    }

    try {
      setUploadingPhoto(true);
      const formData = new FormData();
      formData.append('siaNumber', customer.siaNumber);
      formData.append('file', file);
      if (photoCaption.trim()) {
        formData.append('caption', photoCaption.trim());
      }

      const res = await webApiClient.post<{
        photoObjectKey: string;
        photoUrl: string | null;
        photoCaption: string | null;
      }>('/api/v1/admin/customers/photo', formData, { timeoutMs: 25_000 });

      if (!res.success || !res.data) {
        throw normalizeAppError(!res.success ? res.error : null, {
          fallbackMessage: 'Foto bangunan pelanggan belum dapat diunggah.',
        });
      }

      setPhotoObjectKey(res.data.photoObjectKey);
      setPhotoPreviewUrl(res.data.photoUrl);
      if (res.data.photoCaption !== null) {
        setPhotoCaption(res.data.photoCaption);
      }
      showSuccess('Foto bangunan/lokasi pelanggan berhasil diunggah.');
      await onPhotoChanged?.();
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, {
        fallbackMessage: 'Foto bangunan pelanggan belum dapat diunggah.',
      });
      setPhotoUploadError(normalized.message);
      showError(normalized);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      setRemovingPhoto(true);
      setPhotoUploadError(null);
      const res = await webApiClient.request(
        `/api/v1/admin/customers/photo?sia=${encodeURIComponent(customer.siaNumber)}`,
        { method: 'DELETE' },
      );
      if (!res.success) {
        throw normalizeAppError(res.error, {
          fallbackMessage: 'Foto profil pelanggan belum dapat dihapus.',
        });
      }
      setPhotoObjectKey('');
      setPhotoPreviewUrl(null);
      setPhotoCaption('');
      showSuccess('Foto bangunan pelanggan telah dihapus.');
      await onPhotoChanged?.();
    } catch (err: unknown) {
      showError(
        normalizeAppError(err, { fallbackMessage: 'Foto profil pelanggan belum dapat dihapus.' }),
      );
    } finally {
      setRemovingPhoto(false);
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<ProfileFieldKey, string>> = {};
    if (fullName.trim().length < 2) {
      errors.fullName = 'Nama pelanggan minimal 2 karakter.';
    }
    if (address.trim().length < 5) {
      errors.address = 'Alamat instalasi minimal 5 karakter.';
    }
    if (lat.trim()) {
      const n = Number(lat.trim());
      if (Number.isNaN(n) || n < -90 || n > 90) {
        errors.lat = 'Latitude harus berupa angka antara -90 hingga 90.';
      }
    }
    if (lng.trim()) {
      const n = Number(lng.trim());
      if (Number.isNaN(n) || n < -180 || n > 180) {
        errors.lng = 'Longitude harus berupa angka antara -180 hingga 180.';
      }
    }
    if (portNumber.trim()) {
      const p = Number(portNumber.trim());
      if (!Number.isInteger(p) || p < 1 || p > 32) {
        errors.portNumber = 'Nomor port ODP harus bilangan bulat antara 1 hingga 32.';
      }
    }
    if (oltAttenuation.trim()) {
      const v = Number(oltAttenuation.trim());
      if (Number.isNaN(v) || v < -50 || v > 5) {
        errors.oltAttenuation = 'Redaman OLT harus berada di antara -50 hingga 5 dBm.';
      }
    }
    if (ontAttenuation.trim()) {
      const v = Number(ontAttenuation.trim());
      if (Number.isNaN(v) || v < -50 || v > 5) {
        errors.ontAttenuation = 'Redaman ONT harus berada di antara -50 hingga 5 dBm.';
      }
    }
    if (
      photoObjectKey.trim() &&
      !(
        photoObjectKey.trim().startsWith('/assets/') ||
        photoObjectKey.trim().startsWith('customers/') ||
        photoObjectKey.trim().startsWith('proofs/') ||
        photoObjectKey.trim().startsWith('opm-proofs/')
      )
    ) {
      errors.photoObjectKey =
        'Gunakan tombol unggah foto atau masukkan key objek media (customers/, proofs/, opm-proofs/) / path /assets/ yang sah.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.fullName || errors.address || errors.lat || errors.lng || errors.photoObjectKey) {
        setActiveTab('profile');
      } else if (errors.picName || errors.picPhone || errors.picRole) {
        setActiveTab('pic');
      } else {
        setActiveTab('technical');
      }
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      const payload: UpdateCustomerInput = {
        siaNumber: customer.siaNumber,
        fullName: fullName.trim(),
        status,
        address: address.trim(),
        lat: lat.trim() ? Number(lat.trim()) : null,
        lng: lng.trim() ? Number(lng.trim()) : null,
        profileDescription: profileDescription.trim() || null,
        photoObjectKey: photoObjectKey.trim() || null,
        photoCaption: photoCaption.trim() || null,
        picName: picName.trim() || null,
        picPhone: picPhone.trim() || null,
        picRole: picRole.trim() || null,
        splitterCode: splitterCode.trim() ? splitterCode.trim().toUpperCase() : null,
        portNumber: portNumber.trim() ? Number.parseInt(portNumber.trim(), 10) : null,
        oltAttenuation: oltAttenuation.trim() ? Number(oltAttenuation.trim()) : null,
        ontAttenuation: ontAttenuation.trim() ? Number(ontAttenuation.trim()) : null,
        gponNode: gponNode.trim() || null,
        oltSlot: oltSlot.trim() || null,
        ontSn: ontSn.trim() || null,
        lastActivityNote: lastActivityNote.trim() || null,
        notes: notes.trim() || null,
      };

      const res = await webApiClient.patch<CustomerListItem>('/api/v1/admin/customers', payload);
      if (!res.success || !res.data) {
        throw normalizeAppError(!res.success ? res.error : null, {
          fallbackMessage: 'Profil pelanggan belum dapat disimpan saat ini.',
        });
      }

      showSuccess(`Profil pelanggan ${res.data.fullName} berhasil diperbarui.`);
      await onSaved(res.data);
      onClose();
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, {
        fallbackMessage: 'Profil pelanggan belum dapat disimpan saat ini.',
      });
      if (isAppError(err) && err.fieldErrors) {
        setFieldErrors((prev) => ({
          ...prev,
          ...(err.fieldErrors as Partial<Record<ProfileFieldKey, string>>),
        }));
      }
      showError(normalized);
    } finally {
      setSubmitting(false);
    }
  };

  const tabOrder: EditTab[] = ['profile', 'pic', 'technical'];

  const hasProfileErrors = Boolean(
    fieldErrors.fullName ||
      fieldErrors.address ||
      fieldErrors.lat ||
      fieldErrors.lng ||
      fieldErrors.photoObjectKey ||
      photoUploadError,
  );
  const hasPicErrors = Boolean(
    fieldErrors.picName || fieldErrors.picPhone || fieldErrors.picRole,
  );
  const hasTechnicalErrors = Boolean(
    fieldErrors.portNumber || fieldErrors.oltAttenuation || fieldErrors.ontAttenuation,
  );

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = tabOrder[(currentIndex + 1) % tabOrder.length];
      setActiveTab(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = tabOrder[(currentIndex - 1 + tabOrder.length) % tabOrder.length];
      setActiveTab(prev);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveTab(tabOrder[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveTab(tabOrder[tabOrder.length - 1]);
    }
  };

  const activeStepLabel =
    activeTab === 'profile'
      ? 'Langkah 1/3 · Profil & Foto Lokasi'
      : activeTab === 'pic'
        ? 'Langkah 2/3 · Kontak PIC Pelanggan'
        : 'Langkah 3/3 · Datek ODP & Telemetri Optik';

  return (
    <ModalOverlay onClose={onClose} labelledBy="edit-customer-profile-title">
      <article
        className="modal cp-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading" style={{ padding: '16px 22px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div className="modal-icon-wrap">
              <Icon name="edit" size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 id="edit-customer-profile-title" className="modal-heading">
                Edit Profil Pelanggan
              </h2>
              <p className="modal-subheading" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span className="modal-badge-mono">{customer.siaNumber}</span>
                <span>·</span>
                <span>{customer.cluster}</span>
                {splitterCode.trim() && (
                  <>
                    <span>·</span>
                    <span>
                      {splitterCode.trim().toUpperCase()}
                      {portNumber.trim() ? ` / Port #${portNumber.trim()}` : ''}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <button className="dots" type="button" onClick={onClose} aria-label="Tutup modal edit">
            ×
          </button>
        </header>

        <form className="cp-edit-form" onSubmit={handleSubmit} noValidate>
          <div className="cp-edit-tabs-bar">
            <div
              className="cp-edit-tabs"
              role="tablist"
              aria-label="Bagian profil pelanggan"
              onKeyDown={handleTabKeyDown}
            >
              <button
                id="cp-tab-profile"
                type="button"
                role="tab"
                aria-selected={activeTab === 'profile'}
                aria-controls="cp-tabpanel-profile"
                tabIndex={activeTab === 'profile' ? 0 : -1}
                className={`cp-edit-tab ${activeTab === 'profile' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <span className="cp-edit-tab-step">1</span>
                <span>Profil &amp; Foto Lokasi</span>
                {hasProfileErrors && (
                  <span
                    className="cp-edit-tab-err-dot"
                    title="Terdapat input yang perlu diperbaiki pada tab ini"
                    aria-label="Perlu perbaikan"
                  />
                )}
              </button>
              <button
                id="cp-tab-pic"
                type="button"
                role="tab"
                aria-selected={activeTab === 'pic'}
                aria-controls="cp-tabpanel-pic"
                tabIndex={activeTab === 'pic' ? 0 : -1}
                className={`cp-edit-tab ${activeTab === 'pic' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('pic')}
              >
                <span className="cp-edit-tab-step">2</span>
                <span>Kontak PIC</span>
                {hasPicErrors && (
                  <span
                    className="cp-edit-tab-err-dot"
                    title="Terdapat input yang perlu diperbaiki pada tab ini"
                    aria-label="Perlu perbaikan"
                  />
                )}
              </button>
              <button
                id="cp-tab-technical"
                type="button"
                role="tab"
                aria-selected={activeTab === 'technical'}
                aria-controls="cp-tabpanel-technical"
                tabIndex={activeTab === 'technical' ? 0 : -1}
                className={`cp-edit-tab ${activeTab === 'technical' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('technical')}
              >
                <span className="cp-edit-tab-step">3</span>
                <span>Datek ODP, Redaman &amp; Aktivitas</span>
                {hasTechnicalErrors && (
                  <span
                    className="cp-edit-tab-err-dot"
                    title="Terdapat input yang perlu diperbaiki pada tab ini"
                    aria-label="Perlu perbaikan"
                  />
                )}
              </button>
            </div>
          </div>

          <div className="modal-body cp-edit-modal-body">
            {activeTab === 'profile' && (
              <div
                id="cp-tabpanel-profile"
                role="tabpanel"
                aria-labelledby="cp-tab-profile"
                className="cp-tabpanel"
              >
                {/* Section 1: Unified Building / Location Photo & Caption Card */}
                <section className="cp-photo-upload-card">
                  <div className="cp-photo-upload-row">
                    {photoPreviewUrl ? (
                      <img
                        src={photoPreviewUrl}
                        alt={photoCaption || `Foto lokasi ${customer.fullName}`}
                        width={124}
                        height={84}
                        decoding="async"
                        fetchPriority="low"
                        className="cp-photo-thumb"
                      />
                    ) : (
                      <div className="cp-photo-thumb-placeholder" aria-hidden="true">
                        <Icon name="building" size={22} />
                        <span>Belum Ada Foto</span>
                      </div>
                    )}

                    <div className="cp-photo-upload-meta">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>
                          Foto Bangunan / Lokasi Pelanggan
                        </div>
                        {photoObjectKey && (
                          <span className="cp-photo-key-pill" title={photoObjectKey}>
                            <Icon name="check" size={11} />
                            <span>Media Tersimpan</span>
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                        Unggah foto tampak depan gedung cabang, ruko, atau lokasi ATM untuk mempermudah identifikasi teknisi di lapangan (JPG, PNG, WEBP · maks. 5 MB).
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: 'none' }}
                          onChange={handlePhotoSelect}
                        />
                        <button
                          type="button"
                          className="button secondary"
                          disabled={uploadingPhoto || removingPhoto}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Icon name="upload" size={13} />
                          <span>
                            {uploadingPhoto
                              ? 'Mengunggah...'
                              : photoPreviewUrl
                                ? 'Ganti Foto Lokasi'
                                : 'Unggah Foto Lokasi'}
                          </span>
                        </button>
                        {(photoPreviewUrl || photoObjectKey) && (
                          <button
                            type="button"
                            className="button secondary"
                            disabled={uploadingPhoto || removingPhoto}
                            onClick={handleRemovePhoto}
                          >
                            <Icon name="trash" size={13} />
                            <span>{removingPhoto ? 'Menghapus...' : 'Hapus Foto'}</span>
                          </button>
                        )}
                      </div>
                      {photoUploadError && <FieldError message={photoUploadError} />}
                      {fieldErrors.photoObjectKey && (
                        <FieldError message={fieldErrors.photoObjectKey} />
                      )}
                    </div>
                  </div>

                  <label className="field">
                    <span>
                      <span>Keterangan Foto Lokasi (Caption)</span>
                      <span className="cp-field-opt">Opsional</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Contoh: Tampak depan gedung Bank Indonesia KC Palembang (pintu akses ruang server di sisi barat)"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                    />
                  </label>
                </section>

                {/* Section 2: Core Customer Identity, Address & Coordinates */}
                <section className="cp-form-section">
                  <div className="cp-form-section-head">
                    <div>
                      <h3 className="cp-form-section-title">
                        <Icon name="users" size={15} />
                        <span>Identitas &amp; Titik Lokasi Instalasi</span>
                      </h3>
                      <p className="cp-form-section-desc">
                        Data utama pelanggan korporat/ritel, alamat fisik pemasangan, dan koordinat peta GIS.
                      </p>
                    </div>
                    <span className="cp-form-section-badge">Wajib Diisi (*)</span>
                  </div>

                  <div className="cp-edit-grid-2">
                    <label className="field">
                      <span>
                        <span>
                          Nama Pelanggan / Instansi
                          <span className="cp-field-req" aria-hidden="true">*</span>
                        </span>
                      </span>
                      <input
                        type="text"
                        required
                        aria-invalid={Boolean(fieldErrors.fullName)}
                        className={fieldErrors.fullName ? 'ui-input-invalid' : ''}
                        placeholder="Contoh: PT Bank Mandiri (Persero) Tbk - KCP Sudirman"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          clearField('fullName');
                        }}
                      />
                      <FieldError message={fieldErrors.fullName} />
                    </label>

                    <label className="field">
                      <span>Status Layanan SIA</span>
                      <select
                        value={status}
                        onChange={(e) =>
                          setStatus(
                            e.target.value as
                              | 'PENDING_INSTALL'
                              | 'ACTIVE'
                              | 'ISOLATED'
                              | 'DISMANTLED',
                          )
                        }
                      >
                        <option value="ACTIVE">Aktif (ACTIVE)</option>
                        <option value="PENDING_INSTALL">Menunggu PSB (PENDING_INSTALL)</option>
                        <option value="ISOLATED">Terisolir (ISOLATED)</option>
                        <option value="DISMANTLED">Putus / Dismantle (DISMANTLED)</option>
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>
                      <span>
                        Alamat Lengkap Instalasi
                        <span className="cp-field-req" aria-hidden="true">*</span>
                      </span>
                    </span>
                    <input
                      type="text"
                      required
                      aria-invalid={Boolean(fieldErrors.address)}
                      className={fieldErrors.address ? 'ui-input-invalid' : ''}
                      placeholder="Jl. Jend. Sudirman No. 512, Kec. Ilir Timur I, Kota Palembang"
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        clearField('address');
                      }}
                    />
                    <FieldError message={fieldErrors.address} />
                  </label>

                  <label className="field">
                    <span>
                      <span>Deskripsi Profil &amp; Panduan Akses Lokasi</span>
                      <span className="cp-field-opt">Opsional</span>
                    </span>
                    <textarea
                      rows={3}
                      placeholder="Jelaskan karakteristik gedung/cabang, prosedur izin masuk teknisi, jam operasional, atau posisi rak CPE/ONT..."
                      value={profileDescription}
                      onChange={(e) => setProfileDescription(e.target.value)}
                    />
                  </label>

                  <div className="cp-edit-grid-2">
                    <label className="field">
                      <span>
                        <span>Latitude Pelanggan (Lat)</span>
                        <span className="cp-field-opt">-90 s/d 90</span>
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="-2.9790933"
                        aria-invalid={Boolean(fieldErrors.lat)}
                        className={fieldErrors.lat ? 'ui-input-invalid' : ''}
                        value={lat}
                        onChange={(e) => {
                          setLat(e.target.value);
                          clearField('lat');
                        }}
                      />
                      <FieldError message={fieldErrors.lat} />
                    </label>

                    <label className="field">
                      <span>
                        <span>Longitude Pelanggan (Lng)</span>
                        <span className="cp-field-opt">-180 s/d 180</span>
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="104.7570692"
                        aria-invalid={Boolean(fieldErrors.lng)}
                        className={fieldErrors.lng ? 'ui-input-invalid' : ''}
                        value={lng}
                        onChange={(e) => {
                          setLng(e.target.value);
                          clearField('lng');
                        }}
                      />
                      <FieldError message={fieldErrors.lng} />
                    </label>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'pic' && (
              <div
                id="cp-tabpanel-pic"
                role="tabpanel"
                aria-labelledby="cp-tab-pic"
                className="cp-tabpanel"
              >
                <section className="cp-form-section">
                  <div className="cp-form-section-head">
                    <div>
                      <h3 className="cp-form-section-title">
                        <Icon name="phone" size={15} />
                        <span>Narahubung / PIC Lokasi Pelanggan</span>
                      </h3>
                      <p className="cp-form-section-desc">
                        Informasi ini ditampilkan kepada Helpdesk NOC dan teknisi lapangan untuk koordinasi kunjungan maupun konfirmasi pemulihan gangguan.
                      </p>
                    </div>
                    <span className="cp-form-section-badge">Kontak Lapangan</span>
                  </div>

                  <div className="cp-edit-grid-2">
                    <label className="field">
                      <span>
                        <span>Nama Lengkap PIC</span>
                        <span className="cp-field-opt">Opsional</span>
                      </span>
                      <input
                        type="text"
                        placeholder="Contoh: Hendra Wijaya"
                        value={picName}
                        onChange={(e) => setPicName(e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>
                        <span>Jabatan / Peran PIC</span>
                        <span className="cp-field-opt">Opsional</span>
                      </span>
                      <input
                        type="text"
                        placeholder="Contoh: IT Branch Support / Koordinator Gedung"
                        value={picRole}
                        onChange={(e) => setPicRole(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>
                      <span>Nomor Telepon / WhatsApp PIC</span>
                      <span className="cp-field-opt">Aktif Telepon &amp; WA</span>
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="Contoh: +62 812-7311-4092"
                      value={picPhone}
                      onChange={(e) => setPicPhone(e.target.value)}
                    />
                    <span className="cp-field-hint">
                      Gunakan format nomor dengan kode negara (+62) atau 08xx agar tombol panggil cepat &amp; WhatsApp berfungsi langsung dari halaman detail pelanggan.
                    </span>
                  </label>
                </section>
              </div>
            )}

            {activeTab === 'technical' && (
              <div
                id="cp-tabpanel-technical"
                role="tabpanel"
                aria-labelledby="cp-tab-technical"
                className="cp-tabpanel"
              >
                {/* Section 1: ODP, Port & GPON Allocation */}
                <section className="cp-form-section">
                  <div className="cp-form-section-head">
                    <div>
                      <h3 className="cp-form-section-title">
                        <Icon name="network" size={15} />
                        <span>Alokasi Datek ODP, Port Splitter &amp; GPON</span>
                      </h3>
                      <p className="cp-form-section-desc">
                        Penempatan jalur distribusi optik pelanggan pada splitter ODP serta identitas perangkat GPON/ONT.
                      </p>
                    </div>
                    <span className="cp-form-section-badge">
                      {splitterCode.trim()
                        ? `${splitterCode.trim().toUpperCase()}${portNumber.trim() ? ` · Port #${portNumber.trim()}` : ''}`
                        : 'Belum Terhubung ODP'}
                    </span>
                  </div>

                  <div className="cp-edit-grid-2">
                    <label className="field">
                      <span>
                        <span>Kode ODP / Splitter</span>
                        <span className="cp-field-opt">Format ODP-*</span>
                      </span>
                      <input
                        type="text"
                        placeholder="Contoh: ODP-PLB-001"
                        value={splitterCode}
                        onChange={(e) => setSplitterCode(e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>
                        <span>Nomor Port ODP Tersambung</span>
                        <span className="cp-field-opt">Port 1 s/d 32</span>
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        aria-invalid={Boolean(fieldErrors.portNumber)}
                        className={fieldErrors.portNumber ? 'ui-input-invalid' : ''}
                        placeholder="Contoh: 2"
                        value={portNumber}
                        onChange={(e) => {
                          setPortNumber(e.target.value);
                          clearField('portNumber');
                        }}
                      />
                      <FieldError message={fieldErrors.portNumber} />
                    </label>
                  </div>

                  <div className="cp-edit-grid-3">
                    <label className="field">
                      <span>Node Akses GPON</span>
                      <input
                        type="text"
                        placeholder="PLBBSGGA01"
                        value={gponNode}
                        onChange={(e) => setGponNode(e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>Slot / Port OLT</span>
                      <input
                        type="text"
                        placeholder="2@1/7/3.gpon"
                        value={oltSlot}
                        onChange={(e) => setOltSlot(e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>SN Modem / ONT</span>
                      <input
                        type="text"
                        placeholder="rcmginds183"
                        value={ontSn}
                        onChange={(e) => setOntSn(e.target.value)}
                      />
                    </label>
                  </div>
                </section>

                {/* Section 2: Optical Attenuation & Activity Notes */}
                <section className="cp-form-section">
                  <div className="cp-form-section-head">
                    <div>
                      <h3 className="cp-form-section-title">
                        <Icon name="activity" size={15} />
                        <span>Telemetri Redaman Optik &amp; Catatan Aktivitas</span>
                      </h3>
                      <p className="cp-form-section-desc">
                        Standar redaman normal: -13 s/d -24 dBm · Warning: -24 s/d -27 dBm · Kritis (LOS Risk): &le; -27 dBm.
                      </p>
                    </div>
                    <span className="cp-form-section-badge">Satuan dBm</span>
                  </div>

                  <div className="cp-edit-grid-2">
                    <label className="field">
                      <span>
                        <span>Redaman OLT (Rx OLT)</span>
                        <span className="cp-field-opt">dBm</span>
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Contoh: -21.4"
                        aria-invalid={Boolean(fieldErrors.oltAttenuation)}
                        className={fieldErrors.oltAttenuation ? 'ui-input-invalid' : ''}
                        value={oltAttenuation}
                        onChange={(e) => {
                          setOltAttenuation(e.target.value);
                          clearField('oltAttenuation');
                        }}
                      />
                      <FieldError message={fieldErrors.oltAttenuation} />
                    </label>

                    <label className="field">
                      <span>
                        <span>Redaman ONT (Rx Modem)</span>
                        <span className="cp-field-opt">dBm</span>
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Contoh: -19.8"
                        aria-invalid={Boolean(fieldErrors.ontAttenuation)}
                        className={fieldErrors.ontAttenuation ? 'ui-input-invalid' : ''}
                        value={ontAttenuation}
                        onChange={(e) => {
                          setOntAttenuation(e.target.value);
                          clearField('ontAttenuation');
                        }}
                      />
                      <FieldError message={fieldErrors.ontAttenuation} />
                    </label>
                  </div>

                  <label className="field">
                    <span>
                      <span>Note Activity Terakhir (Riwayat Lapangan)</span>
                      <span className="cp-field-opt">Opsional</span>
                    </span>
                    <textarea
                      rows={2}
                      placeholder="Contoh: Splicing ulang dropcore di tiang ke-2 depan ruko, redaman membaik dari -28.4 dBm ke -19.8 dBm..."
                      value={lastActivityNote}
                      onChange={(e) => setLastActivityNote(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>
                      <span>Catatan Integrasi Datek</span>
                      <span className="cp-field-opt">Opsional</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Catatan teknis tambahan dari dokumen Datek / BAST instalasi"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                </section>
              </div>
            )}
          </div>

          <footer className="modal-footer cp-edit-footer">
            <div className="cp-edit-footer-meta">
              <Icon name="info" size={13} />
              <span>{activeStepLabel}</span>
            </div>
            <div className="cp-edit-footer-actions">
              <button type="button" className="button secondary" onClick={onClose}>
                Batal
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={submitting || uploadingPhoto || removingPhoto}
              >
                {submitting ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
              </button>
            </div>
          </footer>
        </form>
      </article>
    </ModalOverlay>
  );
}
