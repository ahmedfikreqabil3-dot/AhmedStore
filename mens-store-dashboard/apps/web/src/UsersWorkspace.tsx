import {UserAdministration} from './UserAdministration.js';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {createUserSchema,publicUserSchema,roleSchema,type PublicUser,type Role} from '@ahmed-store/contracts';
import {ApiError,readJson} from './store-api.js';

const roles:Record<Role,string>={ADMIN:'مدير النظام',MANAGER:'مدير المتجر',FINANCE:'المالية',CASHIER:'كاشير',WAREHOUSE:'مسؤول المخزن'};
export function UsersWorkspace(){
  const [manage,setManage]=useState(false);const [users,setUsers]=useState<PublicUser[]|null>(null),[reload,setReload]=useState(0),[loadError,setLoadError]=useState('');
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<Role>('CASHIER'),[search,setSearch]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const locked=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setUsers(null);setLoadError('');
    void readJson<{users:unknown}>('/users',{signal:controller.signal}).then(result=>{const rows=publicUserSchema.array().parse(result.users);if(!controller.signal.aborted)setUsers(rows);}).catch(()=>{if(!controller.signal.aborted)setLoadError('تعذر تحميل المستخدمين. تحقق من الصلاحيات والاتصال وأعد المحاولة.');});
    return()=>controller.abort();
  },[reload]);
  async function save(event:FormEvent){
    event.preventDefault();if(locked.current||!users)return;setError('');setNotice('');
    const parsed=createUserSchema.safeParse({name,email,password,role});
    if(!parsed.success){setError('أدخل اسمًا من حرفين إلى 120 حرفًا، وبريدًا صحيحًا، وكلمة مرور من 12 إلى 128 حرفًا.');return;}
    if(users.some(user=>user.email.toLowerCase()===parsed.data.email)){setError('البريد الإلكتروني مسجل بالفعل.');return;}
    locked.current=true;setBusy(true);
    try{
      const user=publicUserSchema.parse(await readJson<unknown>('/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(parsed.data)}));
      setName('');setEmail('');setRole('CASHIER');setNotice(`تم إنشاء المستخدم: ${user.name}`);setReload(value=>value+1);
    }catch(problem){setError(problem instanceof ApiError&&problem.status===409?'البريد الإلكتروني مسجل بالفعل.':'تعذر تأكيد إنشاء المستخدم. راجع القائمة المحدّثة قبل إعادة المحاولة.');setReload(value=>value+1);}
    finally{setPassword('');locked.current=false;setBusy(false);}
  }
  const visible=users?.filter(user=>`${user.name} ${user.email} ${roles[user.role]}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="surface operation-panel users-workspace" aria-labelledby="users-heading"><h2 id="users-heading">إدارة المستخدمين</h2><button className="button secondary" onClick={()=>setManage(v=>!v)}>إدارة الأدوار والفروع وكلمات المرور</button>{manage&&<UserAdministration/>}
    <form aria-label="إضافة مستخدم" noValidate onSubmit={event=>void save(event)}><fieldset disabled={busy||!users}><div className="operation-fields">
      <label>اسم المستخدم<input value={name} maxLength={120} autoComplete="off" onChange={event=>setName(event.target.value)}/></label>
      <label>البريد الإلكتروني<input type="email" value={email} autoComplete="off" dir="ltr" onChange={event=>setEmail(event.target.value)}/></label>
      <label>كلمة المرور<input type="password" aria-label="كلمة المرور" value={password} autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="user-password-help" onChange={event=>setPassword(event.target.value)}/><small id="user-password-help">من 12 إلى 128 حرفًا.</small></label>
      <label>الدور<select value={role} onChange={event=>setRole(event.target.value as Role)}>{roleSchema.options.map(value=><option key={value} value={value}>{roles[value]}</option>)}</select></label>
    </div><button className="button primary" disabled={busy}>{busy?'جارٍ إنشاء المستخدم…':'إضافة مستخدم'}</button></fieldset></form>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {loadError?<div role="alert"><p>{loadError}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل المستخدمين</button></div>:users===null?<p role="status">جارٍ تحميل المستخدمين…</p>:<>
      <label className="users-search">بحث المستخدمين<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label><p>عدد النتائج: {visible!.length}</p>
      {users.length===0?<p className="operation-empty">لا يوجد مستخدمون مسجلون.</p>:visible!.length===0?<p className="operation-empty">لا توجد نتائج للبحث.</p>:<ul className="operation-lines">{visible!.map(user=><li key={user.id}><div><strong>{user.name}</strong><p><bdi>{user.email}</bdi></p><p>{roles[user.role]}</p></div></li>)}</ul>}
    </>}
  </section>;
}
