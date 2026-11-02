import {createHash} from 'node:crypto';
import {z} from 'zod';

const key=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
const name=z.string().trim().min(2).max(120);
export const units=(value:string)=>{const negative=value.startsWith('-');const [whole,fraction='']=(negative?value.slice(1):value).split('.');const result=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));return negative?-result:result;};
export const decimal=(value:bigint)=>`${value<0n?'-':''}${(value<0n?-value:value)/10000n}.${((value<0n?-value:value)%10000n).toString().padStart(4,'0')}`;
const amount=z.string().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/).transform(v=>decimal(units(v)));
const nonnegative=amount.refine(v=>units(v)>=0n);
const text=z.string().trim().max(300).nullable().default(null);
const party=z.object({key,name,phone:z.string().trim().max(40).nullable().default(null),email:z.string().email().toLowerCase().nullable().default(null),address:text,notes:text}).strict();
const list=<T extends z.ZodTypeAny>(item:T)=>z.array(item).max(10000);
export const bundleSchema=z.object({
  schemaVersion:z.literal(1),sourceSystem:key,batchKey:key,asOf:z.string().datetime({offset:true}).transform(v=>new Date(v).toISOString()),
  organization:z.object({key,name}).strict(),
  categories:list(z.object({key,name}).strict()),
  warehouses:list(z.object({key,name}).strict()),
  products:list(z.object({key,name:z.string().trim().min(2).max(160),sku:z.string().trim().min(1).max(80).toUpperCase(),barcode:z.string().trim().min(1).max(120).nullable().default(null),categoryKey:key.nullable().default(null),salePrice:nonnegative,costPrice:nonnegative}).strict()),
  customers:list(party.extend({creditLimit:nonnegative.default('0.0000')})),suppliers:list(party),
  treasuryAccounts:list(z.object({key,name,paymentMethod:z.enum(['CASH','CARD','WALLET','INSTAPAY']),isDefault:z.boolean()}).strict()),
  opening:z.object({
    stock:list(z.object({warehouseKey:key,productKey:key,quantity:nonnegative}).strict()),
    treasury:list(z.object({accountKey:key,amount:nonnegative}).strict()),
    customers:list(z.object({customerKey:key,amount}).strict()),
    suppliers:list(z.object({supplierKey:key,amount}).strict())
  }).strict()
}).strict().superRefine((b,ctx)=>{
  const error=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  const unique=(items:unknown[],label:string)=>{if(new Set(items).size!==items.length)error('DUPLICATE_'+label);};
  for(const kind of ['categories','warehouses','products','customers','suppliers','treasuryAccounts'] as const)unique(b[kind].map(x=>x.key),kind);
  for(const kind of ['categories','warehouses','suppliers','treasuryAccounts'] as const)unique(b[kind].map(x=>x.name),kind+'_name');
  unique(b.products.map(x=>x.sku),'SKU');unique(b.products.flatMap(x=>x.barcode?[x.barcode]:[]),'BARCODE');
  const has=(kind:'categories'|'warehouses'|'products'|'customers'|'suppliers'|'treasuryAccounts',id:string)=>b[kind].some(x=>x.key===id);
  for(const p of b.products)if(p.categoryKey&&!has('categories',p.categoryKey))error('UNKNOWN_CATEGORY');
  for(const s of b.opening.stock)if(!has('products',s.productKey)||!has('warehouses',s.warehouseKey))error('UNKNOWN_STOCK_REFERENCE');
  for(const s of b.opening.treasury)if(!has('treasuryAccounts',s.accountKey))error('UNKNOWN_ACCOUNT');
  for(const s of b.opening.customers)if(!has('customers',s.customerKey))error('UNKNOWN_CUSTOMER');
  for(const s of b.opening.suppliers)if(!has('suppliers',s.supplierKey))error('UNKNOWN_SUPPLIER');
  unique(b.opening.stock.map(x=>x.warehouseKey+'\0'+x.productKey),'STOCK');
  unique(b.opening.treasury.map(x=>x.accountKey),'TREASURY');unique(b.opening.customers.map(x=>x.customerKey),'CUSTOMER_BALANCE');unique(b.opening.suppliers.map(x=>x.supplierKey),'SUPPLIER_BALANCE');
  for(const method of new Set(b.treasuryAccounts.map(a=>a.paymentMethod)))if(b.treasuryAccounts.filter(a=>a.paymentMethod===method&&a.isDefault).length!==1)error('ONE_DEFAULT_PER_METHOD');
});
export type Bundle=z.infer<typeof bundleSchema>;
export function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).sort().join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
export const digest=(b:Bundle)=>createHash('sha256').update(canonical(b)).digest('hex');
export function ids(b:Bundle){const scope=b.sourceSystem+'\0'+b.organization.key;return(kind:string,key='')=>{const h=createHash('sha256').update(scope+'\0'+kind+'\0'+key).digest('hex').slice(0,32).split('');h[12]='5';h[16]=((parseInt(h[16]!,16)&3)|8).toString(16);const s=h.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};}
export function assertTrialUrl(raw:string){const u=new URL(raw);if(u.hostname!=='127.0.0.1'||u.port!=='55432'||!/^\/ahmed_store_phase5_trial_[a-z0-9_]+$/.test(u.pathname))throw Error('ISOLATED_PHASE5_DATABASE_REQUIRED');return u;}
