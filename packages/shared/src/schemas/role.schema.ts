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
