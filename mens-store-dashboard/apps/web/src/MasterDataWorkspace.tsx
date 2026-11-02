import {MasterManagement} from './ManagementWorkspace.js';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {categorySchema,warehouseSchema,createCategorySchema,createWarehouseSchema} from '@ahmed-store/contracts';
import {ApiError,readJson} from './store-api.js';

type Kind='warehouses'|'categories';
const labels={warehouses:{title:'إدارة الفروع',name:'اسم الفرع',search:'بحث الفروع',add:'إضافة فرع',empty:'لا توجد فروع مسجلة.',duplicate:'اسم الفرع مسجل بالفعل.'},categories:{title:'إدارة الفئات',name:'اسم الفئة',search:'بحث الفئات',add:'إضافة فئة',empty:'لا توجد فئات مسجلة.',duplicate:'اسم الفئة مسجل بالفعل.'}};
export function MasterDataWorkspace({kind}:{kind:Kind}){
  const text=labels[kind],locked=useRef(false);const [manage,setManage]=useState(false);
  const [items,setItems]=useState<Array<{id:string;name:string;active:boolean}>|null>(null),[reload,setReload]=useState(0);
  const [name,setName]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setItems(null);setLoadError('');
    void readJson<Record<string,unknown>>(`/${kind}`,{signal:controller.signal}).then(result=>{
      const rows=kind==='warehouses'?warehouseSchema.array().parse(result[kind]):categorySchema.array().parse(result[kind]).map(row=>({...row,active:row.archivedAt===null}));
      if(!controller.signal.aborted)setItems(rows);
    }).catch(()=>{if(!controller.signal.aborted)setLoadError('تعذر تحميل القائمة. أعد المحاولة قبل الإضافة.');});
    return()=>controller.abort();
  },[kind,reload]);
  async function save(event:FormEvent){
    event.preventDefault();if(locked.current||!items)return;setError('');setNotice('');
    const parsed=(kind==='warehouses'?createWarehouseSchema:createCategorySchema).safeParse({name});
    if(!parsed.success){setError('الاسم مطلوب، من حرفين إلى 120 حرفًا.');return;}
    if(items.some(row=>row.name===parsed.data.name)){setError(text.duplicate);return;}
    locked.current=true;setBusy(true);
    try{
      const response=await readJson<unknown>(`/${kind}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(parsed.data)});
      const created=(kind==='warehouses'?warehouseSchema:categorySchema).parse(response);
      setName('');setNotice(`تمت الإضافة: ${created.name}`);setReload(value=>value+1);
    }catch(problem){setError(problem instanceof ApiError&&problem.status===409?text.duplicate:'تعذر تأكيد الإضافة. راجع القائمة المحدّثة قبل إعادة المحاولة.');setReload(value=>value+1);}
    finally{locked.current=false;setBusy(false);}
  }
  const visible=items?.filter(row=>row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="surface operation-panel master-data-workspace" aria-labelledby={`master-${kind}`}>
    <button className="button secondary" onClick={()=>setManage(v=>!v)}>تعديل وأرشفة</button>{manage&&<MasterManagement kind={kind}/>}<h2 id={`master-${kind}`}>{text.title}</h2><p className="operation-note">إضافة البيانات الأساسية لا تنشئ أرصدة أو حركات مالية. تظهر الإضافات في قوائم الاختيار عند فتح العملية التالية.</p>
    <form aria-label={text.add} onSubmit={event=>void save(event)} noValidate><fieldset disabled={busy||!items}><label>{text.name}<input value={name} maxLength={120} aria-invalid={!!error} aria-describedby={error?`master-error-${kind}`:undefined} onChange={event=>setName(event.target.value)}/></label><button className="button primary" disabled={busy} type="submit">{busy?'جارٍ الإضافة…':text.add}</button></fieldset></form>
    {error&&<p id={`master-error-${kind}`} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {loadError?<div role="alert"><p>{loadError}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل القائمة</button></div>:items===null?<p role="status">جارٍ تحميل القائمة…</p>:<>
      <label className="master-search">{text.search}<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label><p>عدد النتائج: {visible!.length}</p>
      {items.length===0?<p className="operation-empty">{text.empty}</p>:visible!.length===0?<p className="operation-empty">لا توجد نتائج للبحث.</p>:<ul className="operation-lines">{visible!.map(row=><li key={row.id}><div><strong>{row.name}</strong><p>{row.active?'نشط':'غير نشط'}</p></div></li>)}</ul>}
    </>}
  </section>;
}
