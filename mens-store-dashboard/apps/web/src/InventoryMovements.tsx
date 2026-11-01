import { useEffect, useState, type FormEvent } from 'react';
import { createInventoryMovementSchema } from '@ahmed-store/contracts';
import { ApiError, readJson } from './store-api.js';
import { PendingCommandNotice, usePendingCommand } from './pending-command.js';
import { OperationHeader } from './ui/OperationHeader.js';
type Option={id:string;name:string;active:boolean};
type Command={productId:string;warehouseId:string;type:'OPENING_BALANCE'|'ADJUSTMENT';quantity:string;referenceType:string;referenceId:string;occurredAt:string};
const validate=(input:unknown)=>{createInventoryMovementSchema.parse(input);};
const localNow=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
const rejections:Record<string,string>={OPENING_ALREADY_EXISTS:'الصنف له حركات سابقة في الفرع. استخدم التسوية لتصحيح الرصيد.',INVALID_OPENING_BALANCE:'الرصيد الافتتاحي لازم يكون موجبًا.',INSUFFICIENT_STOCK:'التسوية ستسبب رصيدًا سالبًا حاليًا أو في حركة لاحقة. راجع الكمية والتاريخ.',PRODUCT_UNAVAILABLE:'الصنف غير متاح. حدّث الخيارات واختار صنفًا نشطًا.',WAREHOUSE_UNAVAILABLE:'الفرع غير متاح. حدّث الخيارات واختار فرعًا نشطًا.',ACTOR_UNAVAILABLE:'الحساب غير مخوّل بهذه الحركة. راجع صلاحياتك مع المدير.'};
export function InventoryMovements(){
  const [options,setOptions]=useState<{products:Option[];warehouses:Option[]}|null>(null);const [loadingError,setLoadingError]=useState(false);const [reload,setReload]=useState(0);
  const [productId,setProduct]=useState('');const [warehouseId,setWarehouse]=useState('');const [type,setType]=useState<'OPENING_BALANCE'|'ADJUSTMENT'>('OPENING_BALANCE');
  const [direction,setDirection]=useState('increase');const [quantity,setQuantity]=useState('');const [reason,setReason]=useState('');const [at,setAt]=useState(localNow);
  const [review,setReview]=useState<Command|null>(null);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const command=usePendingCommand<Command>('inventory-movement',validate);
  useEffect(()=>{let active=true;setOptions(null);setLoadingError(false);void Promise.all([readJson<{products:Option[]}>('/products'),readJson<{warehouses:Option[]}>('/warehouses')]).then(([products,warehouses])=>{if(active)setOptions({products:products.products.filter(row=>row.active),warehouses:warehouses.warehouses.filter(row=>row.active)});}).catch(()=>{if(active)setLoadingError(true);});return()=>{active=false;};},[reload]);
  function prepare(event:FormEvent){event.preventDefault();
    if(!/^\d{1,15}(?:\.\d{1,4})?$/.test(quantity)||reason.trim().length<3){setError('اكتب كمية موجبة حتى 4 منازل عشرية وسببًا واضحًا من 3 أحرف على الأقل.');return;}
    const parsed=createInventoryMovementSchema.safeParse({productId,warehouseId,type,quantity:type==='ADJUSTMENT'&&direction==='decrease' ? `-${quantity}` : quantity,referenceType:type==='OPENING_BALANCE' ? 'MANUAL_OPENING' : 'MANUAL_ADJUSTMENT',referenceId:reason.trim(),occurredAt:new Date(at)});
    if(!parsed.success){setError('راجع الصنف والفرع والتاريخ والكمية والسبب؛ الكمية لازم تكون أكبر من صفر.');return;}setError('');setSuccess('');setReview({...parsed.data,occurredAt:parsed.data.occurredAt.toISOString()});
  }
  async function save(){setError('');try{
    const result=await command.run(()=>review!,()=>crypto.randomUUID(),(input,key)=>readJson<{id:string}>('/inventory/movements',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(input)}));
    if(!result)return;setReview(null);setQuantity('');setReason('');setSuccess(`تم تسجيل حركة المخزون ${result.id} بنجاح.`);
  }catch(failure){setError(!command.pending&&failure instanceof ApiError&&failure.status===409 ? rejections[failure.code] ?? 'لم تُسجّل الحركة. راجع البيانات والأرصدة ثم أعد المراجعة.' : 'تعذر تأكيد نتيجة الحركة. أعد نفس الطلب المحفوظ قبل إنشاء حركة جديدة.');}}
  function facts(input:Command){return <dl className="operation-facts"><div><dt>نوع الحركة</dt><dd>{input.type==='OPENING_BALANCE' ? 'رصيد افتتاحي' : 'تسوية مخزون'}</dd></div><div><dt>الصنف</dt><dd>{options?.products.find(row=>row.id===input.productId)?.name ?? input.productId}</dd></div><div><dt>الفرع</dt><dd>{options?.warehouses.find(row=>row.id===input.warehouseId)?.name ?? input.warehouseId}</dd></div><div><dt>تغير الرصيد</dt><dd dir="ltr">{input.quantity} قطعة</dd></div><div><dt>السبب / المرجع</dt><dd>{input.referenceId}</dd></div><div><dt>وقت الحركة</dt><dd>{new Date(input.occurredAt).toLocaleString('ar-EG')}</dd></div></dl>;}
  return <section className="operation-panel"><OperationHeader id="stock-movement-title" title="الرصيد الافتتاحي وتسوية المخزون" description="الافتتاحي للصنف الذي لم تبدأ حركاته بالفرع. التسوية حركة مستقلة موثّقة؛ النقص يُرفض لو هيؤدي لعجز حالي أو تاريخي." icon="inventory"/>
    <PendingCommandNotice blocked={command.blocked} pending={!!command.pending} busy={command.busy} retry={()=>void save()}>{command.pending&&facts(command.pending.input)}</PendingCommandNotice>
    {!options ? <div><p role={loadingError ? 'alert' : 'status'}>{loadingError ? 'تعذر تحميل خيارات حركة المخزون.' : 'جارٍ تحميل خيارات حركة المخزون…'}</p>{loadingError&&<button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل خيارات الحركة</button>}</div> : <fieldset className="command-lock" disabled={command.busy||!!command.pending||command.blocked}>
      {review ? <div className="operation-detail"><h3>مراجعة حركة المخزون</h3>{facts(review)}<div className="operation-actions"><button className="button primary" onClick={()=>void save()}>تأكيد حركة المخزون</button><button className="button secondary" onClick={()=>setReview(null)}>رجوع لبيانات الحركة</button></div></div> : <form onSubmit={prepare} noValidate><div className="operation-fields two-columns">
        <label>نوع الحركة<select aria-label="نوع حركة الرصيد" value={type} onChange={event=>setType(event.target.value as typeof type)}><option value="OPENING_BALANCE">رصيد افتتاحي</option><option value="ADJUSTMENT">تسوية مخزون</option></select></label>
        <label>الصنف<select aria-label="صنف حركة الرصيد" value={productId} onChange={event=>setProduct(event.target.value)}><option value="">اختار الصنف</option>{options.products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>الفرع<select aria-label="فرع حركة الرصيد" value={warehouseId} onChange={event=>setWarehouse(event.target.value)}><option value="">اختار الفرع</option>{options.warehouses.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {type==='ADJUSTMENT'&&<label>اتجاه التسوية<select aria-label="اتجاه التسوية" value={direction} onChange={event=>setDirection(event.target.value)}><option value="increase">زيادة الرصيد</option><option value="decrease">نقص الرصيد</option></select></label>}
        <label>الكمية<input aria-label="كمية حركة الرصيد" inputMode="decimal" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
        <label>تاريخ ووقت الحركة<input aria-label="وقت حركة الرصيد" type="datetime-local" value={at} onChange={event=>setAt(event.target.value)}/></label>
        <label>السبب / المرجع<textarea aria-label="سبب حركة الرصيد" rows={3} maxLength={120} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      </div><div className="operation-actions"><button className="button primary" type="submit">مراجعة حركة المخزون</button></div></form>}
    </fieldset>}
    {error&&<p role="alert">{error}</p>}{success&&<p role="status">{success}</p>}
  </section>;
}
