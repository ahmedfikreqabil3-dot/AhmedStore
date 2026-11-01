import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { CommandHttpError } from './http-error.js';
export { CommandHttpError } from './http-error.js';

export const CommandScope = createContext<string | null>(null);
export type PendingCommand<T>={version:1;key:string;input:T};
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export class PendingCommandRunner<T> {
  pending:PendingCommand<T>|null=null;
  busy=false;
  blocked=false;
  constructor(readonly storage:StoragePort|null,readonly storageKey:string,validate:(input:unknown)=>void){
    try {
      const raw=storage?.getItem(storageKey);
      if(raw){
        const saved=JSON.parse(raw) as PendingCommand<T>;
        if(saved.version!==1||typeof saved.key!=='string'||!saved.key.length||saved.key.length>200)throw Error('INVALID_COMMAND');
        validate(saved.input);this.pending=saved;
      }
    }catch{this.blocked=true;}
  }
  async run<R>(input:()=>T,createKey:()=>string,send:(input:T,key:string)=>Promise<R>):Promise<R|undefined>{
    if(this.busy)return;
    if(this.blocked)throw Error('PENDING_COMMAND_UNREADABLE');
    this.busy=true;
    const recovered=this.pending!==null;
    try {
      // Serialize before sending: later edits or a refreshed page cannot change a retry.
      const next=this.pending ?? JSON.parse(JSON.stringify({version:1,key:createKey(),input:input()})) as PendingCommand<T>;
      this.storage?.setItem(this.storageKey,JSON.stringify(next));this.pending=next;
      const result=await send(next.input,next.key);
      this.storage?.removeItem(this.storageKey);this.pending=null;
      this.busy=false;
      return result;
    }catch(error){
      this.busy=false;
      // Timeouts, throttling and server/network failures have an uncertain outcome.
      if(!recovered && error instanceof CommandHttpError && error.status>=400 && error.status<500 && ![408,425,429].includes(error.status)){
        this.storage?.removeItem(this.storageKey);this.pending=null;
      }
      throw error;
    }
  }
}
export function usePendingCommand<T>(operation:string,validate:(input:unknown)=>void){
  const scope=useContext(CommandScope);
  const runner=useMemo(()=>{
    const key=`ahmed-store.pending.${scope}.${operation}`;
    try{return new PendingCommandRunner<T>(scope ? sessionStorage : null,key,validate);}
    catch{const blocked=new PendingCommandRunner<T>(null,key,validate);blocked.blocked=true;return blocked;}
  },[scope,operation,validate]);
  const [,render]=useState(0);
  async function run<R>(input:()=>T,key:()=>string,send:(input:T,key:string)=>Promise<R>){
    const result=runner.run(input,key,send);render(value=>value+1);
    try{return await result;}finally{render(value=>value+1);}
  }
  return {pending:runner.pending,busy:runner.busy,blocked:runner.blocked,run};
}
export function PendingCommandNotice({blocked,pending,busy,retry,children}:{blocked:boolean;pending:boolean;busy:boolean;retry:()=>void;children?:ReactNode}){
  if(blocked)return <p className="operation-note" role="alert">تعذر قراءة الطلب المحفوظ. توقف عن إنشاء عملية بديلة وراجع مسؤول النظام للتحقق من نتيجته.</p>;
  if(!pending)return null;
  return <aside className="operation-note" aria-label="استعادة طلب لم تتأكد نتيجته"><p>فيه طلب محفوظ لم تتأكد نتيجته. راجع بياناته وأعد نفس الطلب؛ لا تنشئ عملية بديلة قبل التأكد.</p>{children}<button className="button primary" type="button" disabled={busy} onClick={retry}>{busy ? 'جارٍ التحقق من الطلب…' : 'إعادة نفس الطلب المحفوظ'}</button></aside>;
}
