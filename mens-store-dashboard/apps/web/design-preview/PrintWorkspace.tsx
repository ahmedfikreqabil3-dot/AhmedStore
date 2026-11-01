import { usePreviewDialog } from './usePreviewDialog.js';
import { useRef, useState } from 'react';
import { Icon } from '../src/ui/Icon.js';

const documents={
  'فاتورة بيع':{reference:'INV-1048',party:'أحمد محمود',subtotal:'2,560.00',discount:'60.00',total:'2,500.00',lines:[['قميص أوكسفورد','1','690.00'],['بنطلون تشينو','1','890.00'],['تيشيرت بولو','2','980.00']]},
  'مرتجع بيع':{reference:'RET-0034',party:'أحمد محمود',subtotal:'690.00',discount:'0.00',total:'690.00',lines:[['قميص أوكسفورد','1','690.00']]},
  'فاتورة مشتريات':{reference:'PUR-0082',party:'شركة النخبة',subtotal:'10,080.00',discount:'0.00',total:'10,080.00',lines:[['قميص أوكسفورد','24','10,080.00']]},
  'عرض سعر':{reference:'QUO-0018',party:'أحمد محمود',subtotal:'1,380.00',discount:'0.00',total:'1,380.00',lines:[['قميص أوكسفورد','2','1,380.00']]}
};
function PrintReview({title,format,copies,close,complete}:{title:string;format:string;copies:string;close:()=>void;complete:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);usePreviewDialog(dialog);
  return <dialog ref={dialog} className="planned-dialog" aria-labelledby="print-review-title" onCancel={event=>{event.preventDefault();close();}}><header><h2 id="print-review-title">مراجعة إعدادات الطباعة</h2><button className="icon-button" aria-label="إغلاق مراجعة الطباعة" onClick={close}><Icon name="close"/></button></header><dl className="planned-facts"><div><dt>المستند</dt><dd>{title}</dd></div><div><dt>مقاس الورق</dt><dd>{format}</dd></div><div><dt>النسخ</dt><dd>{copies}</dd></div></dl><p>معاينة محلية فقط. لن يُفتح حوار طباعة أو يُرسل شيء لطابعة.</p><footer><button className="button primary" onClick={complete}>إنهاء معاينة الطباعة</button><button className="button secondary" onClick={close}>رجوع للإعدادات</button></footer></dialog>;
}
export function PrintWorkspace({announce}:{announce:(message:string)=>void}){
  const [format,setFormat]=useState('A4');
  const [kind,setKind]=useState<keyof typeof documents>('فاتورة بيع');
  const [copies,setCopies]=useState('1');
  const [scenario,setScenario]=useState('معاينة جاهزة');
  const [review,setReview]=useState(false);
  const [error,setError]=useState('');
  const doc=documents[kind];
  return <div className="planned-workspace"><div className="planned-page-actions"><a className="text-button" href="#journeys">كل الواجهات والرحلات</a><div className="planned-tabs">{['A4','80mm'].map(value=><button type="button" key={value} aria-pressed={format===value} className={`button ${format===value ? 'primary' : 'secondary'}`} onClick={()=>setFormat(value)}>{value==='A4' ? 'فاتورة A4' : 'إيصال حراري 80 مم'}</button>)}</div></div>
    <section className="surface planned-panel"><header className="planned-panel-heading"><h2>إعدادات المستند</h2><span className="planned-demo-badge">نموذج ثابت للمراجعة</span></header><div className="planned-toolbar"><label className="field"><span>نوع المستند</span><select aria-label="نوع مستند الطباعة" value={kind} onChange={event=>setKind(event.target.value as keyof typeof documents)}>{Object.keys(documents).map(value=><option key={value}>{value}</option>)}</select></label><label className="field"><span>عدد النسخ</span><input aria-label="عدد نسخ الطباعة" type="number" min="1" max="5" step="1" value={copies} onChange={event=>setCopies(event.target.value)}/></label><label className="field"><span>اختبار حالة الطباعة</span><select aria-label="حالة الطباعة التجريبية" value={scenario} onChange={event=>setScenario(event.target.value)}><option>معاينة جاهزة</option><option>تعذر تجهيز الطباعة</option></select></label><button className="button primary" onClick={()=>{if(!/^[1-5]$/.test(copies)){setError('اختار عدد نسخ من 1 إلى 5.');return;}setError('');setReview(true);}} disabled={scenario!=='معاينة جاهزة'}>مراجعة الطباعة</button></div>{error && <p className="lifecycle-error planned-small-note" role="alert">{error}</p>}{scenario!=='معاينة جاهزة' && <div className="planned-empty" role="alert"><h3>تعذر تجهيز معاينة الطباعة</h3><p>حالة تجريبية؛ لم يتم فحص طابعة فعلية.</p><button className="button secondary" onClick={()=>setScenario('معاينة جاهزة')}>إعادة تجهيز المعاينة</button></div>}</section>
    <article className={`planned-paper ${format==='80mm' ? 'thermal' : ''}`} aria-label="معاينة ورقة المستند"><header><Icon name="store" size={34}/><h2>أحمد ستور</h2><p>{kind} · مستند توضيحي للمراجعة</p></header><dl><div><dt>رقم المستند</dt><dd><bdi>{doc.reference}</bdi></dd></div><div><dt>التاريخ</dt><dd>30 أكتوبر 2026</dd></div><div><dt>الطرف</dt><dd>{doc.party}</dd></div><div><dt>الفرع</dt><dd>الفرع الرئيسي</dd></div></dl><table><thead><tr><th scope="col">الصنف</th><th scope="col">الكمية</th><th scope="col">القيمة (ج.م)</th></tr></thead><tbody>{doc.lines.map(line=><tr key={line[0]}>{line.map((value,index)=><td key={index}>{value}</td>)}</tr>)}</tbody></table><div className="planned-paper-total"><span>المجموع الفرعي <bdi>{doc.subtotal}</bdi></span><span>الخصم <bdi>{doc.discount}</bdi></span><strong>الإجمالي <bdi>{doc.total} ج.م</bdi></strong></div><footer><p>{kind==='عرض سعر' ? 'عرض سعر لا يمثل بيعًا مسجلًا.' : kind==='مرتجع بيع' ? 'مرتجع مرتبط بالفاتورة الأصلية INV-1048.' : 'شكرًا لتعاملك معنا.'}</p><small>نسخة تصميم · ليست مستندًا ماليًا صادرًا من النظام.</small></footer></article>
    {review && <PrintReview title={`${kind} · ${doc.reference}`} format={format} copies={copies} close={()=>setReview(false)} complete={()=>{setReview(false);announce('اكتملت مراجعة التصميم. لم تُرسل طباعة فعلية.');}}/>}
  </div>;
}
