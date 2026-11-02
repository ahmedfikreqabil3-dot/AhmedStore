import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {createApplicationServices} from '../../src/services.js';
import {saleDocumentSchema} from '@ahmed-store/contracts';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const db=new PrismaClient(),s=createApplicationServices(db);
let org:string,other:string,actor:string,customer:string,warehouse:string,product:string,saleId:string,lineId:string;
beforeAll(async()=>{
  org=(await db.organization.create({data:{name:'Invoice document '+randomUUID()}})).id;other=(await db.organization.create({data:{name:'Foreign document '+randomUUID()}})).id;
  actor=(await db.user.create({data:{organizationId:org,name:'Document owner',email:'invoice@example.test',passwordHash:'unused',role:'ADMIN'}})).id;customer=(await db.customer.create({data:{organizationId:org,name:'Invoice customer',phone:'0501234567'}})).id;warehouse=(await db.warehouse.create({data:{organizationId:org,name:'Invoice branch'}})).id;product=(await db.product.create({data:{organizationId:org,name:'Original shirt',sku:'ORIGINAL-SKU',salePrice:'19.95',costPrice:'10'}})).id;
  await db.inventoryTransaction.create({data:{organizationId:org,warehouseId:warehouse,productId:product,type:'OPENING_BALANCE',quantity:'10',referenceType:'Fixture',referenceId:randomUUID(),occurredAt:new Date('2026-10-01')}});
  const sale=await s.salesService.post(org,actor,randomUUID(),{customerId:customer,warehouseId:warehouse,occurredAt:new Date('2026-10-02'),lines:[{productId:product,quantity:'2',unitPrice:'19.95',discount:'0'}],payments:[{method:'CASH',amount:'20'},{method:'CREDIT',amount:'19.9'}]});if(!sale.ok)throw Error(sale.reason);saleId=sale.sale.id;lineId=(await db.saleLine.findFirstOrThrow({where:{saleId}})).id;
});
afterAll(async()=>{const where={organizationId:{in:[org,other]}};await db.customerLedgerEntry.deleteMany({where});await db.auditEvent.deleteMany({where});await db.treasuryTransaction.deleteMany({where});await db.inventoryTransaction.deleteMany({where});await db.returnPayment.deleteMany({where:{salesReturn:where}});await db.returnLine.deleteMany({where:{salesReturn:where}});await db.salesReturn.deleteMany({where:{...where,replacesReturnId:{not:null}}});await db.salesReturn.deleteMany({where});await db.salePayment.deleteMany({where:{sale:where}});await db.saleLine.deleteMany({where:{sale:where}});await db.sale.deleteMany({where});await db.product.deleteMany({where});await db.customer.deleteMany({where});await db.warehouse.deleteMany({where});await db.user.deleteMany({where});await db.organization.deleteMany({where:{id:{in:[org,other]}}});await db.$disconnect();});
it('reads exact immutable product snapshots with tenant and cashier ownership restrictions',async()=>{
  await db.product.update({where:{id:product},data:{name:'Changed later',salePrice:'100'}});
  expect(saleDocumentSchema.parse(await s.salesHistoryService.detail(org,saleId))).toMatchObject({id:saleId,total:'39.9000',customer:{name:'Invoice customer'},lines:[{productName:'Original shirt',sku:'ORIGINAL-SKU',quantity:'2.0000',unitPrice:'19.9500',returnedQuantity:'0.0000'}],payments:expect.arrayContaining([{method:'CASH',amount:'20.0000'},{method:'CREDIT',amount:'19.9000'}]),returns:[]});
  expect(await s.salesHistoryService.detail(other,saleId)).toBeNull();expect(await s.salesHistoryService.detail(org,saleId,randomUUID())).toBeNull();expect(await s.salesHistoryService.detail(org,saleId,actor)).not.toBeNull();
});
it('counts only posted replacement quantities while preserving original/reversal history',async()=>{
  const input={saleId,lines:[{saleLineId:lineId,quantity:'0.5'}],payments:[{method:'CREDIT' as const,amount:'9.975'}],reason:'Original return',occurredAt:new Date('2026-10-03')};
  const returned=await s.invoiceReturnService.post(org,actor,randomUUID(),input);if(!returned.ok)throw Error(returned.reason);
  expect((await s.salesHistoryService.detail(org,saleId))!.lines[0]!.returnedQuantity).toBe('0.5000');
  const replacement=await s.returnRevisionService.revise(org,actor,returned.salesReturn.id,randomUUID(),{...input,lines:[{saleLineId:lineId,quantity:'0.25'}],payments:[{method:'CASH',amount:'4.9875'}],occurredAt:new Date('2026-10-04')});if(!replacement.ok)throw Error(replacement.reason);
  const document=saleDocumentSchema.parse(await s.salesHistoryService.detail(org,saleId));expect(document.lines[0]!.returnedQuantity).toBe('0.2500');expect(document.returns).toEqual(expect.arrayContaining([expect.objectContaining({id:returned.salesReturn.id,status:'VOIDED'}),expect.objectContaining({id:replacement.salesReturn.id,status:'POSTED',replacesReturnId:returned.salesReturn.id,total:'4.9875'})]));
});
it('refuses inconsistent cross-tenant master references and unresolved invoice return lines',async()=>{
  const foreignCustomer=await db.customer.create({data:{organizationId:other,name:'Foreign customer'}}),foreignWarehouse=await db.warehouse.create({data:{organizationId:other,name:'Foreign warehouse'}});
  await db.sale.update({where:{id:saleId},data:{customerId:foreignCustomer.id}});expect(await s.salesHistoryService.detail(org,saleId)).toBeNull();await db.sale.update({where:{id:saleId},data:{customerId:customer,warehouseId:foreignWarehouse.id}});expect(await s.salesHistoryService.detail(org,saleId)).toBeNull();await db.sale.update({where:{id:saleId},data:{warehouseId:warehouse}});
  const broken=await db.salesReturn.create({data:{organizationId:org,actorUserId:actor,customerId:customer,warehouseId:warehouse,saleId,total:'1',reason:'Broken legacy reference',occurredAt:new Date(),lines:{create:{productId:product,quantity:'1',unitPrice:'1',total:'1'}}}});
  await expect(s.salesHistoryService.detail(org,saleId)).rejects.toThrow('RETURN_LINE_REFERENCE_MISSING');await db.returnLine.deleteMany({where:{salesReturnId:broken.id}});await db.salesReturn.delete({where:{id:broken.id}});
});

it('aggregates multiple posted partial returns against one immutable invoice line',async()=>{
  const input={saleId,lines:[{saleLineId:lineId,quantity:'0.25'}],payments:[{method:'CREDIT' as const,amount:'4.9875'}],reason:'Another partial return',occurredAt:new Date('2026-10-05')};expect(await s.invoiceReturnService.post(org,actor,randomUUID(),input)).toMatchObject({ok:true});expect((await s.salesHistoryService.detail(org,saleId))!.lines[0]!.returnedQuantity).toBe('0.5000');
});
