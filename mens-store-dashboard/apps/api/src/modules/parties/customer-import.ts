import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Prisma,type PrismaClient} from '@prisma/client';
import {createCustomerSchema,type CustomerImportPreview,type CreateCustomerInput} from '@ahmed-store/contracts';
import {mayManageParty} from './lifecycle.js';
import {retryWriteConflict} from '../shared/retry-write-conflict.js';

const headers=['Name','Phone','Email','Address','Notes','Credit Limit'];
const fingerprint=(row:Pick<CreateCustomerInput,'name'|'phone'|'email'>)=>JSON.stringify([row.name.trim().toLocaleLowerCase(),row.phone?.trim()??'',row.email?.trim().toLocaleLowerCase()??'']);
export async function customerImportTemplate(){
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Customers',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=headers.map(header=>({header,width:header==='Address'||header==='Notes'?40:26}));
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF172B4D'}};
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function previewCustomerImport(file:Buffer):Promise<CustomerImportPreview>{
  try{
    const book=new ExcelJS.Workbook();await book.xlsx.load(Uint8Array.from(file).buffer);const sheet=book.getWorksheet('Customers');
    if(!sheet||headers.some((header,index)=>sheet.getRow(1).getCell(index+1).text.trim()!==header))return {valid:false,rows:[],errors:[{row:1,message:'EXPECTED_CUSTOMER_COLUMNS'}]};
    if(sheet.rowCount>1001)return {valid:false,rows:[],errors:[{row:1002,message:'TOO_MANY_ROWS'}]};
    const rows:CustomerImportPreview['rows']=[],errors:CustomerImportPreview['errors']=[],seen=new Set<string>();
    for(let row=2;row<=sheet.rowCount;row++){
      const values=headers.map((_header,index)=>sheet.getRow(row).getCell(index+1).text.trim());if(!values.some(Boolean))continue;
      const [name,phone,email,address,notes,creditLimit]=values;
      const parsed=createCustomerSchema.safeParse({name,phone:phone||null,email:email||null,address:address||null,notes:notes||null,creditLimit});
      if(!parsed.success){errors.push({row,message:'INVALID_CUSTOMER'});continue;}
      const key=fingerprint(parsed.data);if(seen.has(key)){errors.push({row,message:'DUPLICATE_IN_FILE'});continue;}seen.add(key);rows.push({...parsed.data,row});
    }
    if(rows.length===0&&errors.length===0)errors.push({row:2,message:'NO_ROWS'});
    return {valid:errors.length===0,rows,errors};
  }catch{return {valid:false,rows:[],errors:[{row:1,message:'INVALID_WORKBOOK'}]};}
}
async function conflicts(tx:Pick<Prisma.TransactionClient,'customer'>,organizationId:string,preview:CustomerImportPreview){
  if(!preview.valid)return preview;
  const existing=await tx.customer.findMany({where:{organizationId,name:{in:preview.rows.map(row=>row.name),mode:'insensitive'}},select:{name:true,phone:true,email:true}});
  const known=new Set(existing.map(fingerprint)),errors=preview.rows.filter(row=>known.has(fingerprint(row))).map(row=>({row:row.row,message:'CUSTOMER_EXISTS' as const}));
  return {...preview,valid:errors.length===0,errors};
}
export type CustomerImportResult={ok:true;imported:number;replayed:boolean}|{ok:false;reason:'ACTOR_UNAVAILABLE'|'IDEMPOTENCY_KEY_CONFLICT'}|{ok:false;reason:'INVALID_IMPORT';preview:CustomerImportPreview};
export function createCustomerImportService(prisma:PrismaClient){return {
  template:customerImportTemplate,
  async preview(organizationId:string,file:Buffer){return conflicts(prisma,organizationId,await previewCustomerImport(file));},
  async import(organizationId:string,actorUserId:string,idempotencyKey:string,file:Buffer):Promise<CustomerImportResult>{
    const contentHash=createHash('sha256').update(file).digest('hex'),preview=await previewCustomerImport(file);
    return retryWriteConflict(()=>prisma.$transaction(async tx=>{
      const actor=await tx.user.findFirst({where:{organizationId,id:actorUserId,active:true},select:{role:true}});if(!actor||!mayManageParty(actor.role,'customers'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
      const prior=await tx.dataImport.findUnique({where:{organizationId_kind_idempotencyKey:{organizationId,kind:'CUSTOMERS',idempotencyKey}}});
      if(prior)return prior.contentHash===contentHash?{ok:true as const,imported:prior.importedCount,replayed:true}:{ok:false as const,reason:'IDEMPOTENCY_KEY_CONFLICT' as const};
      const checked=await conflicts(tx,organizationId,preview);if(!checked.valid)return {ok:false as const,reason:'INVALID_IMPORT' as const,preview:checked};
      const batch=await tx.dataImport.create({data:{organizationId,actorUserId,kind:'CUSTOMERS',idempotencyKey,contentHash,importedCount:checked.rows.length}});
      await tx.customer.createMany({data:checked.rows.map(({row:_row,...customer})=>({id:randomUUID(),organizationId,...customer,active:true,version:1}))});
      await tx.auditEvent.create({data:{organizationId,actorUserId,action:'CUSTOMERS_IMPORTED',entityType:'DataImport',entityId:batch.id,details:{imported:batch.importedCount,contentHash}}});
      return {ok:true as const,imported:batch.importedCount,replayed:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  }
};}
