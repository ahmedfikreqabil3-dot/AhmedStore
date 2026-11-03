import {Prisma,type PrismaClient} from '@prisma/client';
import {documentSettingsSchema,printableDocumentSchema,type documentKindSchema} from '@ahmed-store/contracts';import type {z} from 'zod';
export class DocumentError extends Error{constructor(readonly status:number,message:string){super(message);}}
export function createDocumentService(db:PrismaClient){return {
 async settings(org:string){const row=await db.organization.findUniqueOrThrow({where:{id:org},select:{name:true,settings:true}});const settings=(row.settings??{}) as Record<string,unknown>;return documentSettingsSchema.parse({name:row.name,phone:settings.phone??'',address:settings.address??'',receiptHeader:settings.receiptHeader??'',receiptFooter:settings.receiptFooter??''});},
 async read(org:string,kind:z.infer<typeof documentKindSchema>,id:string){return db.$transaction(async tx=>{
  if(kind==='purchase'){
   const row=await tx.purchase.findFirst({where:{id,organizationId:org},include:{supplier:{select:{name:true}},warehouse:{select:{name:true}},lines:{orderBy:{lineNumber:'asc'}},payments:true}});if(!row)throw new DocumentError(404,'DOCUMENT_NOT_FOUND');
   return printableDocumentSchema.parse({title:'إيصال استلام مشتريات',id:row.id,date:row.occurredAt,facts:[['الحالة',row.status],['المورد',row.supplier.name],['الفرع',row.warehouse.name],['السداد',row.payments.map(p=>p.method+': '+p.amount.toFixed(4)).join(' · ')]],columns:['الصنف','الكود','الكمية','التكلفة','الإجمالي'],rows:row.lines.map(l=>[l.productName,l.sku,l.quantity.toFixed(4),l.unitCost.toFixed(4),l.total.toFixed(4)]),total:row.total.toFixed(4)});
  }
  const row=await tx.partySettlement.findFirst({where:{id,organizationId:org},include:{customer:{select:{name:true}},supplier:{select:{name:true}},account:{select:{name:true}},allocations:true}});if(!row)throw new DocumentError(404,'DOCUMENT_NOT_FOUND');
  const rows=row.allocations.map(a=>[a.saleId??a.purchaseId??'',a.amount.toFixed(4)]),remaining=row.amount.minus(row.allocations.reduce((sum,a)=>sum.plus(a.amount),new Prisma.Decimal(0)));if(remaining.gt(0))rows.push(['تسوية على الحساب',remaining.toFixed(4)]);
  return printableDocumentSchema.parse({title:row.kind==='customers'?'إيصال تحصيل عميل':'إيصال سداد مورد',id:row.id,date:row.occurredAt,facts:[['الطرف',row.customer?.name??row.supplier?.name??''],['الخزينة',row.account.name],['البيان',row.reason],['الحالة','مسجل']],columns:['التخصيص','المبلغ'],rows,total:row.amount.toFixed(4)});
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});}
};}
