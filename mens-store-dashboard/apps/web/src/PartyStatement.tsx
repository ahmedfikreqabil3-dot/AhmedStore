import { useEffect, useRef, useState, type FormEvent } from 'react';
import { partyStatementSchema, type PartyStatement as Statement } from '@ahmed-store/contracts';
import { ApiError, readJson } from './store-api.js';

// Ledger totals may exceed a single document's numeric(19,4). Never use Number.
export function statementAmount(value: string) {
  const [integer, fraction] = value.split('.');
  return `${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
const movementNames: Record<string, string> = { SALE_CREDIT: 'بيع آجل', RETURN_CREDIT: 'تسوية مرتجع', RETURN_REVERSAL: 'عكس تسوية مرتجع', PURCHASE_CREDIT: 'شراء آجل', PURCHASE_RETURN_CREDIT: 'تسوية مرتجع مشتريات', SUPPLIER_PAYMENT: 'سداد مورد', REVERSAL: 'عكس شراء آجل' };
export function PartyStatement({kind,party,close}:{kind:Statement['kind'];party:{id:string;name:string};close:()=>void}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from,setFrom]=useState(today.slice(0,8)+'01'),[to,setTo]=useState(today);
  const [applied,setApplied]=useState({from,to,offset:0});
  const [data,setData]=useState<Statement|null>(null),[error,setError]=useState(''),[validation,setValidation]=useState(''),[reload,setReload]=useState(0);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{
    let active=true;setData(null);setError('');
    const query=new URLSearchParams({from:new Date(`${applied.from}T00:00:00`).toISOString(),to:new Date(`${applied.to}T23:59:59.999`).toISOString(),limit:'25',offset:String(applied.offset)});
    void readJson(`/${kind}/${party.id}/statement?${query}`).then(result=>{const parsed=partyStatementSchema.parse(result);if(active)setData(parsed);}).catch(reason=>{if(active)setError(reason instanceof ApiError&&reason.status===403 ? 'صلاحية كشف الحساب غير متاحة.' : 'تعذر تحميل كشف الحساب. اختيارات الفترة محفوظة؛ أعد المحاولة.');});
    return()=>{active=false;};
  },[kind,party.id,applied,reload]);
  function submit(event:FormEvent){event.preventDefault();if(!from||!to||from>to){setValidation('حدد فترة صحيحة؛ تاريخ البداية لا يتجاوز تاريخ النهاية.');return;}setValidation('');setApplied({from,to,offset:0});}
  const loading=data===null&&!error;
  return <section className="operation-detail" aria-labelledby="party-statement-title">
    <div className="operation-actions"><h3 ref={heading} tabIndex={-1} id="party-statement-title">كشف حساب {party.name}</h3><button type="button" className="button secondary" onClick={close}>إغلاق كشف الحساب</button></div>
    <p className="operation-note">القيم بالجنيه المصري حتى ٤ منازل عشرية. الرصيد الموجب {kind==='customers' ? 'مستحق على العميل' : 'مستحق للمورد'}، والسالب رصيد لصالح الطرف الآخر.</p>
    <form onSubmit={submit} noValidate><div className="operation-fields two-columns"><label>من تاريخ<input aria-label="بداية كشف الحساب" type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>إلى تاريخ<input aria-label="نهاية كشف الحساب" type="date" value={to} onChange={event=>setTo(event.target.value)}/></label></div><button type="submit" className="button secondary" disabled={loading}>عرض كشف الحساب</button></form>
    {validation&&<p role="alert">{validation}</p>}
    {loading&&<p role="status">جارٍ تحميل كشف الحساب…</p>}
    {error&&<div role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل كشف الحساب</button></div>}
    {data&&<><p>الفترة المعروضة: {data.from.toLocaleDateString('ar-EG')} — {data.to.toLocaleDateString('ar-EG')}{!data.party.active&&' · سجل مؤرشف'}</p>
      <dl className="operation-facts">{[['رصيد أول الفترة',data.opening],['زيادة المستحق خلال الفترة',data.debits],['تخفيض المستحق خلال الفترة',data.credits],['رصيد آخر الفترة',data.closing]].map(([name,value])=><div key={name}><dt>{name}</dt><dd><bdi>{statementAmount(value!)}</bdi> ج.م</dd></div>)}</dl>
      {data.rows.length===0 ? <p className="operation-empty">لا توجد حركات في هذه الصفحة من الفترة المحددة. يظل الرصيد الافتتاحي والختامي ظاهرًا للمراجعة.</p> : <div className="operation-table-wrap" role="region" aria-label="حركات كشف الحساب" tabIndex={0}><table><thead><tr>{['التاريخ','الحركة','مرجع المستند','القيمة','الرصيد المتتابع'].map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td>{row.occurredAt.toLocaleString('ar-EG')}</td><td>{movementNames[row.type] ?? row.type}</td><td><bdi className="operation-reference">{row.sourceId}</bdi></td><td><bdi>{statementAmount(row.amount)}</bdi></td><td><bdi>{statementAmount(row.balance)}</bdi></td></tr>)}</tbody></table></div>}
      <div className="operation-actions"><span>إجمالي الحركات: {data.total} · صفحة {Math.floor(data.offset/data.limit)+1}</span><button className="button secondary" disabled={data.offset===0} onClick={()=>setApplied(value=>({...value,offset:Math.max(0,value.offset-data.limit)}))}>الحركات السابقة</button><button className="button secondary" disabled={data.offset+data.limit>=data.total} onClick={()=>setApplied(value=>({...value,offset:value.offset+data.limit}))}>الحركات التالية</button></div>
    </>}
  </section>;
}
