import { usePreviewDialog } from './usePreviewDialog.js';
import { useRef, useState } from 'react';
import { Icon } from '../src/ui/Icon.js';

export function HeldDocumentJourney({reference,action,close,complete}:{reference:string;action:'continue'|'cancel';close:()=>void;complete:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [scenario,setScenario]=useState('جاهز للاستكمال');
  const [reason,setReason]=useState('');
  const [review,setReview]=useState(false);
  const [renewal,setRenewal]=useState(false);
  const [renewalDate,setRenewalDate]=useState('2026-11-05');
  const [accepted,setAccepted]=useState(false);
  const [error,setError]=useState('');
  const [discard,setDiscard]=useState(false);
  const requestClose=()=>reason.trim()||accepted||renewal ? setDiscard(true) : close();
  usePreviewDialog(dialog);
  const cancelling=action==='cancel';
  const blocked=['تم التحويل سابقًا','ملغي'].includes(scenario)||(!cancelling && ['منتهي الصلاحية','مخزون غير كافٍ'].includes(scenario));
  function next(){
    if(blocked)return;
    if(cancelling && !reason.trim()){setError('اكتب سبب إلغاء المستند.');return;}
    if(!cancelling && scenario==='تغيّر السعر' && !accepted){setError('راجع تغيّر السعر ووافق على إعادة التسعير قبل المتابعة.');return;}
    setError('');setReview(true);
  }
  return <dialog ref={dialog} className="planned-dialog" aria-labelledby="held-title" onCancel={event=>{event.preventDefault();requestClose();}}>
    <header><h2 id="held-title">{cancelling ? 'إلغاء المستند المعلّق' : 'استكمال عرض السعر / المعلّق'}</h2><button className="icon-button" aria-label="إغلاق رحلة المعلّق" onClick={requestClose}><Icon name="close"/></button></header>
    <div className="planned-review-note">المستند <bdi>{reference}</bdi> · معاينة تفاعل فقط. لا يتم إنشاء بيع أو نقل أصناف إلى نقطة البيع الفعلية.</div>
    {discard && <div className="lifecycle-discard" role="alert"><h3>تجاهل تعديلات المستند المعلّق؟</h3><button className="button secondary" onClick={()=>setDiscard(false)}>استكمال التعديل</button><button className="button secondary" onClick={close}>تجاهل وإغلاق</button></div>}{review ? <><h3>{cancelling ? 'مراجعة الإلغاء' : 'مراجعة الاستكمال'}</h3><dl className="planned-facts"><div><dt>المستند</dt><dd>{reference}</dd></div><div><dt>الخطوة التالية</dt><dd>{cancelling ? 'إلغاء مع حفظ السبب والتاريخ' : 'مسودة بيع تحتاج مراجعة وسداد'}</dd></div>{cancelling && <div><dt>سبب الإلغاء</dt><dd>{reason}</dd></div>}</dl><p>{cancelling ? 'إلغاء العرض أو المعلّق لا يعكس بيعًا مسجلًا ولا يحذف تاريخه.' : 'عند الربط، يعيد الخادم فحص الصلاحية والمخزون والأسعار ويمنع التحويل المتكرر. هذه الخطوة لا تؤكد بيعًا.'}</p><footer><button className="button primary" onClick={complete}>تأكيد المعاينة</button><button className="button secondary" onClick={()=>setReview(false)}>رجوع للمراجعة</button></footer></> : <>
      {<label className="field lifecycle-editor"><span>حالة المستند في المعاينة</span><select aria-label="حالة المعلّق التجريبية" value={scenario} onChange={event=>{setScenario(event.target.value);setAccepted(false);setError('');setRenewal(false);}}>{['جاهز للاستكمال','منتهي الصلاحية','تم التحويل سابقًا','ملغي','مخزون غير كافٍ','تغيّر السعر'].map(value=><option key={value}>{value}</option>)}</select></label>}
      <div className="table-wrap document-lines" role="region" aria-label="أصناف المستند المعلّق" tabIndex={0}><table className="data-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر محفوظ (ج.م)</th><th>سعر حالي نموذجي (ج.م)</th></tr></thead><tbody><tr><td>قميص أوكسفورد</td><td>2</td><td>690.00</td><td>{scenario==='تغيّر السعر' ? '710.00' : '690.00'}</td></tr></tbody></table></div>
      {blocked && <div className="lifecycle-blocked" role="alert"><h3>{cancelling ? 'لا يمكن إلغاء المستند' : 'لا يمكن استكمال المستند'}</h3><p>{scenario==='تم التحويل سابقًا' ? 'هذا المستند مرتبط بفاتورة سابقة. افتح مرجعها بدل إنشاء بيع جديد.' : scenario==='منتهي الصلاحية' ? 'راجع صلاحية العرض والأسعار قبل تجهيز نسخة جديدة.' : scenario==='ملغي' ? 'المستند ملغي؛ أنشئ مستندًا جديدًا بعد مراجعة الطلب.' : 'راجع الكميات أو التوريد قبل الاستكمال.'}</p>{scenario==='تم التحويل سابقًا' && <a className="button secondary" href="#sales" onClick={close}>فتح سجل الفواتير</a>}{scenario==='مخزون غير كافٍ' && <a className="button secondary" href="#inventory" onClick={close}>مراجعة المخزون</a>}{scenario==='منتهي الصلاحية' && <button className="button secondary" onClick={()=>setRenewal(true)}>معاينة تجديد العرض</button>}</div>}
      {renewal && <section className="statement-document"><h3>نسخة جديدة من العرض</h3><label className="field"><span>صلاحية النسخة الجديدة</span><input type="date" aria-label="صلاحية العرض الجديد" value={renewalDate} onChange={event=>setRenewalDate(event.target.value)}/></label><p>تبقى النسخة المنتهية محفوظة، وتراجع أسعار النسخة الجديدة قبل إتاحتها.</p><button className="button secondary" onClick={()=>{if(renewalDate<='2026-10-30'){setError('اختار تاريخًا بعد تاريخ المعاينة: 30 أكتوبر 2026.');return;}setRenewal(false);setScenario('تغيّر السعر');setError('');}}>مراجعة النسخة الجديدة</button></section>}
      {!cancelling && scenario==='تغيّر السعر' && <label className="lifecycle-check"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>راجعت السعر الحالي المقترح قبل تجهيز مسودة البيع</label>}
      {cancelling && <label className="field lifecycle-editor"><span>سبب الإلغاء</span><textarea aria-label="سبب إلغاء المعلّق" rows={3} value={reason} onChange={event=>setReason(event.target.value)}/></label>}
      {error && <p className="lifecycle-error" role="alert">{error}</p>}
      <footer><button className="button primary" disabled={blocked} onClick={next}>{cancelling ? 'مراجعة الإلغاء' : 'مراجعة الاستكمال'}</button><button className="button secondary" onClick={requestClose}>رجوع للمستند</button></footer>
    </>}
  </dialog>;
}
