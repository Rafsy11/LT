import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().trim().min(3, 'Username minimal 3 karakter').max(50),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  deviceId: z.string().min(1, 'Device ID diperlukan untuk autentikasi mobile').optional(),
  deviceModel: z.string().max(100).optional(),
  appVersion: z.string().max(20).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token wajib disertakan'),
  deviceId: z.string().min(1, 'Device ID wajib disertakan'),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

export const logoutRequestSchema = z.object({
  deviceId: z.string().optional(),
});

export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  role: z.string(),
  userType: z.enum(['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN']),
  hierarchyLevel: z.number().int(),
  assignedClusters: z.array(z.string()),
  isActive: z.boolean(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: userProfileSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const verifyOtpRequestSchema = z.object({
  preAuthToken: z.string().min(10, 'Token tantangan 2FA tidak valid'),
  otpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Kode OTP harus terdiri dari 6 digit angka'),
});

export type VerifyOtpRequest = z.infer<typeof verifyOtpRequestSchema>;

export const resendOtpRequestSchema = z.object({
  preAuthToken: z.string().min(10, 'Token tantangan 2FA tidak valid'),
});

export type ResendOtpRequest = z.infer<typeof resendOtpRequestSchema>;

