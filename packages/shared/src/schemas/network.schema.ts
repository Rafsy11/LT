import { z } from 'zod';

export const clusterSchema = z.object({
  id: z.string().uuid(),
  clusterCode: z.string().min(2),
  name: z.string().min(2),
  centerLat: z.number(),
  centerLng: z.number(),
  isActive: z.boolean(),
});

export type ClusterData = z.infer<typeof clusterSchema>;

export const splitterSchema = z.object({
  id: z.string().uuid(),
  clusterId: z.string().uuid(),
  splitterCode: z.string().min(2),
  lat: z.number(),
  lng: z.number(),
  maxPorts: z.number().int().min(4).max(64),
  isActive: z.boolean(),
});

export type SplitterData = z.infer<typeof splitterSchema>;

export const portAllocationSchema = z.object({
  portNumber: z.number().int().min(1).max(32),
  isOccupied: z.boolean(),
  customerId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  siaNumber: z.string().optional(),
});

export type PortAllocation = z.infer<typeof portAllocationSchema>;

export const createClusterSchema = z.object({
  clusterCode: z
    .string()
    .trim()
    .min(2, 'Kode cluster minimal 2 karakter')
    .max(20, 'Kode cluster maksimal 20 karakter'),
  name: z.string().trim().min(2, 'Nama wilayah minimal 2 karakter').max(80),
  centerLat: z.coerce.number().min(-90).max(90),
  centerLng: z.coerce.number().min(-180).max(180),
});

export type CreateClusterInput = z.infer<typeof createClusterSchema>;

export const createSplitterSchema = z.object({
  clusterCode: z.string().trim().min(2, 'Cluster wajib dipilih'),
  splitterCode: z.string().trim().min(3, 'Kode ODP minimal 3 karakter').max(32),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  maxPorts: z.coerce.number().int().refine((v) => v === 8 || v === 16 || v === 32, {
    message: 'Kapasitas splitter harus 8, 16, atau 32 port',
  }),
});

export type CreateSplitterInput = z.infer<typeof createSplitterSchema>;

export const updateSplitterSchema = z.object({
  splitterCode: z.string().trim().min(3).max(32),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  maxPorts: z.coerce
    .number()
    .int()
    .refine((v) => v === 8 || v === 16 || v === 32)
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSplitterInput = z.infer<typeof updateSplitterSchema>;
