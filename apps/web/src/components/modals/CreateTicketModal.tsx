'use client';

import React, { useState, useRef } from 'react';
import { CreateTicketInput } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth-context';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTicketInput) => Promise<void> | void;
  initialValues?: Partial<CreateTicketInput>;
}

export function CreateTicketModal({ isOpen, onClose, onSubmit, initialValues }: CreateTicketModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { showSuccess, showError } = useToast();
  const { canCreateTicket } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 1. Permission Matrix check (Requirement 3)
    if (!canCreateTicket) {
      showError({ code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses (ticket:create) untuk membuat tiket baru.' });
      return;
    }

    // 2. Debounce & instant millisecond locking (Requirement 2)
    if (submittingRef.current) return;
    submittingRef.current = true;
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
      showSuccess(`Tiket untuk pelanggan ${payload.customerName} (${payload.siaNumber}) berhasil dibuat & ditugaskan.`);
      onClose();
    } catch (err: unknown) {
      // 3. Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      showError(err);
    } finally {
      submittingRef.current = false;
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

        {!canCreateTicket && (
          <div className="permission-lock-notice" style={{ margin: '16px 20px', padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b' }}>
            <b>Akses Dibatasi:</b> Akun Anda tidak memiliki izin <code>ticket:create</code>. Tombol pembuatan tiket dikunci demi keamanan.
          </div>
        )}

        <form className="modal-body" onSubmit={handleSubmit}>
          <label>
            Nama pelanggan
            <input
              name="customerName"
              required
              defaultValue={initialValues?.customerName || ''}
              placeholder="Nama lengkap pelanggan"
              disabled={!canCreateTicket || submitting}
            />
          </label>
          <label>
            Nomor SIA
            <input
              name="siaNumber"
              required
              defaultValue={initialValues?.siaNumber || ''}
              placeholder="Contoh: 100246"
              disabled={!canCreateTicket || submitting}
            />
          </label>
          <label>
            Tipe pekerjaan
            <select
              name="ticketType"
              defaultValue={initialValues?.ticketType || 'PSB'}
              disabled={!canCreateTicket || submitting}
            >
              <option value="PSB">PSB · Pasang baru</option>
              <option value="MAINTENANCE">MAINTENANCE · Perbaikan redaman/gangguan</option>
            </select>
          </label>
          <label>
            Cluster target
            <select
              name="clusterCode"
              defaultValue={initialValues?.clusterCode || 'Bandung Utara'}
              disabled={!canCreateTicket || submitting}
            >
              <option value="Bandung Utara">Bandung Utara (CL-01)</option>
              <option value="Bandung Timur">Bandung Timur (CL-02)</option>
              <option value="Bandung Barat">Bandung Barat (CL-03)</option>
              <option value="Bandung Selatan">Bandung Selatan (CL-04)</option>
            </select>
          </label>
          <label>
            Tugaskan ke teknisi
            <select
              name="assignedTechUsername"
              defaultValue={initialValues?.assignedTechUsername || 'Andi Pratama'}
              disabled={!canCreateTicket || submitting}
            >
              <option value="Andi Pratama">Andi Pratama (Bandung Utara)</option>
              <option value="Rizky Maulana">Rizky Maulana (Bandung Timur)</option>
              <option value="Fajar Hidayat">Fajar Hidayat (Bandung Barat)</option>
              <option value="Dimas Saputra">Dimas Saputra (Bandung Selatan)</option>
            </select>
          </label>
          <label>
            Catatan admin (opsional)
            <input
              name="adminNotes"
              defaultValue={initialValues?.adminNotes || ''}
              placeholder="Instruksi khusus untuk teknisi..."
              disabled={!canCreateTicket || submitting}
            />
          </label>
          <button className="button primary" disabled={submitting || !canCreateTicket} type="submit">
            {submitting ? 'Memproses Transaksi...' : 'Buat & Tugaskan Tiket'}
          </button>
        </form>
      </div>
    </div>
  );
}
