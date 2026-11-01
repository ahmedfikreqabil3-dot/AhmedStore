import { expect, it } from 'vitest';
import { createStockCountSchema, stockCountQuerySchema, stockCountSchema } from '../src/index.js';
const id='ce5435a8-93e0-48d8-87b5-cdb58e45f92a';const line={productId:id,expectedQuantity:'1.1250',countedQuantity:'0'};const input={warehouseId:id,reason:'Physical count',occurredAt:'2026-10-30T10:00:00Z',lines:[line]};
it('validates count snapshots, rejects duplicates and injected scopes and bounds list queries',()=>{
  expect(createStockCountSchema.parse(input).lines[0]).toEqual(line);expect(createStockCountSchema.safeParse({...input,lines:[line,line]}).success).toBe(false);
  for(const value of [{...input,organizationId:id},{...input,lines:[]},{...input,lines:[{...line,countedQuantity:'-1'}]},{...input,lines:[{...line,expectedQuantity:'1.00001'}]},{...input,occurredAt:'not-a-date'}])expect(createStockCountSchema.safeParse(value).success).toBe(false);
  expect(stockCountQuerySchema.parse({})).toEqual({limit:25,offset:0});expect(stockCountQuerySchema.safeParse({limit:101}).success).toBe(false);
  expect(stockCountSchema.parse({...input,id,organizationId:id,actorUserId:id,createdAt:input.occurredAt,lines:[{...line,id,productName:'Shirt',sku:'SH-1',difference:'-1.1250',inventoryTransactionId:id}]}).lines[0]!.difference).toBe('-1.1250');
});
