import { Prisma, type PrismaClient } from '@prisma/client';
import type { ExpenseHistory, ExpenseHistoryQuery } from '@ahmed-store/contracts';

export function createExpenseHistoryService(prisma:PrismaClient){
  return {
    async list(organizationId:string,query:ExpenseHistoryQuery):Promise<ExpenseHistory>{
      return prisma.$transaction(async tx=>{
        const where={organizationId,occurredAt:{gte:query.from,lte:query.to}};
        const [expenses,summary]=await Promise.all([
          tx.expense.findMany({where,orderBy:[{occurredAt:'desc'},{id:'desc'}],skip:query.offset,take:query.limit}),
          tx.expense.aggregate({where,_count:true,_sum:{amount:true}})
        ]);
        return {expenses:expenses.map(row=>({id:row.id,organizationId:row.organizationId,category:row.category,description:row.description,paymentMethod:row.paymentMethod as ExpenseHistory['expenses'][number]['paymentMethod'],amount:row.amount.toFixed(4),occurredAt:row.occurredAt})),total:summary._count,totalAmount:summary._sum.amount?.toFixed(4) ?? '0.0000',limit:query.limit,offset:query.offset};
      },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    }
  };
}
