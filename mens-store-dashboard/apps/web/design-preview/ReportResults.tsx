import { useState } from 'react';

export type ReportFixture={metrics:string[][];columns:string[];rows:string[][]};
export function ReportResults({data,report,onMode}:{data:ReportFixture;report:string;onMode:(mode:string)=>void}){
  const [mode,setMode]=useState('بيانات توضيحية');
  const [selected,setSelected]=useState<string[]|null>(null);
  const changeMode=(value:string)=>{setMode(value);setSelected(null);onMode(value);};
  return <>
    <label className="field lifecycle-filter"><span>حالة نتيجة التقرير في المعاينة</span><select aria-label="حالة نتيجة التقرير" value={mode} onChange={event=>changeMode(event.target.value)}>{['بيانات توضيحية','لا توجد نتائج','جارٍ التحميل','تعذر التحميل','غير مسموح'].map(value=><option key={value}>{value}</option>)}</select></label>
    {mode==='جارٍ التحميل' ? <div className="planned-loading" role="status">جارٍ تجهيز التقرير…</div> : mode==='تعذر التحميل' ? <div className="planned-empty" role="alert"><h3>تعذر تحميل التقرير</h3><p>اختيارات الفترة محفوظة. أعد المحاولة.</p><button className="button secondary" onClick={()=>changeMode('بيانات توضيحية')}>إعادة تحميل التقرير</button></div> : mode==='غير مسموح' ? <div className="planned-empty" role="alert"><h3>صلاحية عرض التقرير غير متاحة</h3><p>راجع نطاق الدور والفروع مع مدير النظام.</p></div> : mode==='لا توجد نتائج' ? <div className="planned-empty"><h3>لا توجد نتائج لهذه الفترة</h3><p>عدّل الفترة أو الفلاتر ثم اعرض التقرير مرة أخرى.</p></div> : <>
      <div className="planned-report-metrics">{data.metrics.map(([label,value])=><div key={label}><span>{label}</span><strong><bdi>{value}</bdi></strong><small>قيمة توضيحية لمراجعة التخطيط</small></div>)}</div>
      <div className="table-wrap" role="region" aria-label="نتائج التقرير التوضيحي" tabIndex={0}><table className="data-table"><thead><tr>{data.columns.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((value,index)=><td key={index}>{index===0 ? <button className="table-link" aria-label={`تفاصيل نتيجة ${value}`} onClick={()=>setSelected(row)}>{value}</button> : value}</td>)}</tr>)}</tbody></table></div>
    </>}
    {selected && <section className="statement-document" aria-label="تفاصيل نتيجة التقرير"><h3>تفاصيل من تقرير {report}</h3><dl className="planned-facts">{data.columns.map((label,index)=><div key={label}><dt>{label}</dt><dd>{selected[index]}</dd></div>)}</dl><p>بيانات ثابتة للتصميم، وليست قراءة من السجل الفعلي.</p><button className="button secondary" onClick={()=>setSelected(null)}>إغلاق تفاصيل النتيجة</button></section>}
  </>;
}
