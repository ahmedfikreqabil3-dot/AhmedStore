import { expect, it } from 'vitest';
import { setStockThresholdSchema, stockThresholdQuerySchema, stockThresholdSchema } from '../src/index.js';
const id='ce5435a8-93e0-48d8-87b5-cdb58e45f92a';
it('validates scoped versioned minimum settings and historical read filters',()=>{
  const input={productId:id,warehouseId:id,minimum:'0.0000',version:0};expect(setStockThresholdSchema.parse(input)).toEqual(input);for(const invalid of [{...input,version:-1},{...input,version:2147483647},{...input,minimum:'-1'},{...input,minimum:'0.00001'},{...input,organizationId:id}])expect(setStockThresholdSchema.safeParse(invalid).success).toBe(false);
  expect(stockThresholdQuerySchema.parse({})).toEqual({mode:'low',limit:25,offset:0});expect(stockThresholdQuerySchema.safeParse({asOf:'bad'}).success).toBe(false);expect(stockThresholdQuerySchema.safeParse({mode:'unknown'}).success).toBe(false);
  expect(stockThresholdSchema.parse({id,productId:id,productName:'Shirt',sku:'SH-1',warehouseId:id,warehouseName:'Main',minimum:'1.0000',quantity:'-1000000000000000000.0000',version:1,updatedAt:'2026-10-30'}).quantity).toBe('-1000000000000000000.0000');
});
