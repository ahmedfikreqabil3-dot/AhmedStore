import {useEffect,useState,type FormEvent} from 'react';
import {saveDraftCommandSchema,saleDraftSchema,type SaleDraft,type DraftInput} from '@ahmed-store/contracts';
import type {z} from 'zod';
import {PendingCommandNotice,usePendingCommand} from './pending-command.js';
import {ApiError,readJson,saleOptions,type SaleOptions} from './store-api.js';
const validate=(value:unknown)=>{saveDraftCommandSchema.parse(value);};
export function SaleDraftEditor({draft,complete,close}:{draft?:SaleDraft;complete:(draft:SaleDraft)=>void;close:()=>void}){
  const [options,setOptions]=useState<SaleOptions|null>(null),[reload,setReload]=useState(0),[error,setError]=useState('');
  const [kind,setKind]=useState<'QUOTATION'|'HELD'>(draft?.kind??'QUOTATION'),[customerId,setCustomer]=useState(draft?.customerId??''),[warehouseId,setWarehouse]=useState(draft?.warehouseId??'');
  const [lines,setLines]=useState<DraftInput['lines']>(draft?.lines.map(({productId,quantity,unitPrice,discount})=>({productId,quantity,unitPrice,discount}))??[]);
  const pending=usePendingCommand<z.infer<typeof saveDraftCommandSchema>>('draft-save.'+(draft?.id??'new'),validate);
  useEffect(()=>{let active=true;setOptions(null);setError('');void saleOptions().then(value=>{if(active)setOptions(value);}).catch(()=>{if(active)setError('تعذر تحميل الأصناف والعملاء والفروع.');});return()=>{active=false;};},[reload]);
  async function send(command?:z.infer<typeof saveDraftCommandSchema>){setError('');try{
    const result=await pending.run(()=>command!,()=>crypto.randomUUID(),async(cmd,key)=>saleDraftSchema.parse(await readJson<unknown>(cmd.action==='CREATE'?'/sale-drafts':`/sale-drafts/${cmd.id}`,{method:cmd.action==='CREATE'?'POST':'PATCH',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(cmd.input)})));
    if(result)complete(result);
  }catch(problem){setError(problem instanceof ApiError?'رفض الحفظ. حدّث المسودة وراجع الأصناف والكميات والأسعار.':'تعذر تأكيد الحفظ. أعد نفس الطلب المحفوظ للتحقق من نتيجته.');}}
  function save(event:FormEvent){event.preventDefault();const input={customerId,warehouseId,lines},parsed=saveDraftCommandSchema.safeParse(draft?{action:'UPDATE',id:draft.id,input:{...input,version:draft.version}}:{action:'CREATE',input:{...input,kind}});if(!parsed.success){setError('اختر العميل والفرع وأضف أصنافًا بكميات وأسعار صحيحة.');return;}void send(parsed.data);}
  function change(index:number,field:keyof DraftInput['lines'][number],value:string){setLines(old=>old.map((line,i)=>i===index?{...line,[field]:value,...field==='productId'?{unitPrice:options!.products.find(p=>p.id===value)!.salePrice}:{}}:line));}
  return <section className="operation-detail" aria-label="محرر المسودة"><h3>{draft?'تعديل المسودة':'مسودة جديدة'}</h3>
    <PendingCommandNotice blocked={pending.blocked} pending={!!pending.pending} busy={pending.busy} retry={()=>void send()}/>
    {!options&&<><p role="status">جارٍ تحميل قوائم المسودة…</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل القوائم</button></>}
    <form aria-label="حفظ المسودة" noValidate onSubmit={save}><fieldset disabled={!options||pending.busy||pending.blocked||!!pending.pending}><div className="operation-fields">
      <label>نوع المسودة<select aria-label="نوع المسودة" value={kind} disabled={!!draft} onChange={event=>setKind(event.target.value as typeof kind)}><option value="QUOTATION">عرض سعر</option><option value="HELD">فاتورة معلقة</option></select></label>
      <label>العميل<select aria-label="عميل المسودة" value={customerId} onChange={event=>setCustomer(event.target.value)}><option value="">اختر العميل</option>{options?.customers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>الفرع<select aria-label="فرع المسودة" value={warehouseId} onChange={event=>setWarehouse(event.target.value)}><option value="">اختر الفرع</option>{options?.warehouses.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    </div><div className="operation-table-wrap" role="region" aria-label="أصناف المسودة" tabIndex={0}><table><thead><tr>{['الصنف','الكمية','السعر','خصم السطر','الإجراء'].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{lines.map((line,index)=><tr key={index}><td><select aria-label={`صنف المسودة ${index+1}`} value={line.productId} onChange={event=>change(index,'productId',event.target.value)}>{options?.products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></td>{(['quantity','unitPrice','discount'] as const).map(field=><td key={field}><input inputMode="decimal" aria-label={`${({quantity:'كمية',unitPrice:'سعر',discount:'خصم'})[field]} ${index+1}`} value={line[field]} onChange={event=>change(index,field,event.target.value)}/></td>)}<td><button type="button" className="button secondary" aria-label={`حذف السطر ${index+1}`} onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))}>حذف</button></td></tr>)}</tbody></table></div>
      <div className="operation-actions"><button type="button" className="button secondary" disabled={!options?.products.length||lines.length>=100} onClick={()=>setLines(old=>[...old,{productId:options!.products[0]!.id,quantity:'1',unitPrice:options!.products[0]!.salePrice,discount:'0'}])}>إضافة صنف</button><button className="button primary">حفظ المسودة</button></div>
    </fieldset></form>{error&&<p role="alert">{error}</p>}<button className="button secondary" disabled={pending.busy} onClick={close}>إلغاء التعديلات</button>
  </section>;
}
