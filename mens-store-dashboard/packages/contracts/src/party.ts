import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';

export const customerSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  legacyId: z.number().int().positive().nullable(),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(3).max(40).nullable(),
  email: z.string().email().max(254).nullable(),
  address: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  creditLimit: decimalStringSchema,
  active: z.boolean(),
  version: z.number().int().positive()
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerSchema = customerSchema.pick({ name: true, phone: true, email: true, address: true, notes: true, creditLimit: true });
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const supplierSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(3).max(40).nullable(),
  email: z.string().email().max(254).nullable(),
  address: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  active: z.boolean(),
  version: z.number().int().positive()
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierSchema = supplierSchema.pick({ name: true, phone: true, email: true, address: true, notes: true });
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
