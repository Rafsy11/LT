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

export const techErrorLogSchema = z
  .object({
    errorMessage: z.string().trim().max(2000).optional(),
    message: z.string().trim().max(2000).optional(),
    appVersion: z.string().trim().max(64).nullable().optional(),
    deviceInfo: z.string().trim().max(200).nullable().optional(),
    stackTrace: z.string().max(8000).nullable().optional(),
    stack: z.string().max(8000).nullable().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        (data.errorMessage && data.errorMessage.length > 0) ||
          (data.message && data.message.length > 0),
      ),
    {
      message: 'errorMessage wajib disertakan dan tidak boleh kosong.',
      path: ['errorMessage'],
    },
  );

export type TechErrorLogInput = z.infer<typeof techErrorLogSchema>;
