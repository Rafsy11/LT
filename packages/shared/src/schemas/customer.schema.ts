import { z } from 'zod';

export const customerQuerySchema = z.object({
  cluster: z.string().optional(),
  status: z.enum(['PENDING_INSTALL', 'ACTIVE', 'ISOLATED', 'DISMANTLED', 'ALL']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export const mutatePortSchema = z.object({
  siaNumber: z.string().trim().min(3, 'Nomor SIA minimal 3 karakter'),
  newSplitterCode: z.string().trim().min(2, 'Kode splitter baru wajib diisi'),
  newPortNumber: z.number().int().min(1).max(32, 'Nomor port harus antara 1 sampai 32'),
  reason: z.string().max(255).optional(),
});

export type MutatePortInput = z.infer<typeof mutatePortSchema>;

export const customerDetailResponseSchema = z.object({
  id: z.string().uuid(),
  siaNumber: z.string(),
  fullName: z.string(),
  address: z.string(),
  clusterId: z.string(),
  splitterId: z.string().nullable(),
  portNumber: z.number().int().nullable(),
  currentAttenuation: z.number().nullable(),
  status: z.enum(['PENDING_INSTALL', 'ACTIVE', 'ISOLATED', 'DISMANTLED']),
  gponNode: z.string().nullable().optional(),
  oltSlot: z.string().nullable().optional(),
  ontSn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  updatedAt: z.string(),
});

const SAFE_PHOTO_REF_RE = /^(?:https:\/\/[^\s"'<>]+|\/assets\/[a-zA-Z0-9._/-]+|customers\/[a-zA-Z0-9._/-]+|proofs\/[a-zA-Z0-9._/-]+)$/;

const optionalNullableString = (max: number) =>
  z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(max).nullable().optional(),
  );

const optionalNullableAttenuation = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return val === undefined ? undefined : null;
    return Number(val);
  },
  z
    .number()
    .min(-50, 'Nilai redaman tidak boleh kurang dari -50 dBm')
    .max(5, 'Nilai redaman tidak boleh lebih dari 5 dBm')
    .nullable()
    .optional(),
);

const optionalNullableCoord = (min: number, max: number, label: string) =>
  z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return val === undefined ? undefined : null;
      return Number(val);
    },
    z.number().min(min, `${label} tidak valid`).max(max, `${label} tidak valid`).nullable().optional(),
  );

const optionalSafePhotoRef = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
  z
    .string()
    .trim()
    .max(500)
    .refine((val) => !val.includes('..') && SAFE_PHOTO_REF_RE.test(val), {
      message: 'Referensi foto harus berupa key MinIO yang sah atau URL HTTPS.',
    })
    .nullable()
    .optional(),
);

export const createCustomerSchema = z.object({
  siaNumber: z.string().trim().min(3, 'Nomor SIA minimal 3 karakter').max(40),
  fullName: z.string().trim().min(2, 'Nama pelanggan minimal 2 karakter').max(160),
  address: z.string().trim().min(5, 'Alamat instalasi minimal 5 karakter').max(400),
  lat: optionalNullableCoord(-90, 90, 'Latitude'),
  lng: optionalNullableCoord(-180, 180, 'Longitude'),
  clusterCode: z.string().trim().min(2, 'Cluster wajib dipilih'),
  splitterCode: z.string().trim().optional(),
  portNumber: z.coerce.number().int().min(1).max(32).optional(),
  status: z.enum(['PENDING_INSTALL', 'ACTIVE', 'ISOLATED', 'DISMANTLED']).default('PENDING_INSTALL'),
  picName: optionalNullableString(120),
  picPhone: optionalNullableString(40),
  picRole: optionalNullableString(80),
  profileDescription: optionalNullableString(2000),
  photoObjectKey: optionalSafePhotoRef,
  photoCaption: optionalNullableString(240),
  oltAttenuation: optionalNullableAttenuation,
  ontAttenuation: optionalNullableAttenuation,
  lastActivityNote: optionalNullableString(1000),
  gponNode: optionalNullableString(80),
  oltSlot: optionalNullableString(80),
  ontSn: optionalNullableString(80),
  notes: optionalNullableString(1000),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  siaNumber: z.string().trim().min(3),
  fullName: z.string().trim().min(2, 'Nama pelanggan minimal 2 karakter').max(160).optional(),
  address: z.string().trim().min(5, 'Alamat instalasi minimal 5 karakter').max(400).optional(),
  lat: optionalNullableCoord(-90, 90, 'Latitude'),
  lng: optionalNullableCoord(-180, 180, 'Longitude'),
  status: z.enum(['PENDING_INSTALL', 'ACTIVE', 'ISOLATED', 'DISMANTLED']).optional(),
  splitterCode: optionalNullableString(60),
  portNumber: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return val === undefined ? undefined : null;
      return Number(val);
    },
    z.number().int().min(1, 'Port minimal 1').max(32, 'Port maksimal 32').nullable().optional(),
  ),
  picName: optionalNullableString(120),
  picPhone: optionalNullableString(40),
  picRole: optionalNullableString(80),
  profileDescription: optionalNullableString(2000),
  photoObjectKey: optionalSafePhotoRef,
  photoCaption: optionalNullableString(240),
  oltAttenuation: optionalNullableAttenuation,
  ontAttenuation: optionalNullableAttenuation,
  lastActivityNote: optionalNullableString(1000),
  gponNode: optionalNullableString(80),
  oltSlot: optionalNullableString(80),
  ontSn: optionalNullableString(80),
  notes: optionalNullableString(1000),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
