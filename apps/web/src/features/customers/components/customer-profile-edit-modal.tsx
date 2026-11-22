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

  return (
    <ModalOverlay onClose={onClose} labelledBy="edit-customer-profile-title">
      <article
        className="modal"
        style={{ maxWidth: '680px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading" style={{ padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="modal-icon-wrap">
              <Icon name="edit" size={18} />
            </div>
            <div>
              <h2 id="edit-customer-profile-title" className="modal-heading">
                Edit Profil Pelanggan (Super Admin)
              </h2>
              <p className="modal-subheading">
                SIA: <b>{customer.siaNumber}</b> · {customer.cluster}
              </p>
            </div>
          </div>
          <button className="dots" type="button" onClick={onClose} aria-label="Tutup modal edit">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div
            className="modal-body"
            style={{
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              maxHeight: '72vh',
              overflowY: 'auto',
            }}
          >
            <div className="cp-edit-tabs" role="tablist" aria-label="Bagian profil pelanggan">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'profile'}
                className={`cp-edit-tab ${activeTab === 'profile' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                1. Foto &amp; Deskripsi Profil
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'pic'}
                className={`cp-edit-tab ${activeTab === 'pic' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('pic')}
              >
                2. Kontak PIC
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'technical'}
                className={`cp-edit-tab ${activeTab === 'technical' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('technical')}
              >
                3. Datek ODP, Redaman &amp; Aktivitas
              </button>
            </div>

            {activeTab === 'profile' && (
              <>
                {/* Building / Location Photo Upload */}
                <div className="cp-photo-upload-row">
                  {photoPreviewUrl ? (
                    <img
                      src={photoPreviewUrl}
                      alt={photoCaption || `Foto lokasi ${customer.fullName}`}
                      width={120}
                      height={90}
                      decoding="async"
                      fetchPriority="low"
                      className="cp-photo-thumb"
                    />
                  ) : (
                    <div className="cp-photo-thumb-placeholder" aria-hidden="true">
                      <Icon name="building" size={24} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600 }}>
                      Foto Bangunan / Lokasi Pelanggan
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                      Tampak depan gedung cabang, ruko, atau lokasi ATM (JPG, PNG, WEBP, maks. 5 MB).
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                        <span>{uploadingPhoto ? 'Mengunggah...' : 'Unggah Foto'}</span>
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
                  </div>
                </div>

                <div className="cp-edit-grid-2">
                  <label className="field">
                    <span>Keterangan Foto (Caption)</span>
                    <input
                      type="text"
                      placeholder="Contoh: Tampak depan gedung Bank Indonesia KC Palembang"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Referensi Key Media / Aset (Opsional)</span>
                    <input
                      type="text"
                      placeholder="customers/... atau /assets/... (hasil unggah otomatis)"
                      aria-invalid={Boolean(fieldErrors.photoObjectKey)}
                      className={fieldErrors.photoObjectKey ? 'ui-input-invalid' : ''}
                      value={photoObjectKey}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPhotoObjectKey(v);
                        clearField('photoObjectKey');
                        if (v.trim().startsWith('/assets/')) {
                          setPhotoPreviewUrl(v.trim());
                        }
                      }}
                    />
                    <FieldError message={fieldErrors.photoObjectKey} />
                  </label>
                </div>

                <div className="cp-edit-grid-2">
                  <label className="field">
                    <span>Nama Pelanggan / Instansi</span>
                    <input
                      type="text"
                      required
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      className={fieldErrors.fullName ? 'ui-input-invalid' : ''}
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
                  <span>Deskripsi Profil Pelanggan</span>
                  <textarea
                    rows={3}
                    placeholder="Jelaskan profil lokasi, karakteristik gedung/cabang, jam akses teknisi, atau kebutuhan khusus layanan pelanggan..."
                    value={profileDescription}
                    onChange={(e) => setProfileDescription(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Alamat Lengkap Instalasi</span>
                  <input
                    type="text"
                    required
                    aria-invalid={Boolean(fieldErrors.address)}
                    className={fieldErrors.address ? 'ui-input-invalid' : ''}
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      clearField('address');
                    }}
                  />
                  <FieldError message={fieldErrors.address} />
                </label>

                <div className="cp-edit-grid-2">
                  <label className="field">
                    <span>Latitude Pelanggan (Lat)</span>
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
                    <span>Longitude Pelanggan (Lng)</span>
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
              </>
            )}

            {activeTab === 'pic' && (
              <>
                <div className="cp-edit-grid-2">
                  <label className="field">
                    <span>Nama PIC Pelanggan</span>
                    <input
                      type="text"
                      placeholder="Contoh: Hendra Wijaya"
                      value={picName}
                      onChange={(e) => setPicName(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Jabatan / Peran PIC</span>
                    <input
                      type="text"
                      placeholder="Contoh: IT Branch Support / PIC ATM"
                      value={picRole}
                      onChange={(e) => setPicRole(e.target.value)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Nomor Telepon / WhatsApp PIC</span>
                  <input
                    type="tel"
                    placeholder="+62 812-7311-4092"
                    value={picPhone}
                    onChange={(e) => setPicPhone(e.target.value)}
                  />
                </label>
              </>
            )}

            {activeTab === 'technical' && (
              <>
                <div className="cp-edit-grid-2">
                  <label className="field">
                    <span>Kode ODP / Splitter</span>
                    <input
                      type="text"
                      placeholder="ODP-PLB-001"
                      value={splitterCode}
                      onChange={(e) => setSplitterCode(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Port ODP (1-32)</span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      aria-invalid={Boolean(fieldErrors.portNumber)}
                      className={fieldErrors.portNumber ? 'ui-input-invalid' : ''}
                      placeholder="2"
                      value={portNumber}
                      onChange={(e) => {
                        setPortNumber(e.target.value);
                        clearField('portNumber');
                      }}
                    />
                    <FieldError message={fieldErrors.portNumber} />
                  </label>
                </div>

                <div className="cp-edit-grid-2">
                  <label className="field">
                    <span>Redaman OLT (dB / dBm)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="-28.0"
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
                    <span>Redaman ONT (dB / dBm)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="-27.0"
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

                <div className="cp-edit-grid-2">
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
                    <span>Slot OLT</span>
                    <input
                      type="text"
                      placeholder="2@1/7/3.gpon"
                      value={oltSlot}
                      onChange={(e) => setOltSlot(e.target.value)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>SN Modem ONT</span>
                  <input
                    type="text"
                    placeholder="rcmginds183"
                    value={ontSn}
                    onChange={(e) => setOntSn(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Note Activity Terakhir</span>
                  <textarea
                    rows={3}
                    placeholder="Contoh: Kabel nya ketabrak, masih ada PR perlu pergantian kabel dropcore..."
                    value={lastActivityNote}
                    onChange={(e) => setLastActivityNote(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Catatan Integrasi Datek (Opsional)</span>
                  <input
                    type="text"
                    placeholder="Catatan teknis tambahan dari datek"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>

          <footer className="modal-footer">
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
          </footer>
        </form>
      </article>
    </ModalOverlay>
  );
}
