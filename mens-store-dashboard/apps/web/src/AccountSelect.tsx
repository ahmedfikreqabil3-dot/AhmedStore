import {useEffect,useState} from 'react';
import {readJson} from './store-api.js';
type Choice={id:string;name:string;paymentMethod:string;isDefault:boolean};
export function AccountSelect({method,value='',onChange,label,disabled=false}:{method:string;value?:string;onChange:(id:string)=>void;label:string;disabled?:boolean}){
 const [accounts,setAccounts]=useState<Choice[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 async function load(){if(loaded)return;try{const data=await readJson<{accounts:Choice[]}>('/treasury-options');if(!Array.isArray(data.accounts))throw Error();setAccounts(data.accounts);setLoaded(true);setError('');}catch{setError('تعذر تحميل الخزائن. أعد فتح القائمة للمحاولة.');}}
 useEffect(()=>{if(value)void load();},[value]);
 if(method==='CREDIT')return null;
 return <label>{label}<select aria-label={label} value={value} disabled={disabled} onFocus={()=>void load()} onChange={e=>onChange(e.target.value)}><option value="">الخزينة الافتراضية لطريقة السداد</option>{value&&!accounts.some(a=>a.id===value)&&<option value={value}>الخزينة المختارة</option>}{accounts.filter(a=>a.paymentMethod===method).map(a=><option value={a.id} key={a.id}>{a.name}{a.isDefault?' · افتراضية':''}</option>)}</select>{error&&<span role="alert">{error}</span>}</label>;
}
