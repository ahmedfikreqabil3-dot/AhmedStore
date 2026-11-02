import { Prisma,type PrismaClient } from '@prisma/client';
import type { SaleDocument } from '@ahmed-store/contracts';

export function createSaleDocumentService(prisma:PrismaClient){return{
  async detail(organizationId:string,saleId:string,ownerUserId?:string):Promise<SaleDocument|null>{
    return prisma.$transaction(async tx=>{
      const sale=await tx.sale.findFirst({where:{id:saleId,organizationId,actorUserId:ownerUserId},include:{organization:{select:{name:true}},customer:{select:{id:true,name:true,phone:true,organizationId:true}},warehouse:{select:{id:true,name:true,organizationId:true}},lines:{orderBy:{lineNumber:'asc'}},payments:{orderBy:{id:'asc'}},returns:{where:{organizationId},orderBy:[{occurredAt:'asc'},{id:'asc'}],include:{lines:true,payments:true}}}});
      if(!sale||sale.customer.organizationId!==organizationId||sale.warehouse.organizationId!==organizationId)return null;
      const returned=new Map<string,Prisma.Decimal>();
      for(const document of sale.returns)if(document.status==='POSTED')for(const line of document.lines){if(!line.saleLineId)throw Error('RETURN_LINE_REFERENCE_MISSING');returned.set(line.saleLineId,(returned.get(line.saleLineId)??new Prisma.Decimal(0)).plus(line.quantity));}
      return{id:sale.id,organizationName:sale.organization.name,status:sale.status,occurredAt:sale.occurredAt,customer:{id:sale.customer.id,name:sale.customer.name,phone:sale.customer.phone},warehouse:{id:sale.warehouse.id,name:sale.warehouse.name},subtotal:sale.subtotal.toFixed(4),discount:sale.discount.toFixed(4),total:sale.total.toFixed(4),
        lines:sale.lines.map(line=>({id:line.id,lineNumber:line.lineNumber,productName:line.productName,sku:line.sku,quantity:line.quantity.toFixed(4),unitPrice:line.unitPrice.toFixed(4),discount:line.discount.toFixed(4),total:line.total.toFixed(4),returnedQuantity:(returned.get(line.id)??new Prisma.Decimal(0)).toFixed(4)})),
        payments:sale.payments.map(payment=>({method:payment.method,amount:payment.amount.toFixed(4)})),
        returns:sale.returns.map(document=>({id:document.id,status:document.status,replacesReturnId:document.replacesReturnId,reason:document.reason,total:document.total.toFixed(4),occurredAt:document.occurredAt,lines:document.lines.map(line=>({saleLineId:line.saleLineId!,quantity:line.quantity.toFixed(4),unitPrice:line.unitPrice.toFixed(4),total:line.total.toFixed(4)})),payments:document.payments.map(payment=>({method:payment.method,amount:payment.amount.toFixed(4)}))}))};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
};}
