import { PartyLifecycle } from './PartyLifecycle.js';
import {partyDirectoryResultSchema,type PartyDirectoryStatus} from '@ahmed-store/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createCustomerSchema, createSupplierSchema, updateCustomerSchema, updateSupplierSchema, type Customer, type Supplier } from '@ahmed-store/contracts';
import { ApiError, readJson } from './store-api.js';
import { OperationHeader } from './ui/OperationHeader.js';
import { Icon } from './ui/Icon.js';
import { operationMoney } from './operation-format.js';
import { PartyStatement } from './PartyStatement.js';

type Kind='customers'|'suppliers';type Party=Customer|Supplier;
const label=(kind:Kind)=>kind==='customers' ? 'العميل' : 'المورد';
export function PartyEditor({kind,record,close,saved,canSetCredit=true}:{kind:Kind;record:Party|null;close:()=>void;saved:()=>void;canSetCredit?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null);
  const saving=useRef(false);
  const [name,setName]=useState(record?.name ?? '');const [phone,setPhone]=useState(record?.phone ?? '');const [email,setEmail]=useState(record?.email ?? '');
  const [address,setAddress]=useState(record?.address ?? '');const [notes,setNotes]=useState(record?.notes ?? '');
  const [credit,setCredit]=useState(record && 'creditLimit' in record ? record.creditLimit : '0');
  const [review,setReview]=useState<Record<string,unknown>|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);const [discard,setDiscard]=useState(false);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const requestClose=()=>{if(!busy){if(dirty)setDiscard(true);else close();}};
  function prepare(event:FormEvent){
    event.preventDefault();const body={name,phone:phone.trim()||null,email:email.trim()||null,address:address.trim()||null,notes:notes.trim()||null,...(kind==='customers' ? {creditLimit:canSetCredit ? credit : '0'} : {}),...(record ? {version:record.version} : {})};
    const schema=kind==='customers' ? (record ? updateCustomerSchema : createCustomerSchema) : (record ? updateSupplierSchema : createSupplierSchema);
    const parsed=schema.safeParse(body);if(!parsed.success){setError('راجع الاسم وبيانات التواصل وحد الائتمان. الاسم حرفان على الأقل والمبالغ حتى 4 منازل عشرية.');return;}
    setError('');setReview(parsed.data);
  }
  async function save(){
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{await readJson(`/${kind}${record ? `/${record.id}` : ''}`,{method:record ? 'PATCH' : 'POST',headers:{'content-type':'application/json'},body:JSON.stringify(review)});saved();}
    catch(reason){setError(reason instanceof ApiError && reason.status===409 ? 'تغيّرت البيانات أو الاسم مستخدم بالفعل. أعد تحميل السجل وراجع آخر نسخة قبل الحفظ.' : 'تعذر تأكيد الحفظ. راجع القائمة قبل تكرار الإضافة، أو أعد تحميل آخر نسخة للتعديل.');}
    finally{saving.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="party-dialog" aria-labelledby="party-editor-title" onCancel={event=>{event.preventDefault();requestClose();}}>
    <header><h2 id="party-editor-title">{record ? 'تعديل' : 'إضافة'} {label(kind)}</h2><button className="icon-button" aria-label="إغلاق بيانات الطرف" disabled={busy} onClick={requestClose}><Icon name="close"/></button></header>
    {discard && <div className="operation-note" role="alert"><p>البيانات لم تُحفظ. هل تريد تجاهل التعديلات؟</p><button type="button" className="button secondary" onClick={()=>setDiscard(false)}>استكمال التعديل</button><button type="button" className="button secondary" onClick={close}>تجاهل وإغلاق</button></div>}
    {review ? <><h3>مراجعة البيانات قبل الحفظ</h3><dl className="operation-facts"><div><dt>الاسم</dt><dd>{String(review.name)}</dd></div><div><dt>الهاتف</dt><dd>{String(review.phone ?? '—')}</dd></div><div><dt>البريد</dt><dd>{String(review.email ?? '—')}</dd></div><div><dt>العنوان</dt><dd>{String(review.address ?? '—')}</dd></div><div><dt>ملاحظات</dt><dd>{String(review.notes ?? '—')}</dd></div>{kind==='customers' && <div><dt>حد الائتمان</dt><dd>{/^0(?:\.0+)?$/.test(String(review.creditLimit)) ? 'بدون سقف' : `${operationMoney(String(review.creditLimit))} ج.م`}</dd></div>}</dl><div className="operation-actions"><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy ? 'جارٍ الحفظ…' : `حفظ ${label(kind)}`}</button><button className="button secondary" disabled={busy} onClick={()=>setReview(null)}>رجوع للبيانات</button></div></> : <form noValidate onSubmit={prepare} onChange={()=>setDirty(true)}><div className="operation-fields two-columns"><label>الاسم<input aria-label="اسم الطرف" value={name} onChange={event=>setName(event.target.value)} autoComplete="organization"/></label><label>الهاتف<input aria-label="هاتف الطرف" value={phone} onChange={event=>setPhone(event.target.value)} autoComplete="tel"/></label><label>البريد الإلكتروني<input aria-label="بريد الطرف" type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email"/></label><label>العنوان<input aria-label="عنوان الطرف" value={address} onChange={event=>setAddress(event.target.value)} autoComplete="street-address"/></label>{kind==='customers' && canSetCredit && <label>حد الائتمان (ج.م)<input aria-label="حد ائتمان العميل" inputMode="decimal" value={credit} onChange={event=>setCredit(event.target.value)} aria-describedby="credit-limit-help"/><small id="credit-limit-help">صفر يعني بدون سقف ائتمان. الحد الموجب يقيد إجمالي المديونية بعد البيع.</small></label>}<label>ملاحظات<textarea aria-label="ملاحظات الطرف" value={notes} onChange={event=>setNotes(event.target.value)} rows={3}/></label></div><div className="operation-actions"><button type="submit" className="button primary">مراجعة البيانات</button><button className="button secondary" type="button" onClick={requestClose}>إلغاء</button></div></form>}
    {error && <p role="alert">{error}</p>}
  </dialog>;
}
export function PartyWorkspace({kind,canEdit=true}:{kind:Kind;canEdit?:boolean}){
  const workspace=useRef<HTMLElement>(null);
  const [status,setStatus]=useState<PartyDirectoryStatus>('active'),[offset,setOffset]=useState(0),[directoryTotal,setDirectoryTotal]=useState(0),[lifecycle,setLifecycle]=useState<Party|null>(null);
  const [rows,setRows]=useState<Party[]|null>(null);const [error,setError]=useState('');const [query,setQuery]=useState('');const [reload,setReload]=useState(0);
  const [editor,setEditor]=useState<Party|'new'|null>(null);const [success,setSuccess]=useState('');const [statement,setStatement]=useState<Party|null>(null);
  useEffect(()=>{let active=true;setRows(null);setError('');const path=status==='active'?`/${kind}`:`/${kind}/directory?status=${status}&limit=25&offset=${offset}`;void readJson<Record<Kind,Party[]>>(path).then(result=>{if(status==='active'){if(active){setRows(result[kind]);setDirectoryTotal(result[kind].length);}}else{const directory=partyDirectoryResultSchema.parse(result);if(directory.kind!==kind)throw Error('Unexpected party kind');if(active){setRows(directory.parties);setDirectoryTotal(directory.total);}}}).catch(reason=>{if(active)setError(reason instanceof ApiError && reason.status===403 ? 'صلاحيات حسابك لا تسمح بعرض هذه البيانات.' : 'تعذر تحميل البيانات. تحقق من الاتصال وأعد المحاولة.');});return()=>{active=false;};},[kind,reload,status,offset]);
  const visible=rows?.filter(row=>`${row.name} ${row.phone ?? ''} ${row.email ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section ref={workspace} tabIndex={-1} className="operation-panel party-workspace" aria-label="إدارة الأطراف"><OperationHeader id={`party-${kind}-title`} title={kind==='customers' ? 'إدارة العملاء' : 'إدارة الموردين'} description="بيانات حقيقية من مؤسستك. تعديل السجل يستخدم النسخة الحالية لمنع فقد تغييرات مستخدم آخر." icon="user"/>
    <div className="operation-actions"><button className="button primary" onClick={()=>{setSuccess('');setEditor('new');}}>إضافة {label(kind)}</button><button className="button secondary" onClick={()=>setReload(value=>value+1)}>تحديث القائمة</button></div>
    {canEdit&&<label className="field">حالة السجلات<select aria-label="حالة الأطراف" value={status} onChange={event=>{setStatus(event.target.value as PartyDirectoryStatus);setOffset(0);setQuery('');}}><option value="active">النشطة</option><option value="archived">المؤرشفة</option><option value="all">كل السجلات</option></select></label>}
    <label className="party-search">بحث بالاسم أو التواصل<input aria-label="بحث الأطراف" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {success && <p role="status">{success}</p>}{rows===null ? <p role={error ? 'alert' : 'status'}>{error||'جارٍ تحميل البيانات…'}</p> : visible!.length===0 ? <p className="operation-empty">لا توجد بيانات مطابقة. أضف سجلًا جديدًا أو غيّر البحث.</p> : <div className="operation-table-wrap" role="region" aria-label="قائمة الأطراف" tabIndex={0}><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>البريد</th>{kind==='customers' && <th>حد الائتمان (ج.م)</th>}<th>الإجراء</th></tr></thead><tbody>{visible!.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.phone||'—'}</td><td>{row.email||'—'}</td>{kind==='customers' && <td>{/^0(?:\.0+)?$/.test((row as Customer).creditLimit) ? 'بدون سقف' : operationMoney((row as Customer).creditLimit)}</td>}<td><button type="button" id={`statement-${row.id}`} onClick={()=>setStatement(row)}>كشف حساب {row.name}</button>{canEdit ? <><button type="button" onClick={()=>{setSuccess('');setEditor(row);}}>تعديل {row.name}</button><button type="button" id={`lifecycle-${row.id}`} onClick={()=>setLifecycle(row)}>{row.active?'أرشفة':'إعادة تفعيل'} {row.name}</button></> : <span>عرض فقط</span>}</td></tr>)}</tbody></table></div>}
    {canEdit&&status!=='active'&&rows&&<div className="operation-actions"><span>إجمالي السجلات: {directoryTotal} · البحث داخل الصفحة الحالية</span><button className="button secondary" disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-25))}>أطراف سابقة</button><button className="button secondary" disabled={offset+25>=directoryTotal} onClick={()=>setOffset(value=>value+25)}>أطراف تالية</button></div>}
    {lifecycle&&<PartyLifecycle key={lifecycle.id} kind={kind} party={lifecycle} close={()=>{setLifecycle(null);setReload(value=>value+1);workspace.current!.focus();}} complete={()=>{setLifecycle(null);setSuccess('تم تحديث حالة السجل.');setReload(value=>value+1);workspace.current!.focus();}}/>}
    {editor && <PartyEditor key={editor==='new' ? 'new' : editor.id} kind={kind} record={editor==='new' ? null : editor} canSetCredit={canEdit} close={()=>{setEditor(null);setReload(value=>value+1);}} saved={()=>{setEditor(null);setSuccess('تم حفظ البيانات بنجاح.');setReload(value=>value+1);}}/>}
    {statement&&<PartyStatement key={statement.id} kind={kind} party={statement} close={()=>{setStatement(null);(document.getElementById(`statement-${statement.id}`) ?? workspace.current!).focus();}}/>}
  </section>;
}
