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

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  active: z.boolean()
});
export type Warehouse = z.infer<typeof warehouseSchema>;

export const createWarehouseSchema = warehouseSchema.pick({ name: true });
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const stockQuerySchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  asOf: z.coerce.date()
}).superRefine((query, context) => {
  if (query.warehouseId && query.branchId && query.warehouseId !== query.branchId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'warehouseId and branchId must match.' });
}).transform(({ branchId, ...query }) => ({ ...query, warehouseId: query.warehouseId ?? branchId }));
export type StockQuery = z.infer<typeof stockQuerySchema>;

export const inventoryMovementTypeSchema = z.enum(['OPENING_BALANCE', 'ADJUSTMENT']);
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;

export const signedDecimalStringSchema = z.string().regex(/^-?\d{1,15}(\.\d{1,4})?$/).refine((value) => !/^-?0(?:\.0{1,4})?$/.test(value));

export const createInventoryMovementSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  type: inventoryMovementTypeSchema,
  quantity: signedDecimalStringSchema,
  referenceType: z.string().trim().min(2).max(80),
  referenceId: z.string().trim().min(1).max(120),
  occurredAt: z.coerce.date()
});
export type CreateInventoryMovementInput = z.infer<typeof createInventoryMovementSchema>;

export const inventoryMovementSchema = createInventoryMovementSchema.extend({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  idempotencyKey: z.string().min(1).nullable()
});
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
