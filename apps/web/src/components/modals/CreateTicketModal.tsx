'use client';

import React, { useState } from 'react';
import { CreateTicketInput } from '@isp/shared';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTicketInput) => Promise<void> | void;
}

export function CreateTicketModal({ isOpen, onClose, onSubmit }: CreateTicketModalProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);

    const payload: CreateTicketInput = {
      customerName: String(form.get('customerName')),
      siaNumber: String(form.get('siaNumber')),
      ticketType: (form.get('ticketType') as any) || 'PSB',
      clusterCode: String(form.get('clusterCode')),
      assignedTechUsername: String(form.get('assignedTechUsername') || 'Andi Pratama'),
      adminNotes: String(form.get('adminNotes') || ''),
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      alert(`Gagal membuat tiket: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <h2>Buat tiket baru</h2>
          <button className="dots" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <label>
            Nama pelanggan
            <input name="customerName" required placeholder="Nama lengkap pelanggan" />
          </label>
          <label>
            Nomor SIA
            <input name="siaNumber" required placeholder="Contoh: 100246" />
          </label>
          <label>
            Tipe pekerjaan
            <select name="ticketType">
              <option value="PSB">PSB · Pasang baru</option>
              <option value="MAINTENANCE">MAINTENANCE · Perbaikan redaman/gangguan</option>
            </select>
          </label>
          <label>
            Cluster target
            <select name="clusterCode">
              <option value="Bandung Utara">Bandung Utara (CL-01)</option>
              <option value="Bandung Timur">Bandung Timur (CL-02)</option>
              <option value="Bandung Barat">Bandung Barat (CL-03)</option>
              <option value="Bandung Selatan">Bandung Selatan (CL-04)</option>
            </select>
          </label>
          <label>
            Tugaskan ke teknisi
            <select name="assignedTechUsername">
              <option value="Andi Pratama">Andi Pratama (Bandung Utara)</option>
              <option value="Rizky Maulana">Rizky Maulana (Bandung Timur)</option>
              <option value="Fajar Hidayat">Fajar Hidayat (Bandung Barat)</option>
              <option value="Dimas Saputra">Dimas Saputra (Bandung Selatan)</option>
            </select>
          </label>
          <label>
            Catatan admin (opsional)
            <input name="adminNotes" placeholder="Instruksi khusus untuk teknisi..." />
          </label>
          <button className="button primary" disabled={submitting} type="submit">
            {submitting ? 'Memproses...' : 'Buat & Tugaskan Tiket'}
          </button>
        </form>
      </div>
    </div>
  );
}
