import { expect, it } from 'vitest';
import { createInventoryTransferSchema, inventoryTransferQuerySchema, inventoryTransferSchema } from '../src/inventory-transfer.js';
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f',destination='f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const input={productId:id,sourceWarehouseId:id,destinationWarehouseId:destination,quantity:'0.1250',reason:'تغذية الفرع',occurredAt:'2026-10-30T10:00:00.000Z'};
it('requires positive exact quantities and distinct source/destination without accepting actor or tenant selectors',()=>{
  expect(createInventoryTransferSchema.parse(input).quantity).toBe('0.1250');
  for(const extra of [{quantity:'0'},{quantity:'0.0000'},{quantity:'-1'},{quantity:'1.12345'},{destinationWarehouseId:id},{organizationId:id},{actorUserId:id}])expect(createInventoryTransferSchema.safeParse({...input,...extra}).success).toBe(false);
  expect(inventoryTransferQuerySchema.parse({})).toEqual({limit:50,offset:0});expect(inventoryTransferQuerySchema.parse({limit:'20',offset:'40'})).toEqual({limit:20,offset:40});
  for(const value of [{limit:201},{offset:-1},{organizationId:id}])expect(inventoryTransferQuerySchema.safeParse(value).success).toBe(false);
  expect(inventoryTransferSchema.parse({...input,id,organizationId:id,actorUserId:id,productName:'Shirt',sku:'SH-1',createdAt:input.occurredAt,idempotencyKey:'private-key'})).not.toHaveProperty('idempotencyKey');
});
