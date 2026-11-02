import type {SaleDocument} from '@ahmed-store/contracts';
import {operationLabel} from './operation-format.js';
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export async function printSaleDocument(sale:SaleDocument,format:'a4'|'80mm',returnId?:string){
  const returned=returnId?sale.returns.find(row=>row.id===returnId):undefined;
  if(returnId&&!returned)throw Error('RETURN_UNAVAILABLE');
  const popup=window.open('','_blank');if(!popup)throw Error('PRINT_POPUP_BLOCKED');popup.opener=null;
  const title=returned?'إيصال مرتجع بيع':'فاتورة بيع',document=returned??sale;
  const lines=returned?returned.lines.map(row=>({...row,productName:sale.lines.find(line=>line.id===row.saleLineId)!.productName,sku:sale.lines.find(line=>line.id===row.saleLineId)!.sku,discount:'—'})):sale.lines;
  const payments=document.payments.map(row=>`<li>${escape(operationLabel(row.method))}: <bdi>${escape(row.amount)}</bdi> ج.م</li>`).join('');
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>
  @page{size:${format==='a4'?'A4':'auto'};margin:${format==='a4'?'12mm':'4mm'}}*{box-sizing:border-box}body{font:12px Tahoma,Arial,sans-serif;color:#172b4d;margin:0 auto;display:flow-root;overflow-wrap:anywhere;max-width:${format==='a4'?'186mm':'72mm'}}h1{font-size:20px}h1,h2,p{text-align:center}table{width:100%;border-collapse:collapse;font-size:${format==='a4'?'12px':'9px'}}th,td{padding:5px 2px;border-bottom:1px solid #ddd;overflow-wrap:anywhere;vertical-align:top}bdi{font-variant-numeric:tabular-nums}small{display:block}tr{break-inside:avoid}.total{font-size:16px;font-weight:bold}.status{font-weight:bold;border:1px solid;padding:5px}ul{padding-inline-start:18px}
  </style></head><body><h1>${escape(sale.organizationName)}</h1><h2>${title}</h2><p class="status">${escape(operationLabel(document.status))}</p><p>رقم المستند: <bdi>${escape(document.id)}</bdi><br>${escape(document.occurredAt.toLocaleString('ar-EG'))}<br>العميل: ${escape(sale.customer.name)}<br>الفرع: ${escape(sale.warehouse.name)}</p>${returned?`<p>الفاتورة الأصلية: <bdi>${escape(sale.id)}</bdi><br>السبب: ${escape(returned.reason)}</p>`:''}
  <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>${lines.map(row=>`<tr><td>${escape(row.productName)}<small>${escape(row.sku)}</small></td><td><bdi>${escape(row.quantity)}</bdi></td><td><bdi>${escape(row.unitPrice)}</bdi></td><td><bdi>${escape(row.discount)}</bdi></td><td><bdi>${escape(row.total)}</bdi></td></tr>`).join('')}</tbody></table>
  ${returned?'':`<p>قبل الخصم: <bdi>${escape(sale.subtotal)}</bdi> · الخصم: <bdi>${escape(sale.discount)}</bdi></p>`}<p class="total">الإجمالي: <bdi>${escape(document.total)}</bdi> ج.م</p><h3>${returned?'رد القيمة / تسوية الآجل':'طرق السداد'}</h3><ul>${payments}</ul><p>احتفظ بالمستند للمراجعة.</p></body></html>`);
  popup.document.close();if(popup.closed)return;
  if(format==='80mm'){const page=popup.document.createElement('style');page.textContent=`@page{size:80mm ${Math.ceil(popup.document.body.getBoundingClientRect().height*25.4/96)+8}mm;margin:4mm}`;popup.document.head.append(page);}
  popup.print();
}
