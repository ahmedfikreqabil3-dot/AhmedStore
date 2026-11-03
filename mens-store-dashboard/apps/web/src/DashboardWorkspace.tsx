import {DashboardAnalytics} from './DashboardAnalytics.js';
import {useEffect,useState,type FormEvent} from 'react';
import {reportSchema,type OperationalReport} from '@ahmed-store/contracts';
import {readJson} from './store-api.js';
import {statementAmount} from './PartyStatement.js';

const day=86400000;
function date(value:number){return new Date(value).toISOString().slice(0,10);}
type Summary={sales:OperationalReport;previous:OperationalReport;expenses:OperationalReport;customers:OperationalReport;suppliers:OperationalReport};
export function DashboardWorkspace(){
  const today=new Date().toISOString().slice(0,10);
  const [from,setFrom]=useState(today.slice(0,8)+'01'),[to,setTo]=useState(today);
  const [period,setPeriod]=useState({from,to}),[reload,setReload]=useState(0);
  const [data,setData]=useState<Summary|null>(null),[error,setError]=useState(''),[validation,setValidation]=useState('');
  const start=Date.parse(period.from),end=Date.parse(period.to),previousFrom=date(start-(end-start+day)),previousTo=date(start-day);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    async function report(kind:'sales'|'expenses'|'customers'|'suppliers',from:string,to:string){
      const params=new URLSearchParams({kind,from:from+'T00:00:00.000Z',to:to+'T23:59:59.999Z',limit:'5',offset:'0'});
      const result=reportSchema.parse(await readJson<unknown>(`/reports/operations?${params}`,{signal:controller.signal}));
      if(result.kind!==kind||result.totalAmount===null)throw Error('INVALID_SUMMARY');return result;
    }
    void Promise.all([report('sales',period.from,period.to),report('sales',previousFrom,previousTo),report('expenses',period.from,period.to),report('customers',period.from,period.to),report('suppliers',period.from,period.to)])
      .then(([sales,previous,expenses,customers,suppliers])=>{if(!controller.signal.aborted)setData({sales,previous,expenses,customers,suppliers});})
      .catch(()=>{if(!controller.signal.aborted)setError('تعذر تحميل ملخص المتجر. أعد المحاولة.');});
    return()=>controller.abort();
  },[period,previousFrom,previousTo,reload]);
  function submit(event:FormEvent){event.preventDefault();if(!from||!to||from>to){setValidation('اختر فترة صحيحة؛ البداية لا تتجاوز النهاية.');return;}setValidation('');setPeriod({from,to});setReload(value=>value+1);}
  const comparison=data?BigInt(data.sales.totalAmount!.replace('.',''))-BigInt(data.previous.totalAmount!.replace('.','')):0n;
  return <section className="surface operation-panel dashboard-workspace" aria-labelledby="dashboard-heading" aria-busy={!data&&!error}>
    <h2 id="dashboard-heading">ملخص المتجر</h2>
    <form aria-label="فترة ملخص المتجر" onSubmit={submit} noValidate><div className="operation-fields"><label>من تاريخ<input type="date" value={from} aria-describedby={validation?'dashboard-validation':undefined} onChange={event=>setFrom(event.target.value)}/></label><label>إلى تاريخ<input type="date" value={to} aria-describedby={validation?'dashboard-validation':undefined} onChange={event=>setTo(event.target.value)}/></label></div><button className="button primary">عرض الملخص</button></form>
    {validation&&<p id="dashboard-validation" role="alert">{validation}</p>}
    {!data&&!error&&<p role="status">جارٍ تحميل ملخص المتجر…</p>}
    {error&&<div role="alert"><p>{error}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل الملخص</button></div>}
    {data&&<><p className="operation-note">{period.from} — {period.to} · كل الفروع · التوقيت UTC. المبيعات بعد خصم المرتجعات؛ الأرصدة تراكمية حتى نهاية الفترة.</p>
      <dl className="dashboard-metrics">{[
        ['صافي المبيعات',data.sales.totalAmount!,'خلال الفترة'],['المصروفات',data.expenses.totalAmount!,'خلال الفترة'],['أرصدة العملاء',data.customers.totalAmount!,'حتى نهاية الفترة'],['أرصدة الموردين',data.suppliers.totalAmount!,'حتى نهاية الفترة']
      ].map(([title,amount,note])=><div key={title}><dt>{title}</dt><dd><bdi>{statementAmount(amount!)}</bdi> <small>ج.م</small></dd><small>{note}</small></div>)}</dl>
      <div className="dashboard-comparison"><h3>مقارنة المبيعات</h3><p>{previousFrom} — {previousTo} · الفترة السابقة بنفس عدد الأيام</p><p>صافي الفترة السابقة: <bdi>{statementAmount(data.previous.totalAmount!)}</bdi> ج.م</p><strong>{comparison>0n?'المبيعات أعلى من الفترة السابقة':comparison<0n?'المبيعات أقل من الفترة السابقة':'المبيعات بدون تغيير عن الفترة السابقة'}</strong></div>
      <DashboardAnalytics from={period.from} to={period.to}/>
      <h3>آخر مستندات المبيعات خلال الفترة</h3>{data.sales.rows.length===0?<p className="operation-empty">لا توجد مبيعات أو مرتجعات خلال الفترة.</p>:<ul className="operation-lines">{data.sales.rows.map(row=><li key={row.id}><div><strong>{row.label==='SALE'?'فاتورة بيع':'مرتجع بيع'}</strong><p><bdi className="operation-reference">{row.id}</bdi></p><p>{row.occurredAt.toISOString().slice(0,10)} · <bdi>{statementAmount(row.amount!)}</bdi> ج.م</p></div></li>)}</ul>}
      <p className="operation-note">الإجماليات تشمل كل النتائج؛ القائمة تعرض أحدث خمسة مستندات. أرصدة العملاء والموردين صافية وقد تتضمن دفعات مقدمة؛ ليست قيمة الربح.</p><div className="operation-actions"><a className="button secondary" href="#sales">راجع فواتير البيع</a><a className="button secondary" href="#reports">افتح التقارير التفصيلية</a></div>
    </>}
  </section>;
}
