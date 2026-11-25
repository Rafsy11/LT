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

// Mobile technician tickets & history audit schemas (strictly TECHNICIAN-scoped)

export const MOBILE_HISTORY_LIMIT = 50;

export const mobileTicketQuerySchema = z.object({
  historyLimit: z.coerce
    .number()
    .int('historyLimit harus berupa bilangan bulat')
    .min(1, 'historyLimit minimal 1')
    .max(MOBILE_HISTORY_LIMIT, `historyLimit maksimal ${MOBILE_HISTORY_LIMIT}`)
    .default(MOBILE_HISTORY_LIMIT),
});

export type MobileTicketQuery = z.infer<typeof mobileTicketQuerySchema>;

export const SAFE_MOBILE_PRESIGN_KEY_RE =
  /^(?:opm-proofs|proofs|seed)\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/;

export const mobileMediaPresignQuerySchema = z.object({
  ticketId: z
    .string()
    .trim()
    .min(1, 'Parameter ticketId wajib disertakan')
    .max(120, 'Parameter ticketId terlalu panjang'),
  key: z
    .string()
    .trim()
    .min(1, 'Parameter key foto OPM wajib disertakan')
    .max(500, 'Parameter key foto terlalu panjang')
    .refine(
      (val) =>
        !val.includes('..') &&
        !val.includes('\\') &&
        !val.includes('%') &&
        !val.includes('?') &&
        !val.includes('#') &&
        !/[\x00-\x1f\x7f]/.test(val) &&
        !val.startsWith('/') &&
        SAFE_MOBILE_PRESIGN_KEY_RE.test(val),
      'Key objek media tidak valid atau berada di luar direktori bukti OPM yang diizinkan.',
    ),
});

export type MobileMediaPresignQuery = z.infer<typeof mobileMediaPresignQuerySchema>;

export const mobileTicketAdminActorSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
});

export type MobileTicketAdminActor = z.infer<typeof mobileTicketAdminActorSchema>;

export const mobileTicketAssignedTechSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  vendorCompany: z.string().nullable().optional(),
});

export type MobileTicketAssignedTech = z.infer<typeof mobileTicketAssignedTechSchema>;

export const mobileTicketHistoryMetaSchema = z.object({
  oldAttenuation: z.number().nullable(),
  newAttenuation: z.number().nullable(),
  photoObjectKey: z.string().nullable(),
  technicianNotes: z.string().nullable(),
  submissionChannel: z.enum(['WEB', 'MOBILE', 'TELEGRAM']).nullable(),
  submittedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
});

export type MobileTicketHistoryMeta = z.infer<typeof mobileTicketHistoryMetaSchema>;

export const mobileTicketCustomerSchema = z.object({
  id: z.string(),
  siaNumber: z.string(),
  fullName: z.string(),
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  currentAttenuation: z.number().nullable(),
  attenuationHistory: z.array(z.number()).optional(),
  clusterName: z.string(),
  clusterCode: z.string(),
  splitterCode: z.string().nullable(),
  portNumber: z.number().int().nullable(),
});

export type MobileTicketCustomer = z.infer<typeof mobileTicketCustomerSchema>;

export const mobilePendingSubmissionSchema = z.object({
  submissionId: z.string(),
  splitterId: z.string(),
  splitterCode: z.string(),
  portNumber: z.number().int(),
  attenuationDbm: z.number(),
  photoObjectKey: z.string(),
  photoUrl: z.string().optional(),
  submittedLat: z.number(),
  submittedLng: z.number(),
  distanceToSplitterM: z.number(),
  isLocationFlagged: z.boolean(),
  clientRecordedAt: z.string().optional(),
  technicianNotes: z.string().optional(),
  channel: z.enum(['WEB', 'MOBILE', 'TELEGRAM']).optional(),
  submittedAt: z.string(),
  techUsername: z.string(),
  techFullName: z.string(),
});

export const mobileTicketItemSchema = z.object({
  id: z.string(),
  ticketNumber: z.string(),
  ticketType: z.enum(['PSB', 'MAINTENANCE']),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED']),
  vendorName: z.string().nullable().optional(),
  complaintSummary: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  serviceAddress: z.string().optional(),
  locationPlace: z.string().nullable().optional(),
  targetLat: z.number().nullable().optional(),
  targetLng: z.number().nullable().optional(),
  adminNotes: z.string().nullable(),
  rejectionReason: z.string().nullable().optional(),
  assignedAt: z.string().nullable(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  createdByAdmin: mobileTicketAdminActorSchema.nullable().optional(),
  assignedTech: mobileTicketAssignedTechSchema.nullable().optional(),
  pendingSubmission: mobilePendingSubmissionSchema.nullable().optional(),
  historyMeta: mobileTicketHistoryMetaSchema.nullable().optional(),
  customer: mobileTicketCustomerSchema,
});

export type MobileTicketItemDto = z.infer<typeof mobileTicketItemSchema>;

export const mobileSplitterItemSchema = z.object({
  id: z.string(),
  splitterCode: z.string(),
  clusterName: z.string(),
  clusterCode: z.string(),
  lat: z.number(),
  lng: z.number(),
  maxPorts: z.number().int(),
  occupiedPorts: z.array(z.number().int()),
  availablePorts: z.array(z.number().int()),
});

export type MobileSplitterItemDto = z.infer<typeof mobileSplitterItemSchema>;

export const mobileTechTicketsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    tickets: z.array(mobileTicketItemSchema),
    historyTickets: z.array(mobileTicketItemSchema),
    splitters: z.array(mobileSplitterItemSchema),
  }),
  meta: z.object({
    activeTicketsCount: z.number().int(),
    historyTicketsCount: z.number().int(),
    historyTotalCount: z.number().int(),
    historyLimit: z.number().int(),
    splittersCount: z.number().int(),
  }),
});

export type MobileTechTicketsResponse = z.infer<typeof mobileTechTicketsResponseSchema>;

export const mobileMediaPresignResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    key: z.string(),
    url: z.string(),
    isMockFallback: z.boolean(),
  }),
});

export type MobileMediaPresignResponse = z.infer<typeof mobileMediaPresignResponseSchema>;
