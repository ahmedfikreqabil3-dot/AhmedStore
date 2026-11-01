import {useEffect,useRef,useState} from 'react';
import {partyLifecycleSchema,partyLifecycleResultSchema,type Customer,type Supplier} from '@ahmed-store/contracts';
import {ApiError,readJson} from './store-api.js';

const failures:Record<string,string>={OPEN_BALANCE:'يوجد رصيد مستحق على الحساب أو لصالحه. سوِّ الرصيد قبل الأرشفة.',PENDING_DOCUMENT:'يوجد طلب مفتوح مرتبط بالطرف. راجعه قبل الأرشفة.',VERSION_CONFLICT:'تغيّرت بيانات الطرف. حدّث القائمة وراجع آخر نسخة.',ACTOR_UNAVAILABLE:'الصلاحية الحالية لا تسمح بهذا الإجراء.',PARTY_NOT_FOUND:'السجل غير متاح في مؤسستك.'};
export function PartyLifecycle({kind,party,close,complete}:{kind:'customers'|'suppliers';party:Customer|Supplier;close:()=>void;complete:()=>void}){
  const heading=useRef<HTMLHeadingElement>(null),saving=useRef(false);
  const [reason,setReason]=useState(''),[review,setReview]=useState(false),[discard,setDiscard]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{heading.current?.focus();},[]);
  const title=party.active?'أرشفة':'إعادة تفعيل';
  const requestClose=()=>{if(!saving.current){if(reason)setDiscard(true);else close();}};
  async function save(){
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{partyLifecycleResultSchema.parse(await readJson(`/${kind}/${party.id}/lifecycle`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({version:party.version,active:!party.active,reason:reason.trim()})}));complete();}
    catch(failure){setError(failure instanceof ApiError ? (failures[failure.code] ?? 'تعذر تأكيد الإجراء. حدّث السجل قبل إعادة المحاولة.') : 'تعذر تأكيد الإجراء. قد تكون حالة السجل تغيّرت؛ حدّث القائمة للتحقق.');}
    finally{saving.current=false;setBusy(false);}
  }
  return <section className="operation-detail" aria-labelledby="party-lifecycle-title"><h3 id="party-lifecycle-title" ref={heading} tabIndex={-1}>{title} {party.name}</h3>
    <p className="operation-note">{party.active?'الأرشفة توقف التعامل الجديد وتحافظ على كشف الحساب والمستندات السابقة. لا تتم مع رصيد غير مسوّى أو طلب مفتوح.':'التفعيل يعيد السجل إلى قوائم التعامل الجديد ويحافظ على تاريخه.'}</p>
    {discard&&<div role="alert"><p>تجاهل سبب الإجراء؟</p><button className="button secondary" onClick={()=>setDiscard(false)}>استكمال إجراء الطرف</button><button className="button secondary" onClick={close}>تجاهل الإجراء وإغلاق</button></div>}
    {review ? <><h4>مراجعة إجراء الطرف</h4><dl className="operation-facts"><div><dt>الطرف</dt><dd>{party.name}</dd></div><div><dt>الإجراء</dt><dd>{title}</dd></div><div><dt>السبب</dt><dd>{reason}</dd></div></dl><div className="operation-actions"><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?'جارٍ التحقق والحفظ…':`تأكيد ${title} الطرف`}</button><button className="button secondary" disabled={busy} onClick={()=>setReview(false)}>رجوع لسبب الإجراء</button></div></> : <form noValidate onSubmit={event=>{event.preventDefault();if(!partyLifecycleSchema.safeParse({version:party.version,active:!party.active,reason}).success){setError('اكتب سببًا واضحًا من ٣ إلى ٥٠٠ حرف.');return;}setError('');setReview(true);}}><label className="field">سبب الإجراء<textarea aria-label="سبب إجراء الطرف" value={reason} onChange={event=>setReason(event.target.value)} rows={3} maxLength={500}/></label><button className="button primary" type="submit">مراجعة إجراء الطرف</button></form>}
    {error&&<div role="alert"><p>{error}</p><button className="button secondary" disabled={busy} onClick={close}>تحديث السجل وإغلاق</button></div>}
    <button className="button secondary" disabled={busy} onClick={requestClose}>إلغاء إجراء الطرف</button>
  </section>;
}
