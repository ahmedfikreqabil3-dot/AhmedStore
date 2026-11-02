import {useEffect,useRef,useState} from 'react';
import {saleDocumentSchema,type SaleDocument} from '@ahmed-store/contracts';
import {readJson} from './store-api.js';
import {statementAmount} from './PartyStatement.js';
import {operationLabel} from './operation-format.js';
import {InvoiceReturnEditor} from './InvoiceReturnEditor.js';
import {printSaleDocument} from './invoice-print.js';

export function InvoiceDocument({saleId,canReturn=false}:{saleId:string;canReturn?:boolean}){
  const [data,setData]=useState<SaleDocument|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[editing,setEditing]=useState<'new'|string|null>(null),[success,setSuccess]=useState(''),[printError,setPrintError]=useState('');
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');setEditing(null);void readJson(`/sales/${saleId}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setData(saleDocumentSchema.parse(value));}}).catch(()=>{if(!controller.signal.aborted)setError('تعذر تحميل الفاتورة. تحقق من الاتصال والصلاحيات وأعد المحاولة.');});return()=>controller.abort();},[saleId,reload]);
  useEffect(()=>{if(data)heading.current!.focus();},[data]);
  async function print(format:'a4'|'80mm',returnId?:string){setPrintError('');try{await printSaleDocument(data!,format,returnId);}catch{setPrintError('تعذر فتح الطباعة. اسمح بالنوافذ المنبثقة وأعد المحاولة.');}}
  if(error)return <div role="alert"><p>{error}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>إعادة تحميل الفاتورة</button></div>;
  if(!data)return <p role="status">جارٍ تحميل تفاصيل الفاتورة…</p>;
  return <section className="surface operation-panel invoice-document" aria-label="تفاصيل فاتورة البيع"><h2 ref={heading} tabIndex={-1}>تفاصيل فاتورة البيع</h2><p><bdi>{data.id}</bdi> · {operationLabel(data.status)} · {data.occurredAt.toLocaleString('ar-EG')}</p><dl className="operation-facts"><div><dt>العميل</dt><dd>{data.customer.name}</dd></div><div><dt>الفرع</dt><dd>{data.warehouse.name}</dd></div><div><dt>قبل الخصم</dt><dd>{statementAmount(data.subtotal)}</dd></div><div><dt>الخصم</dt><dd>{statementAmount(data.discount)}</dd></div><div><dt>الإجمالي (ج.م)</dt><dd>{statementAmount(data.total)}</dd></div></dl>
    <div className="operation-actions"><button className="button secondary" onClick={()=>void print('a4')}>طباعة الفاتورة A4</button><button className="button secondary" onClick={()=>void print('80mm')}>طباعة إيصال 80mm</button>{canReturn&&data.status==='POSTED'&&<button className="button primary" onClick={()=>setEditing('new')}>تسجيل مرتجع لهذه الفاتورة</button>}</div>
    <div className="operation-table-wrap" role="region" aria-label="أصناف فاتورة البيع" tabIndex={0}><table><thead><tr>{['الصنف / الكود','الكمية','السعر','الخصم','الإجمالي','المرتجع المسجل'].map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{data.lines.map(line=><tr key={line.id}><td>{line.productName}<small>{line.sku}</small></td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.discount}</td><td>{line.total}</td><td>{line.returnedQuantity}</td></tr>)}</tbody></table></div><h3>طرق السداد</h3><ul>{data.payments.map((row,index)=><li key={index}>{operationLabel(row.method)}: {row.amount} ج.م</li>)}</ul>
    <h3>المرتجعات المرتبطة</h3>{data.returns.length===0?<p>لا توجد مرتجعات مسجلة لهذه الفاتورة.</p>:<ul className="operation-lines">{data.returns.map(row=><li key={row.id}><div><strong><bdi>{row.id}</bdi></strong><p>{operationLabel(row.status)} · {row.total} ج.م · {row.occurredAt.toLocaleString('ar-EG')}</p><p>{row.reason}</p>{row.replacesReturnId&&<p>بديل للمرتجع <bdi>{row.replacesReturnId}</bdi></p>}<ul>{row.lines.map((line,index)=><li key={index}>{data.lines.find(item=>item.id===line.saleLineId)!.productName}: {line.quantity} · {line.total} ج.م</li>)}</ul><p>{row.payments.map(payment=>`${operationLabel(payment.method)}: ${payment.amount}`).join(' · ')}</p><div className="operation-actions"><button className="button secondary" onClick={()=>void print('80mm',row.id)}>طباعة مرتجع {row.id}</button>{canReturn&&data.status==='POSTED'&&row.status==='POSTED'&&<button className="button secondary" onClick={()=>setEditing(row.id)}>تصحيح مرتجع {row.id}</button>}</div></div></li>)}</ul>}
    {editing&&<InvoiceReturnEditor key={editing} sale={data} original={editing==='new'?undefined:data.returns.find(row=>row.id===editing)!} close={()=>setEditing(null)} complete={id=>{setEditing(null);setReload(value=>value+1);setSuccess(`تم تسجيل المرتجع ${id}.`);}}/>}
    {success&&<p role="status">{success}</p>}{printError&&<p role="alert">{printError}</p>}
  </section>;
}
