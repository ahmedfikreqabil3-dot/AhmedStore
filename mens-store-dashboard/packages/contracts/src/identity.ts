import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'FINANCE', 'MANAGER', 'CASHIER', 'WAREHOUSE']);
export type Role = z.infer<typeof roleSchema>;

export const registerUserSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: roleSchema
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const createUserSchema = registerUserSchema.omit({ organizationId: true });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const loginSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const publicUserSchema = z.object({
  warehouseIds:z.array(z.string().uuid()).optional(),
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const managedUserSchema=publicUserSchema.extend({active:z.boolean(),version:z.string().datetime(),warehouseIds:z.array(z.string().uuid()).nullable()});
export const userAccessSchema=z.object({role:roleSchema,active:z.boolean(),version:z.string().datetime(),warehouseIds:z.array(z.string().uuid()).max(100).nullable()}).strict().refine(x=>x.warehouseIds===null||new Set(x.warehouseIds).size===x.warehouseIds.length);
export const resetPasswordSchema=z.object({password:z.string().min(12).max(128),version:z.string().datetime()}).strict();
