export type RefundParts={cash:string;card:string;account:string};
export const initialRefund:RefundParts={cash:'400.00',card:'290.00',account:'0.00'};
const cents=(value:string)=>/^\d+(?:\.\d{1,2})?$/.test(value) ? BigInt(value.split('.')[0]!)*100n+BigInt((value.split('.')[1] ?? '').padEnd(2,'0')) : null;
export function refundPreviewError(parts:RefundParts){
  const values=[cents(parts.cash),cents(parts.card),cents(parts.account)];
  if(values.some(value=>value===null))return 'اكتب مبالغ موجبة أو صفرًا، وبحد أقصى منزلتين عشريتين.';
  const [cash,card,account]=values as bigint[];
  if(cash!>40000n||card!>29000n)return 'النقدي أو البطاقة يتجاوز المبلغ المتاح في سيناريو السداد الأصلي.';
  if(cash!+card!+account! !==69000n)return 'مجموع التوزيع لازم يساوي مبلغ المعاينة: 690.00 ج.م.';
  return '';
}
export function RefundAllocation({parts,change}:{parts:RefundParts;change:(parts:RefundParts)=>void}){
  return <section className="statement-document" aria-label="توزيع الاسترداد التوضيحي"><h3>توزيع الاسترداد</h3><p>سيناريو ثابت بقيمة 690.00 ج.م، نقدي متاح 400.00 وبطاقة 290.00. المثال مستقل عن الكميات المختارة، ولا يحسب استردادها الفعلي. قواعد التحويل لرصيد العميل تحتاج اعتمادًا قبل التشغيل.</p><div className="planned-fields">{([['cash','نقدي'],['card','بطاقة'],['account','رصيد حساب العميل']] as const).map(([key,label])=><label className="field" key={key}><span>{label} (ج.م)</span><input aria-label={`استرداد ${label}`} type="number" step="0.01" min="0" value={parts[key]} onChange={event=>change({...parts,[key]:event.target.value})}/></label>)}</div></section>;
}
