import { usePreviewDialog } from './usePreviewDialog.js';
import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '../src/ui/Icon.js';

const units=(value:string)=>/^\d+(?:\.\d{1,4})?$/.test(value) ? BigInt(value.split('.')[0]!)*10000n+BigInt((value.split('.')[1] ?? '').padEnd(4,'0')) : null;
const show=(value:bigint)=>`${value<0n ? '-' : ''}${(value<0n ? -value : value)/10000n}.${((value<0n ? -value : value)%10000n).toString().padStart(4,'0')}`;
function Frame({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);usePreviewDialog(ref);
  return <dialog ref={ref} className="planned-dialog" aria-labelledby="operation-journey-title" onCancel={event=>{event.preventDefault();close();}}><header><h2 id="operation-journey-title">{title}</h2><button className="icon-button" aria-label="إغلاق رحلة العملية" onClick={close}><Icon name="close"/></button></header><p className="planned-review-note">سيناريو تصميم ثابت؛ لا يُحدّث مخزونًا أو رصيدًا فعليًا. يتحقق الخادم من الأرصدة والصلاحيات عند الربط.</p>{children}</dialog>;
}
export function OperationJourneys({kind,close,complete}:{kind:'stock'|'transfer'|'settlement';close:()=>void;complete:()=>void}){
  const [mode,setMode]=useState('تحويل بين الفروع');
  const [source,setSource]=useState(kind==='transfer' ? 'الخزينة الرئيسية' : 'الرئيسي');const [target,setTarget]=useState(kind==='transfer' ? 'حساب البنك' : 'مدينة نصر');
  const [amount,setAmount]=useState('');const [reason,setReason]=useState('');
  const [quantities,setQuantities]=useState(['24','18']);
  const [allocations,setAllocations]=useState(['0','0']);
  const [partyType,setPartyType]=useState('تحصيل من عميل');
  const [treasury,setTreasury]=useState('الخزينة الرئيسية');const [payment,setPayment]=useState('نقدي');
  const [error,setError]=useState('');const [review,setReview]=useState(false);
  const [dirty,setDirty]=useState(false);const [discard,setDiscard]=useState(false);
  const requestClose=()=>dirty ? setDiscard(true) : close();
  const isCount=mode==='جرد فعلي';const isStockTransfer=mode==='تحويل بين الفروع';
  const due=partyType==='تحصيل من عميل' ? ['750','500'] : ['10000','8500'];
  function next(){
    if(reason.trim().length<3){setError('اكتب سببًا أو بيانًا واضحًا من 3 أحرف على الأقل.');return;}
    if(kind==='stock'){
      if(isStockTransfer && source===target){setError('الفرع المصدر والمستلم لازم يكونوا مختلفين.');return;}
      if(isCount){if(quantities.some(value=>units(value)===null)){setError('اكتب الكمية الفعلية كعدد غير سالب، حتى 4 منازل عشرية.');return;}}
      else {const value=units(amount);if(value===null||value===0n){setError('الكمية لازم تكون أكبر من صفر وبحد أقصى 4 منازل عشرية.');return;}if(mode==='رصيد افتتاحي' && source==='الرئيسي'){setError('الفرع له رصيد سابق؛ استخدم الجرد أو التسوية، أو اختر الفرع الجديد في النموذج.');return;}if((isStockTransfer||mode==='نقص بتسوية') && value>(source==='الرئيسي' ? 240000n : 0n)){setError('الكمية تتجاوز الرصيد النموذجي المتاح للفرع المختار.');return;}}
    }else if(kind==='transfer'){
      if(source===target){setError('اختار حسابين مختلفين للتحويل.');return;}
      const value=units(amount);if(value===null||value===0n||value>(source==='حساب البنك' ? 382000000n : 126800000n)){setError('المبلغ يجب أن يكون موجبًا ولا يتجاوز الرصيد النموذجي 12,680.00 ج.م.');return;}
    }else{
      const value=units(amount);const parts=allocations.map(units);
      if(value===null||value===0n||parts.some((part,index)=>part===null||part>units(due[index]!)!)){setError('راجع المبلغ والتوزيع؛ التسوية لا تتجاوز مستحق كل مستند في هذا السيناريو.');return;}
      if(partyType==='سداد لمورد' && value>(treasury==='حساب البنك' ? 382000000n : 126800000n)){setError('المبلغ يتجاوز الرصيد النموذجي لحساب السداد المختار.');return;}
      if(parts.reduce<bigint>((sum,part)=>sum+part!,0n)!==value){setError('مجموع التوزيع لازم يساوي مبلغ التحصيل أو السداد.');return;}
    }
    setError('');setReview(true);
  }
  const title=kind==='stock' ? 'الجرد وحركات المخزون' : kind==='transfer' ? 'تحويل بين الخزائن' : 'توزيع التحصيل والسداد';
  return <Frame title={title} close={requestClose}>
    {discard && <div className="lifecycle-discard" role="alert"><h3>تجاهل مدخلات العملية؟</h3><button className="button secondary" onClick={()=>setDiscard(false)}>استكمال العملية</button><button className="button secondary" onClick={close}>تجاهل وإغلاق</button></div>}
    {review ? <><h3>مراجعة العملية</h3><dl className="planned-facts"><div><dt>نوع العملية</dt><dd>{kind==='stock' ? mode : title}</dd></div><div><dt>البيان</dt><dd>{reason}</dd></div>{kind==='stock' && isCount ? quantities.map((value,index)=><div key={index}><dt>{index===0 ? 'قميص أوكسفورد' : 'بنطلون تشينو'} · الفرق عن الدفتر</dt><dd><bdi>{show(units(value)!-BigInt(index===0 ? 24 : 18)*10000n)}</bdi> قطعة</dd></div>) : <><div><dt>{kind==='stock' ? 'الكمية' : 'المبلغ'}</dt><dd>{amount} {kind==='stock' ? 'قطعة' : 'ج.م'}</dd></div>{kind!=='settlement' && <><div><dt>المصدر</dt><dd>{source}</dd></div><div><dt>المستلم</dt><dd>{target}</dd></div></>}{kind==='settlement' && <><div><dt>حساب السداد</dt><dd>{treasury}</dd></div><div><dt>طريقة السداد</dt><dd>{payment}</dd></div></>}{kind==='settlement' && allocations.map((value,index)=><div key={index}><dt>تسوية المستند {index+1}</dt><dd>{value} ج.م</dd></div>)}</>}</dl><p>{kind==='stock' && isCount ? 'التسوية تعتمد فرق الجرد مع حفظ الكمية الدفترية والكمية الفعلية والسبب. يعاد فحص الرصيد قبل التنفيذ.' : kind==='settlement' ? 'لا يتم إسقاط المبلغ على مستندات أخرى تلقائيًا. الزيادة أو الدفعات المقدمة تحتاج سياسة معتمدة.' : 'التحويل حركة خروج ودخول مترابطة؛ تنجحان معًا أو تُلغيان معًا في التنفيذ الفعلي.'}</p><footer><button className="button primary" onClick={complete}>تأكيد معاينة العملية</button><button className="button secondary" onClick={()=>setReview(false)}>رجوع لمدخلات العملية</button></footer></> : <form noValidate onChange={()=>setDirty(true)} onSubmit={event=>{event.preventDefault();next();}}>
      <div className="planned-fields lifecycle-editor">
        {kind==='stock' && <label className="field"><span>نوع حركة المخزون</span><select aria-label="نوع حركة المخزون" value={mode} onChange={event=>{setMode(event.target.value);setError('');}}>{['رصيد افتتاحي','جرد فعلي','زيادة بتسوية','نقص بتسوية','تحويل بين الفروع'].map(value=><option key={value}>{value}</option>)}</select></label>}
        {kind==='settlement' ? <><label className="field"><span>نوع التسوية</span><select aria-label="نوع التسوية" value={partyType} onChange={event=>{setPartyType(event.target.value);setAllocations(['0','0']);setAmount('');}}><option>تحصيل من عميل</option><option>سداد لمورد</option></select></label><label className="field"><span>الطرف</span><select aria-label="طرف التسوية"><option>{partyType==='تحصيل من عميل' ? 'أحمد محمود' : 'شركة النخبة'}</option></select></label><label className="field"><span>حساب السداد</span><select aria-label="حساب التسوية" value={treasury} onChange={event=>setTreasury(event.target.value)}><option>الخزينة الرئيسية</option><option>حساب البنك</option></select></label><label className="field"><span>طريقة السداد</span><select aria-label="طريقة التسوية" value={payment} onChange={event=>setPayment(event.target.value)}><option>نقدي</option><option>بطاقة</option><option>InstaPay</option><option>محفظة</option></select></label></> : <><label className="field"><span>{kind==='stock' ? 'الفرع المصدر / الفرع' : 'الحساب المصدر'}</span><select aria-label="مصدر العملية" value={source} onChange={event=>setSource(event.target.value)}>{(kind==='stock' ? ['الرئيسي','مدينة نصر'] : ['الخزينة الرئيسية','حساب البنك']).map(value=><option key={value}>{value}</option>)}</select></label>{(kind==='transfer'||isStockTransfer) && <label className="field"><span>{kind==='stock' ? 'الفرع المستلم' : 'الحساب المستلم'}</span><select aria-label="مستلم العملية" value={target} onChange={event=>setTarget(event.target.value)}>{(kind==='stock' ? ['الرئيسي','مدينة نصر'] : ['الخزينة الرئيسية','حساب البنك']).map(value=><option key={value}>{value}</option>)}</select></label>}</>}
        {kind==='stock' && !isCount && <label className="field"><span>الصنف</span><select><option>قميص أوكسفورد · رصيد نموذجي 24 قطعة</option></select></label>}
        {!(kind==='stock'&&isCount) && <label className="field"><span>{kind==='stock' ? 'الكمية' : 'المبلغ (ج.م)'}</span><input aria-label="قيمة العملية" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></label>}
        <label className="field wide"><span>السبب / البيان</span><textarea aria-label="بيان العملية" rows={3} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      </div>
      {kind==='stock'&&isCount && <div className="table-wrap document-lines" tabIndex={0} role="region" aria-label="ورقة الجرد"><table className="data-table"><thead><tr><th>الصنف</th><th>الدفتر</th><th>الفعلي</th></tr></thead><tbody>{['قميص أوكسفورد','بنطلون تشينو'].map((name,index)=><tr key={name}><td>{name}</td><td>{index===0 ? 24 : 18}</td><td><input aria-label={`جرد ${name}`} value={quantities[index]} onChange={event=>setQuantities(values=>values.map((value,item)=>item===index ? event.target.value : value))}/></td></tr>)}</tbody></table></div>}
      {kind==='settlement' && <div className="planned-fields lifecycle-editor">{due.map((value,index)=><label className="field" key={index}><span>مستند {index+1} · متبقي {value} ج.م</span><input aria-label={`توزيع التسوية ${index+1}`} inputMode="decimal" value={allocations[index]} onChange={event=>setAllocations(values=>values.map((part,item)=>item===index ? event.target.value : part))}/></label>)}</div>}
      {error && <p className="lifecycle-error" role="alert">{error}</p>}<footer><button className="button primary" type="submit">مراجعة العملية</button><button className="button secondary" type="button" onClick={requestClose}>إلغاء</button></footer>
    </form>}
  </Frame>;
}
