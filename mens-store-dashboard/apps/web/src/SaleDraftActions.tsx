import {useState} from 'react';
import {draftActionCommandSchema,saleDraftSchema,paymentMethodSchema,type SaleDraft,type PaymentMethod} from '@ahmed-store/contracts';
import type {z} from 'zod';
import {PendingCommandNotice,usePendingCommand} from './pending-command.js';
import {ApiError,readJson,units} from './store-api.js';
import {operationLabel} from './operation-format.js';
const validate=(value:unknown)=>{draftActionCommandSchema.parse(value);};
export function SaleDraftActions({draft,complete}:{draft:SaleDraft;complete:(value:SaleDraft)=>void}){
  const [payments,setPayments]=useState<Record<PaymentMethod,string>>({CASH:draft.total,CARD:'',WALLET:'',INSTAPAY:'',CREDIT:''}),[review,setReview]=useState<z.infer<typeof draftActionCommandSchema>|null>(null),[error,setError]=useState('');
  const pending=usePendingCommand<z.infer<typeof draftActionCommandSchema>>('draft-action.'+draft.id,validate),command=pending.pending?.input??review;
  function prepare(action:'cancel'|'convert'){
    const allocations=paymentMethodSchema.options.filter(method=>payments[method]!=='').map(method=>({method,amount:payments[method]}));
    if(action==='convert'&&(allocations.some(p=>units(p.amount)===null||units(p.amount)!<=0n)||allocations.reduce((sum,p)=>sum+units(p.amount)!,0n)!==units(draft.total))){setError('مجموع السداد لازم يساوي إجمالي المسودة.');return;}
    setError('');setReview(draftActionCommandSchema.parse({action,id:draft.id,input:{version:draft.version,...action==='convert'?{payments:allocations}:{}}}));
  }
  async function confirm(){setError('');try{
    const result=await pending.run(()=>review!,()=>crypto.randomUUID(),async cmd=>saleDraftSchema.parse(await readJson<unknown>(`/sale-drafts/${cmd.id}/${cmd.action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cmd.input)})));if(result)complete(result);
  }catch(problem){setError(problem instanceof ApiError?'رفض التسجيل. حدّث المسودة وراجع الرصيد والسداد والوردية.':'تعذر تأكيد النتيجة. أعد نفس الطلب المحفوظ.');}}
  return <section className="operation-detail" aria-label="اعتماد المسودة"><h3>اعتماد المسودة</h3><PendingCommandNotice blocked={pending.blocked} pending={!!pending.pending} busy={pending.busy} retry={()=>void confirm()}/>
    {command?<><p>{command.action==='convert'?'تأكيد البيع بتاريخ حالي وتحديث المخزون والأرصدة':'تأكيد إلغاء المسودة بدون حركات مالية'}</p><p>الإجمالي: <bdi>{draft.total}</bdi> ج.م</p>{command.action==='convert'&&<ul>{command.input.payments.map((p,i)=><li key={i}>{operationLabel(p.method)}: {p.amount}</li>)}</ul>}{!pending.pending&&<div className="operation-actions"><button className="button primary" disabled={pending.busy} onClick={()=>void confirm()}>تأكيد العملية</button><button className="button secondary" disabled={pending.busy} onClick={()=>setReview(null)}>رجوع للسداد</button></div>}</>:<fieldset disabled={pending.busy||pending.blocked}><div className="operation-fields">{paymentMethodSchema.options.map(method=><label key={method}>{operationLabel(method)}<input inputMode="decimal" aria-label={`سداد ${method}`} value={payments[method]} onChange={event=>setPayments(old=>({...old,[method]:event.target.value}))}/></label>)}</div><div className="operation-actions"><button className="button primary" onClick={()=>prepare('convert')}>مراجعة تحويل المسودة لبيع</button><button className="button secondary" onClick={()=>prepare('cancel')}>إلغاء المسودة</button></div></fieldset>}{error&&<p role="alert">{error}</p>}
  </section>;
}
