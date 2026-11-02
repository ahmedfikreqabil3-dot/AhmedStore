import { useRef, useState } from 'react';
import { customerImportCommandSchema, customerImportPreviewSchema, type CustomerImportCommand, type CustomerImportPreview } from '@ahmed-store/contracts';
import { readJson } from './store-api.js';
import { PendingCommandNotice, usePendingCommand } from './pending-command.js';
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const validate=(value:unknown)=>{customerImportCommandSchema.parse(value);};
const errors:Record<string,string>={INVALID_WORKBOOK:'ملف Excel غير صالح',EXPECTED_CUSTOMER_COLUMNS:'الأعمدة لا تطابق النموذج',INVALID_CUSTOMER:'راجع بيانات العميل وحد الائتمان',DUPLICATE_IN_FILE:'عميل مكرر داخل الملف',CUSTOMER_EXISTS:'عميل موجود بالفعل، بما في ذلك المؤرشف',NO_ROWS:'لا توجد بيانات',TOO_MANY_ROWS:'الحد الأقصى ١٠٠٠ عميل'};
function bytes(command:CustomerImportCommand){return Uint8Array.from(atob(command.content),value=>value.charCodeAt(0));}
export function CustomerImport({saved}:{saved:()=>void}){
  const command=usePendingCommand<CustomerImportCommand>('customer-import',validate);
  const [file,setFile]=useState<CustomerImportCommand|null>(null),[preview,setPreview]=useState<CustomerImportPreview|null>(null),[offset,setOffset]=useState(0),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const picker=useRef<HTMLInputElement>(null),working=useRef(false);
  async function select(selected:File|undefined){
    if(working.current)return;setPreview(null);setReviewed(false);setFile(null);setError('');setSuccess('');setOffset(0);
    if(!selected)return;
    if(!selected.name.toLowerCase().endsWith('.xlsx')||selected.size<1||selected.size>1048576){setError('اختر ملف xlsx بحجم لا يتجاوز ١ ميجابايت.');return;}
    working.current=true;setBusy(true);
    try{
      const data=new Uint8Array(await selected.arrayBuffer());let binary='';for(let index=0;index<data.length;index+=8192)binary+=String.fromCharCode(...data.subarray(index,index+8192));
      const next=customerImportCommandSchema.parse({filename:selected.name,content:btoa(binary)});setFile(next);
      setPreview(customerImportPreviewSchema.parse(await readJson('/customers/import-preview',{method:'POST',headers:{'content-type':mime},body:new Blob([data],{type:mime})})));
    }catch{setError('تعذرت معاينة الملف. تحقق من الاتصال والملف ثم اختره مجددًا.');}
    finally{working.current=false;setBusy(false);}
  }
  async function post(){
    if(working.current||(!command.pending&&(!file||!preview?.valid||!reviewed)))return;
    working.current=true;setBusy(true);setError('');setSuccess('');
    try{
      const result=await command.run(()=>file!,()=>crypto.randomUUID(),async(input,key)=>{
        const response=await readJson<{imported:number;replayed:boolean}>('/customers/import',{method:'POST',headers:{'content-type':mime,'idempotency-key':key},body:new Blob([bytes(input)],{type:mime})});
        if(!Number.isInteger(response.imported)||response.imported<1)throw Error('INVALID_IMPORT_RESPONSE');return response;
      });
      if(result){setSuccess(`تم استيراد ${result.imported} عميل بنجاح.`);setFile(null);setPreview(null);setReviewed(false);if(picker.current)picker.current.value='';saved();}
    }catch{setError('تعذر تأكيد الاستيراد. لو ظهر طلب محفوظ، أعد نفس الطلب للتحقق؛ لا ترفع نسخة بديلة قبل التأكد من النتيجة.');}
    finally{working.current=false;setBusy(false);}
  }
  async function template(){
    if(working.current)return;working.current=true;setBusy(true);setError('');
    try{const response=await fetch('/api/v1/customers/import-template',{credentials:'include'});if(!response.ok)throw Error('FAILED');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='customers-template.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError('تعذر تنزيل نموذج العملاء. أعد المحاولة.');}finally{working.current=false;setBusy(false);}
  }
  return <section className="surface operation-panel" aria-label="استيراد العملاء"><h3>استيراد العملاء من Excel</h3><p>إضافة فقط؛ لا يتم تعديل العملاء الحاليين. حد الائتمان مطلوب، وصفر يعني بدون سقف. التكرار يُراجع بالاسم والهاتف والبريد. الحد الأقصى ١٠٠٠ عميل و١ ميجابايت.</p>
    <PendingCommandNotice blocked={command.blocked} pending={!!command.pending} busy={busy||command.busy} retry={()=>void post()}>{command.pending&&<p>الملف المحفوظ: {command.pending.input.filename}</p>}</PendingCommandNotice>
    <fieldset disabled={busy||command.busy||!!command.pending||command.blocked}><button type="button" className="button secondary" onClick={()=>void template()}>تنزيل نموذج العملاء</button><label className="field">ملف العملاء<input ref={picker} type="file" accept=".xlsx" onChange={event=>void select(event.target.files?.[0])}/></label>
      {preview&&<><p>{preview.rows.length} عميل صالح · {preview.errors.length} خطأ</p>{preview.errors.map((item,index)=><p key={index} role="alert">صف {item.row}: {errors[item.message]}</p>)}
        <div className="operation-table-wrap" role="region" aria-label="معاينة استيراد العملاء" tabIndex={0}><table><thead><tr>{['الصف','الاسم','الهاتف','البريد','حد الائتمان','التفاصيل'].map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{preview.rows.slice(offset,offset+25).map(row=><tr key={row.row}><td>{row.row}</td><td>{row.name}</td><td>{row.phone||'—'}</td><td>{row.email||'—'}</td><td>{/^0+(?:\.0+)?$/.test(row.creditLimit)?'بدون سقف':row.creditLimit}</td><td><details><summary>العنوان والملاحظات</summary><p>{row.address||'—'}</p><p>{row.notes||'—'}</p></details></td></tr>)}</tbody></table></div>
        <div className="operation-actions"><button type="button" disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-25))}>صفوف سابقة</button><button type="button" disabled={offset+25>=preview.rows.length} onClick={()=>setOffset(value=>value+25)}>صفوف تالية</button></div>
        {preview.valid&&<><label><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>راجعت كل صفوف الملف وحدود الائتمان وأوافق على الإضافة</label><button type="button" className="button primary" disabled={!reviewed} onClick={()=>void post()}>تأكيد استيراد العملاء</button></>}
      </>}
    </fieldset>{busy&&<p role="status">جارٍ تنفيذ الطلب…</p>}{error&&<p role="alert">{error}</p>}{success&&<p role="status">{success}</p>}
  </section>;
}
