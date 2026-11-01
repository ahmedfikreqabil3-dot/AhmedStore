import { useEffect, useState, type FormEvent } from 'react';
import { createExpenseSchema, expenseHistorySchema, type CreateExpenseInput, type ExpenseHistory } from '@ahmed-store/contracts';
import { ApiError, decimal, readJson, units } from './store-api.js';
import { PendingCommandNotice, usePendingCommand } from './pending-command.js';
import { OperationHeader } from './ui/OperationHeader.js';
import { operationLabel } from './operation-format.js';
import { statementAmount } from './PartyStatement.js';

const validateExpense=(input:unknown)=>{createExpenseSchema.parse(input);};
const localNow=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);};
type Expense=ExpenseHistory['expenses'][number];
export function ExpensesWorkspace(){
  const today=new Date().toISOString().slice(0,10);
  const [from,setFrom]=useState(today.slice(0,8)+'01'),[to,setTo]=useState(today),[applied,setApplied]=useState({from,to,offset:0});
  const [data,setData]=useState<ExpenseHistory|null>(null),[loadError,setLoadError]=useState(''),[reload,setReload]=useState(0),[filterError,setFilterError]=useState('');
  const [editing,setEditing]=useState(false),[category,setCategory]=useState('تشغيل'),[description,setDescription]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState<CreateExpenseInput['paymentMethod']>('CASH'),[occurredAt,setOccurredAt]=useState(localNow);
  const [review,setReview]=useState<CreateExpenseInput|null>(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false),[detail,setDetail]=useState<Expense|null>(null);
  const command=usePendingCommand<CreateExpenseInput>('expense',validateExpense);
  useEffect(()=>{
    let active=true;setData(null);setLoadError('');
    const query=new URLSearchParams({from:new Date(`${applied.from}T00:00:00`).toISOString(),to:new Date(`${applied.to}T23:59:59.999`).toISOString(),limit:'25',offset:String(applied.offset)});
    void readJson(`/expenses?${query}`).then(result=>{const parsed=expenseHistorySchema.parse(result);if(active)setData(parsed);}).catch(reason=>{if(active)setLoadError(reason instanceof ApiError&&reason.status===403 ? 'صلاحية عرض المصروفات غير متاحة.' : 'تعذر تحميل سجل المصروفات. أعد المحاولة.');});
    return()=>{active=false;};
  },[applied,reload]);
  function prepare(event:FormEvent){event.preventDefault();const parsed=createExpenseSchema.safeParse({category,description,amount,paymentMethod:method,occurredAt});if(!parsed.success){setError('راجع الفئة والوصف والتاريخ. المبلغ موجب وحتى ٤ منازل عشرية؛ لا يوجد دفع آجل للمصروف.');return;}setError('');setReview(parsed.data);}
  function reset(){setEditing(false);setReview(null);setDescription('');setAmount('');setDirty(false);setDiscard(false);setError('');}
  async function save(){
    setError('');setSuccess('');
    try{const result=await command.run(()=>review!,()=>crypto.randomUUID(),(input,key)=>readJson<{id:string}>(`/expenses`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(input)}));if(result){reset();setSuccess(`تم تسجيل المصروف ${result.id}.`);setReload(value=>value+1);}}
    catch(reason){setError(reason instanceof ApiError&&reason.status===409 ? 'رفض تسجيل المصروف. راجع الصلاحية والبيانات؛ الطلب المحفوظ إن وُجد يحتفظ بنفس المرجع.' : 'تعذر تأكيد نتيجة التسجيل. تحقق من الطلب المحفوظ قبل إنشاء مصروف بديل.');}
  }
  const reviewed=command.pending?.input ?? review;
  return <section className="operation-panel" aria-labelledby="expenses-title"><OperationHeader id="expenses-title" title="المصروفات" description="سجل المصروفات الفعلية وحركة الدفع المرتبطة بها. كل مصروف مسجل يحتفظ بمرجعه." icon="wallet"/>
    <button className="button primary" disabled={command.busy||command.blocked||!!command.pending} onClick={()=>{setEditing(true);setSuccess('');setDetail(null);}}>مصروف جديد</button>
    {success&&<p role="status">{success}</p>}
    <PendingCommandNotice blocked={command.blocked} pending={!!command.pending} busy={command.busy} retry={()=>void save()}/>
    {(editing||command.pending)&&<div className="operation-detail">
      <h3>تسجيل مصروف</h3>
      {discard&&<div className="operation-note" role="alert"><p>تجاهل بيانات المصروف غير المسجلة؟</p><button className="button secondary" onClick={()=>setDiscard(false)}>استكمال المصروف</button><button className="button secondary" onClick={reset}>تجاهل المصروف</button></div>}
      {reviewed ? <><h4>مراجعة المصروف قبل الدفع</h4><dl className="operation-facts"><div><dt>الفئة</dt><dd>{reviewed.category}</dd></div><div><dt>الوصف</dt><dd>{reviewed.description}</dd></div><div><dt>المبلغ</dt><dd><bdi>{statementAmount(decimal(units(reviewed.amount)!))}</bdi> ج.م</dd></div><div><dt>طريقة الدفع</dt><dd>{operationLabel(reviewed.paymentMethod)}</dd></div><div><dt>التاريخ</dt><dd>{new Date(reviewed.occurredAt).toLocaleString('ar-EG')}</dd></div></dl>{!command.pending&&<div className="operation-actions"><button className="button primary" disabled={command.busy||command.blocked} onClick={()=>void save()}>تأكيد تسجيل المصروف والدفع</button><button className="button secondary" disabled={command.busy} onClick={()=>setReview(null)}>رجوع لبيانات المصروف</button></div>}</> : <form noValidate onSubmit={prepare} onChange={()=>setDirty(true)}><div className="operation-fields two-columns"><label>الفئة<input aria-label="فئة المصروف" value={category} onChange={event=>setCategory(event.target.value)} maxLength={120}/></label><label>المبلغ (ج.م)<input aria-label="مبلغ المصروف" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></label><label>طريقة الدفع<select aria-label="طريقة دفع المصروف" value={method} onChange={event=>setMethod(event.target.value as CreateExpenseInput['paymentMethod'])}>{(['CASH','CARD','WALLET','INSTAPAY'] as const).map(value=><option key={value} value={value}>{operationLabel(value)}</option>)}</select></label><label>التاريخ<input aria-label="تاريخ المصروف" type="datetime-local" value={occurredAt} onChange={event=>setOccurredAt(event.target.value)}/></label><label>الوصف<textarea aria-label="وصف المصروف" value={description} onChange={event=>setDescription(event.target.value)} maxLength={500} rows={3}/></label></div><div className="operation-actions"><button type="submit" className="button primary">مراجعة المصروف</button><button type="button" className="button secondary" onClick={()=>dirty?setDiscard(true):reset()}>إلغاء المصروف</button></div></form>}
      {error&&<p role="alert">{error}</p>}
    </div>}
    <h3 className="operation-subheading">سجل المصروفات</h3><form noValidate onSubmit={event=>{event.preventDefault();if(!from||!to||from>to){setFilterError('حدد فترة صحيحة للمصروفات.');return;}setFilterError('');setDetail(null);setApplied({from,to,offset:0});}}><div className="operation-fields two-columns"><label>من تاريخ<input aria-label="بداية فترة المصروفات" type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>إلى تاريخ<input aria-label="نهاية فترة المصروفات" type="date" value={to} onChange={event=>setTo(event.target.value)}/></label></div><button type="submit" className="button secondary">عرض المصروفات</button></form>
    {filterError&&<p role="alert">{filterError}</p>}
    {loadError ? <div role="alert"><p>{loadError}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل المصروفات</button></div> : !data ? <p role="status">جارٍ تحميل المصروفات…</p> : <><p className="operation-total">إجمالي الفترة المعروضة ({applied.from} — {applied.to}) <strong><bdi>{statementAmount(data.totalAmount)}</bdi> ج.م</strong></p>
      {data.expenses.length===0 ? <p className="operation-empty">لا توجد مصروفات في هذه الصفحة من الفترة المحددة.</p> : <div className="operation-table-wrap" role="region" aria-label="سجل المصروفات" tabIndex={0}><table><thead><tr>{['التاريخ','الفئة','الوصف','طريقة الدفع','المبلغ (ج.م)','الإجراء'].map(value=><th scope="col" key={value}>{value}</th>)}</tr></thead><tbody>{data.expenses.map(row=><tr key={row.id}><td>{row.occurredAt.toLocaleString('ar-EG')}</td><td>{row.category}</td><td>{row.description}</td><td>{operationLabel(row.paymentMethod)}</td><td><bdi>{statementAmount(row.amount)}</bdi></td><td><button className="button secondary" onClick={()=>setDetail(row)}>تفاصيل المصروف {row.id}</button></td></tr>)}</tbody></table></div>}
      <div className="operation-actions"><span>إجمالي المستندات: {data.total}</span><button className="button secondary" disabled={data.offset===0} onClick={()=>{setDetail(null);setApplied(value=>({...value,offset:Math.max(0,value.offset-data.limit)}));}}>مصروفات سابقة</button><button className="button secondary" disabled={data.offset+data.limit>=data.total} onClick={()=>{setDetail(null);setApplied(value=>({...value,offset:value.offset+data.limit}));}}>مصروفات تالية</button></div></>}
    {detail&&<section className="operation-detail" aria-label="تفاصيل مصروف مسجل"><h3>تفاصيل المصروف</h3><p className="operation-reference">{detail.id}</p><p>{detail.category} · {detail.description}</p><p>{statementAmount(detail.amount)} ج.م · {operationLabel(detail.paymentMethod)}</p><p>مصروف مسجل؛ تصحيحه يحتاج مستندًا مرتبطًا وفق ضوابط المالية.</p><button className="button secondary" onClick={()=>setDetail(null)}>إغلاق تفاصيل المصروف</button></section>}
  </section>;
}
