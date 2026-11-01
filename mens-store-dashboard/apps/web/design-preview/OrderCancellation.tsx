import { useRef, useState } from 'react';
import { usePreviewDialog } from './usePreviewDialog.js';
import { Icon } from '../src/ui/Icon.js';

export function OrderCancellation({reference,close,complete}:{reference:string;close:()=>void;complete:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);usePreviewDialog(dialog);
  const [status,setStatus]=useState('استلام جزئي'),[reason,setReason]=useState(''),[review,setReview]=useState(false),[discard,setDiscard]=useState(false),[error,setError]=useState('');
  const blocked=status==='مكتمل الاستلام'||status==='ملغي';
  const requestClose=()=>reason ? setDiscard(true) : close();
  return <dialog ref={dialog} className="planned-dialog document-journey" aria-labelledby="order-cancel-title" onCancel={event=>{event.preventDefault();requestClose();}}>
    <header><h2 id="order-cancel-title">إلغاء المتبقي من أمر الشراء</h2><button className="icon-button" aria-label="إغلاق إلغاء أمر الشراء" onClick={requestClose}><Icon name="close"/></button></header>
    <p className="planned-review-note">معاينة تصميم للمستند <bdi>{reference}</bdi>؛ لا تغيّر طلبًا أو استلامًا فعليًا.</p>
    {discard&&<div role="alert" className="lifecycle-discard"><p>تجاهل سبب الإلغاء؟</p><button className="button secondary" onClick={()=>setDiscard(false)}>استكمال سبب الإلغاء</button><button className="button secondary" onClick={close}>تجاهل السبب وإغلاق</button></div>}
    {review ? <><h3>مراجعة إلغاء المتبقي</h3><dl className="planned-facts"><div><dt>أمر الشراء</dt><dd>{reference}</dd></div><div><dt>حالة الأمر</dt><dd>{status}</dd></div><div><dt>السبب</dt><dd>{reason}</dd></div><div><dt>قميص أوكسفورد</dt><dd>{status==='استلام جزئي'?'12':'24'} قطعة متبقية تُلغى</dd></div><div><dt>بنطلون تشينو</dt><dd>18 قطعة متبقية تُلغى</dd></div></dl><p>الاستلامات السابقة وفواتيرها محفوظة. هذا الإجراء لا يعكس مخزونًا أو سدادًا، ولا يحذف المستند الأصلي.</p><footer><button className="button primary" onClick={complete}>تأكيد معاينة إلغاء الأمر</button><button className="button secondary" onClick={()=>setReview(false)}>رجوع لسبب الإلغاء</button></footer></> : <>
      <label className="field"><span>حالة الأمر في المعاينة</span><select aria-label="حالة إلغاء أمر الشراء" value={status} onChange={event=>{setStatus(event.target.value);setError('');}}>{['بانتظار الاستلام','استلام جزئي','مكتمل الاستلام','ملغي'].map(value=><option key={value}>{value}</option>)}</select></label>
      {blocked ? <div role="alert" className="lifecycle-blocked"><h3>لا يوجد متبقٍ قابل للإلغاء</h3><p>الأمر {status}. راجع المستند أو الاستلامات المرتبطة به؛ لا يتكرر الإلغاء.</p></div> : <><p>يُلغى المتبقي فقط، ويظل المستلم سابقًا محفوظًا.</p><label className="field"><span>سبب الإلغاء</span><textarea aria-label="سبب إلغاء أمر الشراء" rows={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>{error&&<p role="alert" className="lifecycle-error">{error}</p>}<footer><button className="button primary" onClick={()=>{if(reason.trim().length<3){setError('اكتب سببًا واضحًا لإلغاء المتبقي.');return;}setError('');setReview(true);}}>مراجعة إلغاء أمر الشراء</button><button className="button secondary" onClick={requestClose}>رجوع للأمر</button></footer></>}
    </>}
  </dialog>;
}
