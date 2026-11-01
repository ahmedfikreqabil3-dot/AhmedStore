import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';
const fields=z.object({productId:z.string().uuid(),sourceWarehouseId:z.string().uuid(),destinationWarehouseId:z.string().uuid(),quantity:decimalStringSchema.refine(value=>!/^0(?:\.0{1,4})?$/.test(value)),reason:z.string().trim().min(3).max(500),occurredAt:z.coerce.date()});
export const createInventoryTransferSchema=fields.strict().superRefine((value,context)=>{if(value.sourceWarehouseId===value.destinationWarehouseId)context.addIssue({code:z.ZodIssueCode.custom,path:['destinationWarehouseId'],message:'Source and destination must differ.'});});
export type CreateInventoryTransferInput=z.infer<typeof createInventoryTransferSchema>;
export const inventoryTransferSchema=fields.extend({id:z.string().uuid(),organizationId:z.string().uuid(),productName:z.string(),sku:z.string(),actorUserId:z.string().uuid(),createdAt:z.coerce.date()});
export type InventoryTransfer=z.infer<typeof inventoryTransferSchema>;
export const inventoryTransferQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(200).default(50),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
export type InventoryTransferQuery=z.infer<typeof inventoryTransferQuerySchema>;
