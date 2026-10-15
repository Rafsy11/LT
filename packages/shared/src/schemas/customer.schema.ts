import { z } from 'zod';

export const customerQuerySchema = z.object({
  cluster: z.string().optional(),
  status: z.enum(['PENDING_INSTALL', 'ACTIVE', 'ISOLATED', 'DISMANTLED', 'ALL']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
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
  updatedAt: z.string(),
});
