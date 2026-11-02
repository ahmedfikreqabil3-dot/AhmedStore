import { useEffect, useState, type FormEvent } from 'react';
import { reportSchema, type OperationalReport, type ReportQuery } from '@ahmed-store/contracts';
import { readJson } from './store-api.js';
import { statementAmount } from './PartyStatement.js';

const names: Record<ReportQuery['kind'], string> = { sales: 'المبيعات والمرتجعات', purchases: 'المشتريات والمرتجعات', inventory: 'أرصدة المخزون', expenses: 'المصروفات', treasury: 'حركة الأموال', customers: 'أرصدة العملاء', suppliers: 'أرصدة الموردين' };
const movementNames: Record<string, string> = { CUSTOMER_COLLECTION: 'تحصيل من العميل', SUPPLIER_SETTLEMENT: 'سداد مورد', ACCOUNT_TRANSFER_IN: 'تحويل وارد', ACCOUNT_TRANSFER_OUT: 'تحويل صادر', ACCOUNT_OPENING: 'رصيد افتتاحي', SALE: 'فاتورة بيع', SALES_RETURN: 'مرتجع بيع', PURCHASE: 'فاتورة شراء', PURCHASE_RETURN: 'مرتجع شراء', SALE_RECEIPT: 'تحصيل بيع', RETURN_REFUND: 'رد للعميل', RETURN_REFUND_REVERSAL: 'عكس رد للعميل', EXPENSE_PAYMENT: 'مصروف', PURCHASE_PAYMENT: 'سداد شراء', PURCHASE_PAYMENT_REVERSAL: 'عكس سداد شراء', PURCHASE_RETURN_REFUND: 'استرداد مشتريات', CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', WALLET: 'محفظة' };
function label(value: string) { return value.split(' · ').map(part => movementNames[part] ?? part).join(' · '); }
function params(query: {kind: ReportQuery['kind']; from: string; to: string; warehouseId: string; offset: number}) {
  const values = new URLSearchParams({ kind: query.kind, from: query.from+'T00:00:00.000Z', to: query.to+'T23:59:59.999Z', limit: '25', offset: String(query.offset) });
  if (query.warehouseId) values.set('warehouseId', query.warehouseId);
  return values;
}
export function ReportsWorkspace({branchScoped=false}:{branchScoped?:boolean}={}) {
  const today = new Date().toISOString().slice(0,10);
  const [kind,setKind] = useState<ReportQuery['kind']>('sales'), [from,setFrom] = useState(today.slice(0,8)+'01'), [to,setTo] = useState(today), [warehouseId,setWarehouseId] = useState('');
  const [warehouses,setWarehouses] = useState<Array<{id:string;name:string}>>([]);
  const [applied,setApplied] = useState({ kind, from, to, warehouseId, offset:0 });
  const [data,setData] = useState<OperationalReport|null>(null), [loading,setLoading] = useState(true), [error,setError] = useState(''), [validation,setValidation] = useState(''), [reload,setReload] = useState(0), [exporting,setExporting] = useState(false), [exportError,setExportError] = useState('');
  useEffect(() => { let active=true; void readJson<{warehouses:Array<{id:string;name:string}>}>('/warehouses').then(result=>{if(active)setWarehouses(result.warehouses);}).catch(()=>{}); return()=>{active=false;}; },[]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null); setExportError('');
    void readJson<unknown>(`/reports/operations?${params(applied)}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(reportSchema.parse(value));}).catch(()=>{if(!controller.signal.aborted)setError('تعذر تحميل التقرير. تحقق من الاتصال وأعد المحاولة.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[applied,reload]);
  function submit(event:FormEvent) {
    event.preventDefault();
    if(!from || !to || from>to){setValidation('اختر فترة صحيحة؛ البداية لا تتجاوز النهاية.');return;}
    setValidation('');setApplied({kind,from,to,warehouseId:['sales','purchases','inventory'].includes(kind)?warehouseId:'',offset:0});setReload(value=>value+1);
  }
  async function exportFile() {
    setExporting(true);setExportError('');
    try {
      const response=await fetch(`/api/v1/reports/operations/export.xlsx?${params(applied)}`,{credentials:'include'});
      if(!response.ok)throw Error(response.status===422?'TOO_LARGE':'FAILED');
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`${applied.kind}-${applied.from}-${applied.to}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(error) {setExportError(error instanceof Error&&error.message==='TOO_LARGE'?'التقرير يتجاوز ١٠ آلاف سجل. ضيّق الفترة أو اختر فرعًا.':'تعذر تصدير التقرير. أعد المحاولة.');}
    finally {setExporting(false);}
  }
  return <section className="surface operation-panel reports-workspace" aria-labelledby="reports-heading">
    <h2 id="reports-heading">مركز التقارير</h2>
    <form className="report-controls" onSubmit={submit} aria-label="فلاتر التقارير"><div className="operation-fields">
      <label>نوع التقرير<select value={kind} onChange={event=>setKind(event.target.value as ReportQuery['kind'])}>{Object.entries(names).filter(([key])=>!branchScoped||['sales','purchases','inventory'].includes(key)).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
      <label>من تاريخ<input type="date" value={from} required onChange={event=>setFrom(event.target.value)}/></label>
      <label>إلى تاريخ<input type="date" value={to} required onChange={event=>setTo(event.target.value)}/></label>
      {['sales','purchases','inventory'].includes(kind)&&<label>الفرع<select value={warehouseId} onChange={event=>setWarehouseId(event.target.value)}><option value="">{branchScoped?'الفروع المسموح بها':'كل الفروع'}</option>{warehouses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </div><button className="button primary" disabled={loading||exporting}>عرض التقرير</button></form>
    {validation&&<p role="alert">{validation}</p>}{loading&&<p role="status">جارٍ تحميل التقرير…</p>}
    {error&&<div role="alert"><p>{error}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل التقرير</button></div>}
    {data&&<><h3>{names[data.kind]}</h3><p>{applied.from} — {applied.to} · {applied.warehouseId ? warehouses.find(item=>item.id===applied.warehouseId)?.name ?? applied.warehouseId : branchScoped?'الفروع المسموح بها':'كل الفروع'} · التوقيت UTC</p>
      <p>{['inventory','customers','suppliers'].includes(data.kind)?'رصيد تراكمي حتى نهاية التاريخ المحدد، شامل الحركات السابقة لبداية الفترة.':'مستندات الفترة المسجلة؛ المرتجعات تخصم من إجمالي المبيعات والمشتريات. حركة الأموال تعرض المقبوضات موجبة والمدفوعات سالبة.'}</p>
      <dl className="operation-facts"><div><dt>عدد السجلات</dt><dd>{data.total}</dd></div><div><dt>{data.totalQuantity!==null?'إجمالي الكمية':'إجمالي التقرير (ج.م)'}</dt><dd><bdi>{statementAmount(data.totalQuantity??data.totalAmount!)}</bdi></dd></div></dl>
      <div className="operation-actions report-controls"><button className="button secondary" disabled={exporting||data.total===0} onClick={()=>void exportFile()}>{exporting?'جارٍ التصدير…':'تصدير Excel لكل النتائج'}</button><button className="button secondary" onClick={()=>window.print()}>طباعة الصفحة الحالية</button></div>
      {exportError&&<p role="alert">{exportError}</p>}
      {data.rows.length===0?<p className="operation-empty">لا توجد نتائج للفلاتر المحددة.</p>:<div className="operation-table-wrap" role="region" aria-label="نتائج التقرير" tabIndex={0}><table><thead><tr>{['المستند / الصنف','التاريخ (UTC)','الوصف / الحركة','المرجع',data.kind==='inventory'?'الكمية':'القيمة (ج.م)'].map(name=><th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><bdi className="operation-reference">{row.id}</bdi></td><td>{row.occurredAt.toISOString().slice(0,19).replace('T',' ')}</td><td>{label(row.label)}</td><td><bdi className="operation-reference">{row.reference}</bdi></td><td><bdi>{statementAmount(row.quantity??row.amount!)}</bdi></td></tr>)}</tbody></table></div>}
      <div className="operation-actions report-controls"><span>صفحة {Math.floor(data.offset/data.limit)+1} · الإجماليات تشمل كل النتائج</span><button className="button secondary" disabled={exporting||data.offset===0} onClick={()=>setApplied(value=>({...value,offset:Math.max(0,value.offset-data.limit)}))}>السابق</button><button className="button secondary" disabled={exporting||data.offset+data.limit>=data.total} onClick={()=>setApplied(value=>({...value,offset:value.offset+data.limit}))}>التالي</button></div>
    </>}
  </section>;
}
