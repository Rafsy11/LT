import { z } from 'zod';

// ==========================================
// 1. READ TOOLS (Eksekusi Otomatis, LIMIT <= 50, Cluster Scoped)
// ==========================================

export const getRecentReportsToolSchema = z.object({
  clusterCode: z.string().optional().describe('Filter laporan berdasarkan kode cluster (misal: CL-01)'),
  minAttenuation: z.number().optional().describe('Ambil redaman yang lebih buruk dari nilai ini (misal -25.0 dBm)'),
  limit: z.number().int().min(1).max(50).default(20).describe('Batas jumlah data (maksimal 50 baris untuk menjaga context window LLM)'),
});

export type GetRecentReportsInput = z.infer<typeof getRecentReportsToolSchema>;

export const getCustomerDetailToolSchema = z.object({
  siaNumber: z.string().optional().describe('Nomor SIA unik pelanggan (misal: 100245)'),
  customerName: z.string().optional().describe('Nama lengkap atau sebagian dari pelanggan'),
});

export type GetCustomerDetailInput = z.infer<typeof getCustomerDetailToolSchema>;

export const getTechnicianWorkloadToolSchema = z.object({
  clusterCode: z.string().optional().describe('Filter teknisi di cluster tertentu'),
  status: z.enum(['ALL', 'IDLE', 'BUSY']).optional().default('ALL').describe('Filter status kesibukan teknisi'),
});

export type GetTechnicianWorkloadInput = z.infer<typeof getTechnicianWorkloadToolSchema>;

// ==========================================
// 2. WRITE TOOLS (Wajib Draf Konfirmasi / Human-in-the-Loop)
// DILARANG melakukan mutasi database langsung di dalam tool handler!
// ==========================================

export const prepareCreateTicketToolSchema = z.object({
  ticketType: z.enum(['PSB', 'MAINTENANCE']).describe('Tipe pekerjaan tiket (PSB untuk Pasang Baru, MAINTENANCE untuk Perbaikan)'),
  siaNumber: z.string().min(3).describe('Nomor SIA pelanggan terkait'),
  customerName: z.string().optional().describe('Nama lengkap pelanggan'),
  techUsername: z.string().min(2).describe('Username teknisi yang akan ditugaskan'),
  notes: z.string().optional().describe('Catatan instruksi perbaikan untuk teknisi'),
});

export type PrepareCreateTicketInput = z.infer<typeof prepareCreateTicketToolSchema>;

export const prepareToggleTechAccountToolSchema = z.object({
  techUsername: z.string().min(2).describe('Username teknisi yang akan diubah statusnya'),
  setActive: z.boolean().describe('true untuk mengaktifkan kembali, false untuk menonaktifkan & cabut sesi JWT aktif'),
  reason: z.string().min(3).describe('Alasan audit pencabutan sesi atau penonaktifan akun'),
});

export type PrepareToggleTechAccountInput = z.infer<typeof prepareToggleTechAccountToolSchema>;

export const prepareMutateSplitterPortToolSchema = z.object({
  siaNumber: z.string().min(3).describe('Nomor SIA pelanggan yang portnya akan dipindahkan'),
  newSplitterCode: z.string().min(2).describe('Kode splitter ODP tujuan (misal: ODP-CL01-01)'),
  newPortNumber: z.number().int().min(1).max(32).describe('Nomor port tujuan pada splitter target'),
});

export type PrepareMutateSplitterPortInput = z.infer<typeof prepareMutateSplitterPortToolSchema>;

// ==========================================
// 3. HUMAN-IN-THE-LOOP ACTION CONFIRMATION SCHEMA
// Dieksekusi hanya saat Admin menekan tombol [Approve & Execute] di Web UI
// ==========================================

export const confirmActionSchema = z.object({
  actionToken: z.string().min(1, 'actionToken wajib disertakan untuk validasi integritas draf'),
  actionType: z.enum(['CREATE_TICKET', 'TOGGLE_TECH_ACCOUNT', 'MUTATE_SPLITTER_PORT']),
  payload: z.record(z.unknown()),
});

export type ConfirmActionInput = z.infer<typeof confirmActionSchema>;

export const draftActionCardSchema = z.object({
  requiresConfirmation: z.literal(true),
  actionType: z.enum(['CREATE_TICKET', 'TOGGLE_TECH_ACCOUNT', 'MUTATE_SPLITTER_PORT']),
  title: z.string(),
  summary: z.string(),
  actionToken: z.string(),
  payload: z.record(z.unknown()),
});

export type DraftActionCard = z.infer<typeof draftActionCardSchema>;
