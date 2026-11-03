import {AccountSelect} from './AccountSelect.js';
import {useState,type FormEvent} from 'react';
import {invoiceReturnCommandSchema,saleDocumentSchema,type InvoiceReturnCommand,type SaleDocument} from '@ahmed-store/contracts';
import {PendingCommandNotice,usePendingCommand} from './pending-command.js';
import {ApiError,decimal,readJson,units} from './store-api.js';
import {operationLabel} from './operation-format.js';

const validate=(input:unknown)=>{invoiceReturnCommandSchema.parse(input);};
const methods=['CASH','CARD','WALLET','INSTAPAY','CREDIT'] as const;
export function returnAmount(sale:SaleDocument,lines:Array<{saleLineId:string;quantity:string}>){
  return lines.reduce((sum,row)=>{const source=sale.lines.find(line=>line.id===row.saleLineId)!;const numerator=units(source.total)!*units(row.quantity)!,denominator=units(source.quantity)!;return sum+numerator/denominator+(numerator%denominator*2n>=denominator?1n:0n);},0n);
}
export function InvoiceReturnEditor({sale,original,close,complete}:{sale:SaleDocument;original?:SaleDocument['returns'][number];close:()=>void;complete:(id:string)=>void}){
  const [accountIds,setAccountIds]=useState<Record<string,string>>({});
  const pending=usePendingCommand<InvoiceReturnCommand>('invoice-return.'+sale.id,validate);
  const [quantities,setQuantities]=useState<Record<string,string>>(()=>Object.fromEntries(sale.lines.map(line=>[line.id,original?decimal(original.lines.filter(row=>row.saleLineId===line.id).reduce((sum,row)=>sum+units(row.quantity)!,0n)):''])));
  const [payments,setPayments]=useState<Record<string,string>>(()=>Object.fromEntries(methods.map(method=>[method,original?decimal(original.payments.filter(row=>row.method===method).reduce((sum,row)=>sum+units(row.amount)!,0n)):''])));
  const [reason,setReason]=useState(original?.reason??''),[review,setReview]=useState<InvoiceReturnCommand|null>(null),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[dirty,setDirty]=useState(false);
  const command=pending.pending?.input??review;
  function prepare(event:FormEvent){
    event.preventDefault();setError('');
    const lines=[];for(const line of sale.lines){const text=quantities[line.id]!;if(text==='')continue;const quantity=units(text),previous=original?.lines.filter(row=>row.saleLineId===line.id).reduce((sum,row)=>sum+units(row.quantity)!,0n)??0n;
      if(quantity===null||quantity>units(line.quantity)!-units(line.returnedQuantity)!+previous){setError('كمية المرتجع غير صحيحة أو تتجاوز المتاح.');return;}if(quantity>0n)lines.push({saleLineId:line.id,quantity:decimal(quantity)});
    }
    const refunds=[];for(const method of methods){const text=payments[method]!;if(text==='')continue;const amount=units(text);if(amount===null){setError('راجع مبالغ رد القيمة.');return;}if(amount>0n)refunds.push({method,amount:decimal(amount),...(accountIds[method]?{accountId:accountIds[method]}:{})});}
    const parsed=invoiceReturnCommandSchema.safeParse({...(original?{returnId:original.id}:{}),input:{saleId:sale.id,lines,payments:refunds,reason,occurredAt:new Date()}});
    if(!parsed.success){setError('اختر أصنافًا وكميات موجبة وسببًا لا يقل عن ٣ أحرف وطريقة لرد القيمة.');return;}
    if(refunds.reduce((sum,row)=>sum+units(row.amount)!,0n)!==returnAmount(sale,lines)){setError('مجموع رد القيمة لازم يساوي إجمالي الأصناف المرتجعة.');return;}setReview(parsed.data);
  }
  async function confirm(){setError('');try{const result=await pending.run(()=>review!,()=>crypto.randomUUID(),async(cmd,key)=>{
    const response=await readJson<{id:string}>(cmd.returnId?`/returns/${cmd.returnId}/revise`:'/returns',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(cmd.input)});return{id:saleDocumentSchema.shape.id.parse(response.id)};
  });if(result)complete(result.id);}catch(problem){setError(problem instanceof ApiError&&problem.status<500?'رفض التسجيل. حدّث الفاتورة وراجع الكميات والسداد والوردية قبل إعادة المحاولة.':'تعذر تأكيد المرتجع. أعد نفس الطلب المحفوظ للتحقق من نتيجته.');}}
  function requestClose(){if(dirty&&!pending.pending)setDiscard(true);else close();}
  return <section className="operation-detail" aria-label="تسجيل مرتجع الفاتورة"><h3>{original?'تصحيح مرتجع بمستند بديل':'مرتجع مرتبط بالفاتورة'}</h3>
    <PendingCommandNotice blocked={pending.blocked} pending={!!pending.pending} busy={pending.busy} retry={()=>void confirm()}/>
    {command?<><h4>مراجعة المرتجع قبل التسجيل</h4><p>الفاتورة: <bdi>{command.input.saleId}</bdi>{command.returnId&&<> · تصحيح المرتجع <bdi>{command.returnId}</bdi></>}</p><ul>{command.input.lines.map(row=><li key={row.saleLineId}>{sale.lines.find(line=>line.id===row.saleLineId)!.productName}: {row.quantity}</li>)}</ul><p className="operation-total">إجمالي رد القيمة <strong>{decimal(returnAmount(sale,command.input.lines))} ج.م</strong></p><ul>{command.input.payments.map(row=><li key={row.method}>{operationLabel(row.method)}: {row.amount}</li>)}</ul><p>{command.input.reason}</p>{command.returnId&&<p className="operation-note">التأكيد يعكس المرتجع السابق ويُسجّل البديل معًا بتاريخ حالي.</p>}{!pending.pending&&<div className="operation-actions"><button className="button primary" disabled={pending.busy} onClick={()=>void confirm()}>تأكيد تسجيل المرتجع</button><button className="button secondary" disabled={pending.busy} onClick={()=>setReview(null)}>رجوع لبيانات المرتجع</button></div>}</>:<form noValidate onSubmit={prepare} onChange={()=>setDirty(true)}><fieldset disabled={pending.busy||pending.blocked}><div className="operation-table-wrap" role="region" aria-label="أصناف المرتجع" tabIndex={0}><table><thead><tr><th>الصنف</th><th>المباع</th><th>المرتجع المسجل</th><th>الكمية المرتجعة</th></tr></thead><tbody>{sale.lines.map(line=><tr key={line.id}><td>{line.productName}</td><td>{line.quantity}</td><td>{line.returnedQuantity}</td><td><input inputMode="decimal" aria-label={`مرتجع ${line.productName}`} value={quantities[line.id]!} onChange={event=>setQuantities(value=>({...value,[line.id]:event.target.value}))}/></td></tr>)}</tbody></table></div><div className="operation-fields">{methods.map(method=><div key={method}><label>{method==='CREDIT'?'تخفيض مديونية العميل':`رد ${operationLabel(method)}`}<input inputMode="decimal" aria-label={`رد ${method}`} value={payments[method]!} onChange={event=>setPayments(value=>({...value,[method]:event.target.value}))}/></label><AccountSelect method={method} value={accountIds[method]} onChange={id=>setAccountIds(old=>({...old,[method]:id}))} label={`خزينة رد ${method}`}/></div>)}<label>السبب<textarea aria-label="سبب مرتجع الفاتورة" value={reason} maxLength={500} onChange={event=>setReason(event.target.value)}/></label></div><button className="button primary" type="submit">مراجعة المرتجع</button></fieldset></form>}
    {error&&<p role="alert">{error}</p>}{discard&&<p role="alert">تجاهل بيانات المرتجع غير المحفوظة؟ <button className="button secondary" onClick={()=>setDiscard(false)}>استكمال المرتجع</button><button className="button secondary" onClick={close}>تجاهل وإغلاق المرتجع</button></p>}<button className="button secondary" disabled={pending.busy} onClick={requestClose}>إغلاق نموذج المرتجع</button>
  </section>;
}
