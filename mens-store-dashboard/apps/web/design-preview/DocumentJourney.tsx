import { usePreviewDialog } from './usePreviewDialog.js';
import { useEffect, useRef, useState } from 'react';
import { RefundAllocation, initialRefund, refundPreviewError } from './RefundAllocation.js';
import { Icon } from '../src/ui/Icon.js';

export type DocumentJourneyKind = 'receipt' | 'return' | 'return-revision';
const units=(value:string)=>/^\d{1,15}(?:\.\d{1,4})?$/.test(value)?BigInt(value.split('.')[0]!)*10000n+BigInt((value.split('.')[1]??'').padEnd(4,'0')):null;
const titles:Record<DocumentJourneyKind,string>={receipt:'استلام أمر شراء',return:'مرتجع من فاتورة', 'return-revision':'عكس واستبدال مرتجع سابق'};

// Quantity checks illustrate interaction only. The real backend remains authoritative.
export function DocumentJourney({kind,reference,close,complete}:{kind:DocumentJourneyKind;reference:string;close:()=>void;complete:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const focus=useRef<HTMLHeadingElement>(null);
  const [quantities,setQuantities]=useState(['0','0']);
  const [reason,setReason]=useState('');
  const [review,setReview]=useState(false);
  const [discard,setDiscard]=useState(false);
  const [error,setError]=useState('');
  const [refund,setRefund]=useState(initialRefund);
  const [method,setMethod]=useState('نقدي');
  const [warehouse,setWarehouse]=useState('الفرع الرئيسي');
  const [condition,setCondition]=useState('صالح للبيع');
  const [originalReturn,setOriginalReturn]=useState('RET-0034');
  const [changed,setChanged]=useState(false);
  const [receiptStatus,setReceiptStatus]=useState('استلام جزئي');
  const receipt=kind==='receipt';
  const receiptBlocked=receipt&&['مكتمل الاستلام','ملغي'].includes(receiptStatus);
  const lines=receipt ? (receiptStatus==='مكتمل الاستلام' ? [['قميص أوكسفورد','24','24','0'],['بنطلون تشينو','18','18','0']] : [['قميص أوكسفورد','24',receiptStatus==='بانتظار الاستلام'?'0':'12',receiptStatus==='بانتظار الاستلام'?'24':'12'],['بنطلون تشينو','18','0','18']]) : [['قميص أوكسفورد','1','0','1'],['تيشيرت بولو','2','1','1']];
  usePreviewDialog(dialog);
  useEffect(()=>{if(review)focus.current?.focus();},[review]);
  const requestClose=()=>changed ? setDiscard(true) : close();
  function next(){
    if(receiptBlocked)return;
    if(quantities.some((value,index)=>units(value)===null||units(value)!>units(lines[index]![3]!)!)){setError('الكمية حتى 4 منازل عشرية، ومن غير تجاوز المتبقي أو المتاح للإرجاع.');return;}
    if(!quantities.some(value=>units(value)!>0n)){setError('اختار صنفًا واحدًا على الأقل بكمية أكبر من صفر.');return;}
    if(!reason.trim()){setError('اكتب مرجع الاستلام أو سبب الإرجاع / التصحيح.');return;}
    if(!receipt && method==='توزيع على أكثر من طريقة'){const allocationError=refundPreviewError(refund);if(allocationError){setError(allocationError);return;}}
    setError('');setReview(true);
  }
  return <dialog ref={dialog} className="planned-dialog document-journey" aria-labelledby="document-journey-title" onCancel={event=>{event.preventDefault();requestClose();}}>
    <header><h2 id="document-journey-title" tabIndex={-1} ref={focus}>{titles[kind]}</h2><button className="icon-button" aria-label="إغلاق رحلة المستند" onClick={requestClose}><Icon name="close"/></button></header>
    <div className="planned-review-note">معاينة تصميم للمستند <bdi>{reference}</bdi>. لا يتم استلام مخزون أو تسجيل استرداد فعلي. الكميات أرقام نموذجية لشرح الرحلة.</div>
    {discard && <div className="lifecycle-discard" role="alert"><h3>تجاهل تعديلات المستند؟</h3><button className="button secondary" onClick={()=>setDiscard(false)}>استكمال المستند</button><button className="button secondary" onClick={close}>تجاهل وإغلاق</button></div>}
    {review ? <><h3>مراجعة {receipt ? 'الكميات المستلمة' : 'الأصناف والاسترداد'}</h3>
      <dl className="planned-facts"><div><dt>المستند الأصلي</dt><dd>{reference}</dd></div><div><dt>الفرع</dt><dd>{warehouse}</dd></div><div><dt>{receipt ? 'مرجع إذن الاستلام' : 'السبب'}</dt><dd>{reason}</dd></div>{!receipt && <><div><dt>طريقة الاسترداد المقترحة</dt><dd>{method}</dd></div><div><dt>حالة الأصناف</dt><dd>{condition}</dd></div></>}{kind==='return-revision' && <div><dt>المرتجع المطلوب عكسه</dt><dd>{originalReturn}</dd></div>}{lines.map((line,index)=>units(quantities[index]!)!>0n && <div key={line[0]}><dt>{line[0]}</dt><dd>{quantities[index]} قطعة</dd></div>)}</dl>
      {!receipt && method==='توزيع على أكثر من طريقة' && <dl className="planned-facts"><div><dt>استرداد نقدي توضيحي</dt><dd>{refund.cash} ج.م</dd></div><div><dt>استرداد بطاقة توضيحي</dt><dd>{refund.card} ج.م</dd></div><div><dt>رصيد حساب توضيحي</dt><dd>{refund.account} ج.م</dd></div></dl>}
      <p>{receipt ? 'يظل المتبقي مفتوحًا للاستلام لاحقًا. الربط بين الاستلام وفاتورة المشتريات يُراجع قبل التشغيل.' : 'قيمة الاسترداد وطريقة توزيعه تستند للمستند الأصلي وسياسة التسوية المعتمدة. لن تُحسب قيمة مالية في هذه المعاينة.'}</p>
      {kind==='return-revision' && <p>المراجعة الفعلية تعكس المرتجع السابق وتُنشئ بديلًا مرتبطًا به في عملية واحدة؛ لا يتم تعديل أو حذف المستند السابق.</p>}
      <footer><button className="button primary" onClick={complete}>تأكيد المعاينة</button><button className="button secondary" onClick={()=>setReview(false)}>رجوع للكميات</button></footer>
    </> : <form noValidate onSubmit={event=>{event.preventDefault();next();}} onChange={()=>setChanged(true)}>
      {receipt&&<label className="field"><span>حالة أمر الشراء في المعاينة</span><select aria-label="حالة استلام الأمر" value={receiptStatus} onChange={event=>{setReceiptStatus(event.target.value);setError('');}}>{['بانتظار الاستلام','استلام جزئي','مكتمل الاستلام','ملغي'].map(value=><option key={value}>{value}</option>)}</select></label>}
      {receiptBlocked&&<div className="lifecycle-blocked" role="alert">الأمر {receiptStatus}؛ الاستلام الجديد غير متاح. راجع الاستلامات السابقة.</div>}
      <fieldset disabled={receiptBlocked} className="login-fields"><div className="planned-fields lifecycle-editor">
        {kind==='return-revision' && <label className="field"><span>المرتجع السابق</span><select aria-label="المرتجع السابق" value={originalReturn} onChange={event=>setOriginalReturn(event.target.value)}><option>RET-0034</option></select></label>}
        <label className="field"><span>{receipt ? 'الفرع المستلم' : 'فرع الإرجاع'}</span><select aria-label="فرع المستند" value={warehouse} onChange={event=>setWarehouse(event.target.value)}><option>الفرع الرئيسي</option><option>فرع مدينة نصر</option></select></label>
        {!receipt && <><label className="field"><span>طريقة الاسترداد المقترحة</span><select aria-label="استرداد المستند" value={method} onChange={event=>setMethod(event.target.value)}>{['نقدي','بطاقة','InstaPay','محفظة','تسوية حساب العميل','توزيع على أكثر من طريقة'].map(value=><option key={value}>{value}</option>)}</select></label><label className="field"><span>حالة الأصناف</span><select aria-label="حالة أصناف الإرجاع" value={condition} onChange={event=>setCondition(event.target.value)}><option>صالح للبيع</option><option>تالف · يحتاج مراجعة</option></select></label></>}
      </div>
      {!receipt && method==='توزيع على أكثر من طريقة' && <RefundAllocation parts={refund} change={setRefund}/>}<div className="table-wrap document-lines" role="region" aria-label="أصناف المستند وكمياتها" tabIndex={0}><table className="data-table"><thead><tr>{['الصنف',receipt ? 'المطلوب' : 'المباع',receipt ? 'مستلم سابقًا' : 'مرتجع سابقًا',receipt ? 'المتبقي' : 'متاح للإرجاع','الكمية الجديدة'].map(value=><th scope="col" key={value}>{value}</th>)}</tr></thead><tbody>{lines.map((line,index)=><tr key={line[0]}>{line.map((value,column)=><td key={column}>{value}</td>)}<td><input aria-label={`كمية ${line[0]}`} type="number" min="0" max={line[3]} step="0.0001" value={quantities[index]} onChange={event=>setQuantities(values=>values.map((value,item)=>item===index ? event.target.value : value))}/></td></tr>)}</tbody></table></div>
      <label className="field"><span>{receipt ? 'مرجع إذن الاستلام' : 'سبب الإرجاع / التصحيح'}</span><textarea aria-label="سبب أو مرجع المستند" rows={3} value={reason} onChange={event=>setReason(event.target.value)} required/></label>
      {error && <p className="lifecycle-error" role="alert">{error}</p>}
      <p>الأصناف ذات الكمية صفر لن تُدرج. {receipt ? 'يمكن استلام جزء من الكمية دون إغلاق المتبقي.' : 'الأصناف والكميات تُراجع من الفاتورة الأصلية قبل التأكيد.'}</p>
      <footer><button className="button primary" type="submit">مراجعة المستند</button><button className="button secondary" type="button" onClick={requestClose}>إلغاء</button></footer>
      </fieldset>
    </form>}
  </dialog>;
}
