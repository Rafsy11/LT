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
