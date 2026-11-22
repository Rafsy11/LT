import { z } from 'zod';

// Admin ticket dispatch schemas (PSB and maintenance)

export const createTicketSchema = z.object({
  ticketType: z.enum(['PSB', 'MAINTENANCE'], {
    error: (issue) =>
      issue.input === undefined
        ? 'Tipe tiket wajib dipilih (PSB atau MAINTENANCE)'
        : 'Tipe tiket harus PSB atau MAINTENANCE',
  }),
  customerName: z.string().trim().min(2, 'Nama pelanggan minimal 2 karakter').max(100),
  siaNumber: z.string().trim().min(3, 'Nomor SIA minimal 3 karakter').max(30),
  clusterCode: z.string().trim().min(2, 'Cluster wajib dipilih'),
  assignedTechUsername: z.string().trim().min(2, 'Vendor / teknisi wajib ditugaskan'),
  vendorName: z.string().trim().max(120).optional(),
  complaintSummary: z.string().trim().max(1000).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  serviceAddress: z.string().trim().max(300).optional(),
  locationPlace: z.string().trim().max(160).optional(),
  targetLat: z.coerce.number().min(-90, 'Latitude tidak valid').max(90, 'Latitude tidak valid').optional(),
  targetLng: z.coerce.number().min(-180, 'Longitude tidak valid').max(180, 'Longitude tidak valid').optional(),
  adminNotes: z.string().max(500).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const startTicketExecutionSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  checkInLat: z.coerce.number().min(-90).max(90).optional(),
  checkInLng: z.coerce.number().min(-180).max(180).optional(),
  channel: z.enum(['WEB', 'MOBILE', 'TELEGRAM']).default('WEB'),
});

export type StartTicketExecutionInput = z.infer<typeof startTicketExecutionSchema>;

export const dispatchTicketSchema = z.object({
  assignedTechUsername: z.string().trim().min(2).optional(),
  vendorName: z.string().trim().max(120).optional(),
  complaintSummary: z.string().trim().max(1000).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  serviceAddress: z.string().trim().max(300).optional(),
  locationPlace: z.string().trim().max(160).optional(),
  targetLat: z.coerce.number().min(-90).max(90).optional(),
  targetLng: z.coerce.number().min(-180).max(180).optional(),
  adminNotes: z.string().max(500).optional(),
});

export type DispatchTicketInput = z.infer<typeof dispatchTicketSchema>;

// Field technician submission schema (server timestamp and UUID idempotency key)

export const SAFE_TICKET_PHOTO_KEY_RE =
  /^(?:opm-proofs|proofs)\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/;

export const submitTicketSchema = z.object({
  submissionId: z.uuid({
    version: 'v4',
    error: 'submission_id wajib berupa UUID v4 yang valid (Idempotency Key)',
  }),
  splitterId: z.string().min(1, 'splitter_id wajib disertakan'),
  portNumber: z.number().int().min(1, 'port_number minimal 1').max(32, 'port_number maksimal 32'),
  attenuationDbm: z
    .number()
    .min(-40.0, 'Nilai redaman tidak valid (terlalu rendah)')
    .max(5.0, 'Nilai redaman tidak valid (terlalu tinggi)'),
  photoObjectKey: z
    .string()
    .trim()
    .min(1, 'photo_object_key dari MinIO wajib disertakan sebagai bukti OPM')
    .max(500, 'photoObjectKey maksimal 500 karakter')
    .refine(
      (val) => !val.includes('..') && SAFE_TICKET_PHOTO_KEY_RE.test(val),
      'photoObjectKey wajib berupa path objek MinIO yang valid (opm-proofs/ atau proofs/) tanpa karakter traversal.',
    ),
  submittedLat: z.number().min(-90.0).max(90.0, 'Latitude tidak valid'),
  submittedLng: z.number().min(-180.0).max(180.0, 'Longitude tidak valid'),
  isMockLocation: z.boolean().default(false), // Flag anti-fake GPS
  accuracyMeters: z.number().positive().optional(),
  clientRecordedAt: z.iso.datetime().optional(),
  technicianNotes: z.string().max(1000).optional(),
  channel: z.enum(['WEB', 'MOBILE', 'TELEGRAM']).optional(),
  deviceIntegrityToken: z.string().min(8).max(4096).optional(),
});

export type SubmitTicketInput = z.infer<typeof submitTicketSchema>;

// Ticket filter and pagination query schema

export const ticketQuerySchema = z.object({
  cluster: z.string().optional(),
  status: z
    .enum([
      'OPEN',
      'IN_PROGRESS',
      'PENDING_APPROVAL',
      'COMPLETED',
      'CANCELLED',
      'Semua',
      'Menunggu',
      'Dalam proses',
      'Menunggu verifikasi',
      'Selesai',
    ])
    .optional(),
  query: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  page: z.coerce.number().min(1).default(1),
});

export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type TicketQueryInput = z.input<typeof ticketQuerySchema>;
