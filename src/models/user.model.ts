import { z } from 'zod';

export const UpdateProfileDto = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  pushToken: z.string().optional(),
});

export const ChildProfileDto = z.object({
  childName: z.string().min(1),
  dateOfBirth: z.string().datetime({ offset: true }).optional(),
  ageMonths: z.number().int().positive().optional(),
  challenges: z.array(z.string()).max(6).default([]),
});

export const ChangePasswordDto = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const UserListQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'free', 'cancelled', 'expired']).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileDto>;
export type ChildProfileInput = z.infer<typeof ChildProfileDto>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordDto>;
export type UserListQuery = z.infer<typeof UserListQueryDto>;
