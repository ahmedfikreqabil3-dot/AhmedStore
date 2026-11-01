import { Prisma } from '@prisma/client';
import { expect, it, vi } from 'vitest';
import { minimumStockFrom } from '../../../src/modules/inventory/stock-integrity.js';
it('preserves fractional stock through aggregates larger than Decimal arithmetic precision and recognizes negative history',async()=>{
  const aggregate=vi.fn(async()=>({_sum:{quantity:new Prisma.Decimal('10000000000000000.0009')}}));
  const groupBy=vi.fn(async()=>[{_sum:{quantity:new Prisma.Decimal('90000000000000000')}},{_sum:{quantity:new Prisma.Decimal('-100000000000000000')}}]);
  const transaction={inventoryTransaction:{aggregate,groupBy}} as unknown as Pick<Prisma.TransactionClient,'inventoryTransaction'>;
  const at=new Date('2026-10-30T10:00:00.000Z');expect((await minimumStockFrom(transaction,'org','warehouse','product',at)).toFixed(4)).toBe('0.0009');
  aggregate.mockResolvedValueOnce({_sum:{quantity:new Prisma.Decimal('-1.1250')}});groupBy.mockResolvedValueOnce([]);expect((await minimumStockFrom(transaction,'org','warehouse','product',at)).toFixed(4)).toBe('-1.1250');
  expect(groupBy).toHaveBeenCalledWith({by:['occurredAt'],where:{organizationId:'org',warehouseId:'warehouse',productId:'product',occurredAt:{gt:at}},_sum:{quantity:true},orderBy:{occurredAt:'asc'}});
});
