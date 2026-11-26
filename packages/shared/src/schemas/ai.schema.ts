import { z } from 'zod';

// Read tool schemas (auto-executed, capped at 50 rows, cluster-scoped)

export const getRecentReportsToolSchema = z.object({
  clusterCode: z
    .string()
    .optional()
    .describe(
      'Opsional: isi HANYA jika pengguna menyebut kode cluster secara eksplisit. Kosongkan untuk semua cluster.',
    ),
  minAttenuation: z
    .number()
    .optional()
    .describe(
      'Opsional: isi HANYA jika pengguna meminta ambang batas dBm tertentu. Kosongkan untuk menampilkan semua anomali Warning & Critical.',
    ),
  ticketStatus: z
    .enum(['ALL', 'ACTIVE', 'OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED'])
    .optional()
    .describe('Opsional: filter status tiket (kosongkan atau ALL untuk semua status)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Batas jumlah data (default 20, maksimal 50 baris)'),
});

export type GetRecentReportsInput = z.infer<typeof getRecentReportsToolSchema>;

export const getCustomerDetailToolSchema = z.object({
  siaNumber: z.string().optional().describe('Nomor SIA unik pelanggan (misal: 2024437353)'),
  customerName: z.string().optional().describe('Nama lengkap atau sebagian dari pelanggan'),
});

export type GetCustomerDetailInput = z.infer<typeof getCustomerDetailToolSchema>;

export const searchCustomersToolSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('Kata kunci pencarian nama pelanggan, nomor SIA, alamat, atau kode ODP'),
  clusterCode: z
    .string()
    .optional()
    .describe('Filter pelanggan berdasarkan kode cluster (misal: PLBBSGGA01)'),
  attenuationStatus: z
    .enum(['ALL', 'CRITICAL', 'WARNING', 'NORMAL'])
    .optional()
    .describe('Filter berdasarkan status redaman optik (CRITICAL < -28 dBm, WARNING -25.1 s/d -28 dBm)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Batas jumlah hasil pelanggan (default 10, maksimal 20)'),
});

export type SearchCustomersInput = z.infer<typeof searchCustomersToolSchema>;

export const getSplitterStatusToolSchema = z.object({
  splitterCode: z
    .string()
    .optional()
    .describe('Kode ODP/Splitter tertentu (misal: ODP-PLB-035)'),
  clusterCode: z
    .string()
    .optional()
    .describe('Filter ODP/Splitter berdasarkan kode cluster (misal: PLBBSGGA01)'),
  onlyAvailable: z
    .boolean()
    .optional()
    .describe('true untuk hanya menampilkan ODP yang masih memiliki port kosong'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Batas jumlah ODP yang ditampilkan (default 10, maksimal 20)'),
});

export type GetSplitterStatusInput = z.infer<typeof getSplitterStatusToolSchema>;

export const getTechnicianWorkloadToolSchema = z.object({
  clusterCode: z
    .string()
    .optional()
    .describe(
      'Opsional: isi HANYA jika pengguna menyebut cluster tertentu. Kosongkan untuk semua teknisi di semua cluster.',
    ),
  status: z
    .enum(['ALL', 'IDLE', 'BUSY'])
    .optional()
    .describe(
      'Opsional: kosongkan atau isi ALL agar semua teknisi (IDLE dan BUSY) ditampilkan.',
    ),
});

export type GetTechnicianWorkloadInput = z.infer<typeof getTechnicianWorkloadToolSchema>;

// Write tool schemas (human-in-the-loop drafts only; never mutate DB directly)

export const prepareCreateTicketToolSchema = z.object({
  ticketType: z
    .enum(['PSB', 'MAINTENANCE'])
    .describe('Tipe pekerjaan tiket (PSB untuk Pasang Baru, MAINTENANCE untuk Perbaikan)'),
  siaNumber: z.string().min(3).describe('Nomor SIA pelanggan terkait'),
  customerName: z.string().optional().describe('Nama lengkap pelanggan'),
  techUsername: z.string().min(2).describe('Username teknisi yang akan ditugaskan'),
  notes: z
    .string()
    .optional()
    .describe(
      'Opsional: catatan instruksi khusus yang disebut pengguna untuk pelanggan INI saja. Kosongkan jika pengguna tidak menyebutkan catatan (JANGAN menyalin keluhan pelanggan lain).',
    ),
});

export type PrepareCreateTicketInput = z.infer<typeof prepareCreateTicketToolSchema>;

export const prepareToggleTechAccountToolSchema = z.object({
  techUsername: z.string().min(2).describe('Username teknisi yang akan diubah statusnya'),
  setActive: z
    .boolean()
    .describe('true untuk mengaktifkan kembali, false untuk menonaktifkan & cabut sesi JWT aktif'),
  reason: z.string().min(3).describe('Alasan audit pencabutan sesi atau penonaktifan akun'),
});

export type PrepareToggleTechAccountInput = z.infer<typeof prepareToggleTechAccountToolSchema>;

export const prepareMutateSplitterPortToolSchema = z.object({
  siaNumber: z.string().min(3).describe('Nomor SIA pelanggan yang portnya akan dipindahkan'),
  newSplitterCode: z.string().min(2).describe('Kode splitter ODP tujuan (misal: ODP-CL01-01)'),
  newPortNumber: z.number().int().min(1).max(32).describe('Nomor port tujuan pada splitter target'),
});

export type PrepareMutateSplitterPortInput = z.infer<typeof prepareMutateSplitterPortToolSchema>;

// Action confirmation schema executed only after explicit admin approval in Web UI

export const confirmActionSchema = z.object({
  actionToken: z.string().min(1, 'actionToken wajib disertakan untuk validasi integritas draf'),
  actionType: z.enum(['CREATE_TICKET', 'TOGGLE_TECH_ACCOUNT', 'MUTATE_SPLITTER_PORT']),
  payload: z.record(z.string(), z.unknown()),
});

export type ConfirmActionInput = z.infer<typeof confirmActionSchema>;

export const draftActionCardSchema = z.object({
  requiresConfirmation: z.literal(true),
  actionType: z.enum(['CREATE_TICKET', 'TOGGLE_TECH_ACCOUNT', 'MUTATE_SPLITTER_PORT']),
  title: z.string(),
  summary: z.string(),
  actionToken: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type DraftActionCard = z.infer<typeof draftActionCardSchema>;

export const aiChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export type AiChatHistoryItem = z.infer<typeof aiChatHistoryItemSchema>;
