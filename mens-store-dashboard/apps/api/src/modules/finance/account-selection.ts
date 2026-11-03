import {Prisma} from '@prisma/client';
import {TreasuryError} from './treasury-errors.js';
export async function checkAccount(tx:Prisma.TransactionClient,org:string,id:string|undefined,method:string){
 if(!id)return;
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "TreasuryAccount" WHERE id=${id} AND "organizationId"=${org} AND active AND "paymentMethod"::text=${method} FOR SHARE`;
 if(!rows.length)throw new TreasuryError('ACCOUNT_UNAVAILABLE');
}
