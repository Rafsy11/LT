import { z } from 'zod';

export const toggleTechAccountSchema = z.object({
  techUsername: z.string().trim().min(2, 'Username teknisi minimal 2 karakter'),
  isActive: z.boolean(),
  reason: z.string().trim().min(3, 'Alasan perubahan status akun minimal 3 karakter').max(255),
});

export type ToggleTechAccountInput = z.infer<typeof toggleTechAccountSchema>;

export const technicianWorkloadQuerySchema = z.object({
  clusterCode: z.string().optional(),
  status: z.enum(['ALL', 'IDLE', 'BUSY']).optional().default('ALL'),
});

export type TechnicianWorkloadQuery = z.infer<typeof technicianWorkloadQuerySchema>;
