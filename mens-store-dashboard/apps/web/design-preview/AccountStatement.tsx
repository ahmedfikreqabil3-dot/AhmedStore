import { useState } from 'react';

const statementFixtures = {
  customers: { opening:'1,000.00', closing:'1,250.00', entries:[['29 أكتوبر','INV-1048','فاتورة بيع','750.00','0.00','1,750.00'],['30 أكتوبر','COL-0042','تحصيل نقدي','0.00','500.00','1,250.00']] },
  suppliers: { opening:'10,500.00', closing:'18,500.00', entries:[['29 أكتوبر','PUR-0082','فاتورة مشتريات','0.00','10,000.00','20,500.00'],['30 أكتوبر','PAY-0031','سداد للمورد','2,000.00','0.00','18,500.00']] },
  treasuries: { opening:'10,000.00', closing:'12,680.00', entries:[['29 أكتوبر','INV-1048','متحصلات بيع','2,940.00','0.00','12,940.00'],['30 أكتوبر','EXP-0081','مصروف شحن','0.00','260.00','12,680.00']] }
};

export function AccountStatement({screen,entity,announce}:{screen:keyof typeof statementFixtures;entity:string;announce:(message:string)=>void}) {
  const [from,setFrom]=useState('2026-10-01');
  const [to,setTo]=useState('2026-10-30');
  const [applied,setApplied]=useState('أكتوبر 2026');
  const [entry,setEntry]=useState<string[]|null>(null);
  const [error,setError]=useState('');
  const [empty,setEmpty]=useState(false);
  const fixture=statementFixtures[screen];
  return <section className="account-statement" aria-label={`كشف حساب ${entity}`}>
    <p className="planned-small-note">كشف توضيحي لتصميم الرحلة، بأرقام ثابتة؛ لا يعرض الرصيد الفعلي للسجل المختار.</p>
    <form className="statement-filters" onSubmit={event=>{event.preventDefault();if(from>to){setError('بداية الفترة لازم تكون قبل نهايتها.');return;}setError('');setApplied(`${from} — ${to}`);}}>
      <label className="field"><span>من تاريخ</span><input aria-label="كشف الحساب من تاريخ" type="date" required value={from} onChange={event=>setFrom(event.target.value)}/></label>
      <label className="field"><span>إلى تاريخ</span><input aria-label="كشف الحساب إلى تاريخ" type="date" required value={to} onChange={event=>setTo(event.target.value)}/></label>
      <button className="button secondary" type="submit">تطبيق الفترة</button>
    </form>{error && <p className="lifecycle-error" role="alert">{error}</p>}
    <div className="statement-context"><span>{applied} · {entity}</span><button className="button secondary" onClick={()=>announce('تمت معاينة تصدير كشف الحساب. لم يُنشأ ملف أو تُقرأ حسابات فعلية.')}>معاينة تصدير الكشف</button></div>
    <dl className="planned-facts"><div><dt>رصيد أول الفترة (ج.م)</dt><dd><bdi>{empty ? '0.00' : fixture.opening}</bdi></dd></div><div><dt>رصيد آخر الفترة (ج.م)</dt><dd><bdi>{empty ? '0.00' : fixture.closing}</bdi></dd></div></dl>
    <label className="lifecycle-check"><input type="checkbox" checked={empty} onChange={event=>{setEmpty(event.target.checked);setEntry(null);}}/>معاينة فترة بدون حركات</label>
    {empty ? <div className="planned-empty"><h3>لا توجد حركات خلال الفترة</h3><p>جرّب فترة أخرى، أو ارجع لبيانات الحساب.</p></div> : <div className="table-wrap" role="region" aria-label="حركات كشف الحساب" tabIndex={0}><table className="data-table"><thead><tr>{['التاريخ','المستند','البيان',screen==='treasuries' ? 'وارد (ج.م)' : 'مدين (ج.م)',screen==='treasuries' ? 'صادر (ج.م)' : 'دائن (ج.م)','الرصيد (ج.م)'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{fixture.entries.map(row=><tr key={row[1]}>{row.map((value,index)=><td key={index}>{index===1 ? <button className="table-link" onClick={()=>setEntry(row)} aria-label={`تفاصيل مستند ${value}`}>{value}</button> : value}</td>)}</tr>)}</tbody></table></div>}
    {entry && <section className="statement-document" aria-label="تفاصيل مستند كشف الحساب"><h3>المستند <bdi>{entry[1]}</bdi></h3><dl className="planned-facts"><div><dt>البيان</dt><dd>{entry[2]}</dd></div><div><dt>التاريخ</dt><dd>{entry[0]}</dd></div><div><dt>الطرف / الحساب</dt><dd>{entity}</dd></div><div><dt>حالة المستند</dt><dd>مسجل · نموذج توضيحي</dd></div></dl><p>المستند الأصلي يظل محفوظًا؛ أي تصحيح يظهر بمستند عكس مرتبط به.</p><button className="button secondary" onClick={()=>setEntry(null)}>إغلاق تفاصيل المستند</button></section>}
  </section>;
}
