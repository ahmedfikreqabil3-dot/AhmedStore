import { Prisma } from '@prisma/client';

// Caller must use a Serializable transaction for the balance read and posting.
// A backdated issue subtracts from every balance at or after its timestamp.
export async function minimumStockFrom(transaction:Pick<Prisma.TransactionClient,'inventoryTransaction'>,organizationId:string,warehouseId:string,productId:string,occurredAt:Date){
  const scope={organizationId,warehouseId,productId};
  const opening=await transaction.inventoryTransaction.aggregate({where:{...scope,occurredAt:{lte:occurredAt}},_sum:{quantity:true}});
  const scaled=(value:Prisma.Decimal)=>BigInt(value.toFixed(4).replace('.',''));
  let minimum=opening._sum.quantity ? scaled(opening._sum.quantity) : 0n;
  let running=minimum;
  const future=await transaction.inventoryTransaction.groupBy({by:['occurredAt'],where:{...scope,occurredAt:{gt:occurredAt}},_sum:{quantity:true},orderBy:{occurredAt:'asc'}});
  for(const point of future){running+=scaled(point._sum.quantity!);if(running<minimum)minimum=running;}
  const magnitude=minimum<0n ? -minimum : minimum;
  return new Prisma.Decimal(`${minimum<0n ? '-' : ''}${magnitude/10000n}.${(magnitude%10000n).toString().padStart(4,'0')}`);
}
