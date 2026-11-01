import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';
export const setStockThresholdSchema=z.object({productId:z.string().uuid(),warehouseId:z.string().uuid(),minimum:decimalStringSchema,version:z.number().int().min(0).max(2147483646)}).strict();
export type SetStockThresholdInput=z.infer<typeof setStockThresholdSchema>;
export const stockThresholdQuerySchema=z.object({warehouseId:z.string().uuid().optional(),mode:z.enum(['all','low']).default('low'),asOf:z.coerce.date().optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
export type StockThresholdQuery=z.infer<typeof stockThresholdQuerySchema>;
export const stockThresholdSchema=z.object({id:z.string().uuid(),productId:z.string().uuid(),productName:z.string(),sku:z.string(),warehouseId:z.string().uuid(),warehouseName:z.string(),minimum:decimalStringSchema,quantity:z.string().regex(/^-?\d+\.\d{4}$/),version:z.number().int().positive(),updatedAt:z.coerce.date()});
export type StockThreshold=z.infer<typeof stockThresholdSchema>;
