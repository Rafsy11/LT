import { z } from 'zod';

export const PERMISSION_LIST = [
  '*',
  'ticket:read',
  'ticket:create',
  'ticket:assign',
  'ticket:submit',
  'network:read',
  'network:update',
  'customer:read',
  'customer:update',
  'tech:read',
  'tech:manage',
  'role:read',
  'role:edit',
  'ai:use',
] as const;

export const permissionEnum = z.enum(PERMISSION_LIST);
export type Permission = z.infer<typeof permissionEnum>;

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, 'Nama role minimal 2 karakter').max(50),
  permissions: z.array(z.string()),
  hierarchyLevel: z.number().int().min(1).max(100),
  createdAt: z.string().datetime().optional(),
});

export type RoleData = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Nama role minimal 2 karakter').max(50),
  permissions: z.array(z.string()).min(1, 'Minimal satu permission harus dipilih'),
  hierarchyLevel: z.number().int().min(1).max(99, 'Hierarchy level 100 hanya untuk Super Admin'),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string()).min(1, 'Minimal satu permission harus dipilih'),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter').max(100),
  nik: z.string().trim().min(3, 'NIK wajib diisi').max(32),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username minimal 3 karakter')
    .max(50)
    .regex(/^[a-z0-9._-]+$/, 'Username hanya boleh huruf kecil, angka, titik, garis bawah, atau tanda hubung'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').optional(),
  roleName: z.string().trim().min(2, 'Role wajib dipilih'),
  vendorCompany: z.string().trim().max(120).optional().nullable(),
  assignedClusters: z.array(z.string().trim().min(1)).default([]),
  telegramChatId: z.string().trim().max(64).optional().nullable(),
  twoFactorEnabled: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  roleName: z.string().trim().min(2).optional(),
  vendorCompany: z.string().trim().max(120).optional().nullable(),
  assignedClusters: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().optional(),
  unlinkTelegram: z.boolean().optional(),
  telegramChatId: z.string().trim().max(64).optional().nullable(),
  twoFactorEnabled: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
