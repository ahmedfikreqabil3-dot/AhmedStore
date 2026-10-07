import { z } from 'zod';

export const categorySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  archivedAt: z.coerce.date().nullable()
});
export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120)
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const decimalStringSchema = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/);

export const productSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().min(1).max(120).nullable(),
  salePrice: decimalStringSchema,
  costPrice: decimalStringSchema,
  active: z.boolean(),
  version: z.number().int().positive()
});
export type Product = z.infer<typeof productSchema>;

export const createProductSchema = productSchema.pick({ name: true, sku: true, barcode: true, categoryId: true, salePrice: true, costPrice: true }).transform((value) => ({ ...value, sku: value.sku.toUpperCase() }));
export type CreateProductInput = z.infer<typeof createProductSchema>;
