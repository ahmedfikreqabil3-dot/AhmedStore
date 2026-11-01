import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeldDocumentJourney } from './HeldDocumentJourney.js';
import { DocumentJourney } from './DocumentJourney.js';
import { refundPreviewError } from './RefundAllocation.js';
import { PlannedWorkspaces } from './PlannedWorkspaces.js';
import { PrintWorkspace } from './PrintWorkspace.js';
import { DraftDocumentJourney } from './DraftDocumentJourney.js';
import { POS, Sales, Purchases } from './DesignPreview.js';
import { PurchaseJourney } from './PurchaseJourney.js';

beforeEach(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;};
  vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No operational calls from design');}));
  vi.stubGlobal('print',vi.fn());
});
afterEach(()=>{expect(fetch).not.toHaveBeenCalled();expect(print).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();});
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});

it('previews cancelling only an outstanding order remainder while preserving prior receipts',()=>{
  const complete=vi.fn(),close=vi.fn();render(<OrderCancellation reference="PO-0024" close={close} complete={complete}/>);
  click('مراجعة إلغاء أمر الشراء');expect(screen.getByRole('alert')).toHaveTextContent('سببًا واضحًا');change('سبب إلغاء أمر الشراء','توقف توريد باقي الطلب');click('مراجعة إلغاء أمر الشراء');
  expect(screen.getByText('12 قطعة متبقية تُلغى')).toBeVisible();expect(screen.getByText(/الاستلامات السابقة وفواتيرها محفوظة/)).toBeVisible();click('رجوع لسبب الإلغاء');expect(screen.getByLabelText('سبب إلغاء أمر الشراء')).toHaveValue('توقف توريد باقي الطلب');
  fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));click('استكمال سبب الإلغاء');click('مراجعة إلغاء أمر الشراء');click('تأكيد معاينة إلغاء الأمر');expect(complete).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
});

it('blocks repeated cancellation and cancellation of fully received orders and keeps discard explicit',()=>{
  const close=vi.fn();render(<OrderCancellation reference="PO-0024" close={close} complete={vi.fn()}/>);
  change('حالة إلغاء أمر الشراء','مكتمل الاستلام');expect(screen.getByRole('alert')).toHaveTextContent('لا يوجد متبق');expect(screen.queryByRole('button',{name:'مراجعة إلغاء أمر الشراء'})).not.toBeInTheDocument();
  change('حالة إلغاء أمر الشراء','ملغي');expect(screen.getByRole('alert')).toHaveTextContent('لا يتكرر الإلغاء');change('حالة إلغاء أمر الشراء','بانتظار الاستلام');change('سبب إلغاء أمر الشراء','سبب الإلغاء');click('رجوع للأمر');click('تجاهل السبب وإغلاق');expect(close).toHaveBeenCalledOnce();
});

it('blocks receipt into completed or cancelled orders and retains four-decimal partial receipt quantities',()=>{
  render(<DocumentJourney kind="receipt" reference="PO-0024" close={vi.fn()} complete={vi.fn()}/>);
  change('حالة استلام الأمر','مكتمل الاستلام');expect(screen.getByRole('button',{name:'مراجعة المستند'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('الاستلام الجديد غير متاح');
  change('حالة استلام الأمر','ملغي');expect(screen.getByRole('button',{name:'مراجعة المستند'})).toBeDisabled();change('حالة استلام الأمر','بانتظار الاستلام');
  change('كمية قميص أوكسفورد','0.2500');change('سبب أو مرجع المستند','إذن استلام جزئي');click('مراجعة المستند');expect(screen.getByText('0.2500 قطعة')).toBeVisible();click('رجوع للكميات');expect(screen.getByLabelText('كمية قميص أوكسفورد')).toHaveValue(0.25);
});

it('opens cancellation of an order remainder from the order detail without a financial call',()=>{
  render(<PlannedWorkspaces screen="purchase-orders" announce={vi.fn()}/>);fireEvent.click(screen.getAllByRole('button',{name:'عرض التفاصيل'})[0]!);click('إلغاء المتبقي من الأمر');expect(screen.getByRole('heading',{name:'إلغاء المتبقي من أمر الشراء'})).toBeVisible();
});

it('builds a multiline quotation, validates dates/discounts and preserves edits through review',()=>{
  const complete=vi.fn();render(<DraftDocumentJourney kind="quotation" close={vi.fn()} complete={complete}/>);
  click('مراجعة أصناف المسودة');expect(screen.getByRole('alert')).toHaveTextContent('اختار الطرف');change('طرف المسودة','أحمد محمود');change('تاريخ انتهاء المسودة','2026-10-01');click('مراجعة أصناف المسودة');expect(screen.getByRole('alert')).toHaveTextContent('لا يسبقه');change('تاريخ انتهاء المسودة','2026-11-05');
  change('كمية المسودة 1','0');click('مراجعة أصناف المسودة');expect(screen.getByRole('alert')).toHaveTextContent('كمية موجبة');change('كمية المسودة 1','0.2500');change('سعر المسودة 1','19.9500');change('خصم المسودة 1','6');click('مراجعة أصناف المسودة');expect(screen.getByRole('alert')).toHaveTextContent('الخصم لا يتجاوز');change('خصم المسودة 1','0.0000');
  click('إضافة صنف للمسودة');change('سعر المسودة 2','5.0000');change('كمية المسودة 2','2');change('ملاحظات المسودة','تسليم على دفعتين');change('فرع المسودة','فرع مدينة نصر');change('نوع مسودة المستند','فاتورة معلّقة');click('مراجعة أصناف المسودة');expect(screen.getByText('14.9875 ج.م')).toBeVisible();expect(screen.getByText('تسليم على دفعتين')).toBeVisible();click('رجوع لأصناف المسودة');expect(screen.getByLabelText('كمية المسودة 1')).toHaveValue('0.2500');click('مراجعة أصناف المسودة');click('تأكيد معاينة المسودة');expect(complete).toHaveBeenCalledOnce();
});

it('prevents duplicate lines and supports removal without deleting the last line',()=>{
  render(<DraftDocumentJourney kind="purchase-order" close={vi.fn()} complete={vi.fn()}/>);change('طرف المسودة','شركة النخبة للملابس');expect(screen.getByRole('button',{name:'حذف سطر المسودة 1'})).toBeDisabled();click('إضافة صنف للمسودة');change('صنف المسودة 2','قميص أوكسفورد');click('مراجعة أصناف المسودة');expect(screen.getByRole('alert')).toHaveTextContent('الصنف مكرر');change('صنف المسودة 2','تيشيرت بولو');click('حذف سطر المسودة 1');click('مراجعة أصناف المسودة');expect(screen.getAllByText('350.0000 ج.م')).toHaveLength(2);expect(screen.getByText(/دون استلام تلقائي/)).toBeVisible();
});

it('requires an explicit discard decision for modified multiline drafts',()=>{
  const close=vi.fn();render(<DraftDocumentJourney kind="quotation" reference="QUO-0018" close={close} complete={vi.fn()}/>);change('ملاحظات المسودة','لا تغلق قبل المراجعة');click('إلغاء المسودة');expect(close).not.toHaveBeenCalled();click('استكمال المسودة');expect(screen.getByLabelText('ملاحظات المسودة')).toHaveValue('لا تغلق قبل المراجعة');fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));click('تجاهل المسودة وإغلاق');expect(close).toHaveBeenCalledOnce();
});

it.each(['quotations','purchase-orders'] as const)('opens the multiline editor from the %s workspace',page=>{
  render(<PlannedWorkspaces screen={page} announce={vi.fn()}/>);click(page==='quotations' ? 'مستند جديد' : 'أمر شراء جديد');expect(screen.getByRole('region',{name:'أصناف المسودة'})).toBeVisible();
});

it('reviews purchase entry with exact quantities and a matching mixed settlement',()=>{
  const complete=vi.fn();render(<PurchaseJourney close={vi.fn()} complete={complete}/>);click('مراجعة مستند المشتريات');expect(screen.getByRole('alert')).toHaveTextContent('كمية موجبة');change('كمية مشتريات 1','0.2500');change('تكلفة مشتريات 1','19.9500');click('مراجعة مستند المشتريات');expect(screen.getByRole('alert')).toHaveTextContent('مجموع حركة الخزينة');change('مبلغ خزينة المشتريات','2');change('تسوية حساب المورد','2.9875');change('مورد مستند المشتريات','مصنع الأصيل');change('فرع مستند المشتريات','فرع مدينة نصر');change('تاريخ مستند المشتريات','2026-11-01');click('مراجعة مستند المشتريات');expect(screen.getAllByText('4.9875 ج.م')).toHaveLength(2);click('رجوع لأصناف المشتريات');expect(screen.getByLabelText('كمية مشتريات 1')).toHaveValue('0.2500');click('مراجعة مستند المشتريات');click('تأكيد معاينة المشتريات');expect(complete).toHaveBeenCalledOnce();
});

it('blocks replacement after a prior return and checks remaining original quantities',()=>{
  render(<PurchaseJourney reference="PUR-0284" close={vi.fn()} complete={vi.fn()}/>);change('سيناريو فاتورة المشتريات','بها مرتجع سابق');expect(screen.getByRole('button',{name:'معاينة العكس والاستبدال'})).toBeDisabled();click('معاينة مرتجع المشتريات');change('كمية مشتريات 1','2');change('سبب مستند المشتريات','إرجاع المورد');click('مراجعة مستند المشتريات');expect(screen.getByRole('alert')).toHaveTextContent('تتجاوز المتبقي');change('كمية مشتريات 1','1');change('مبلغ خزينة المشتريات','200');change('تسوية حساب المورد','220');change('طريقة خزينة المشتريات','بطاقة');click('مراجعة مستند المشتريات');expect(screen.getByText('استرداد للخزينة · بطاقة')).toBeVisible();expect(screen.getByText('خصم من مستحق المورد')).toBeVisible();
});

it('reviews immutable replacement with a required reason and blocks actions on a voided purchase',()=>{
  const view=render(<PurchaseJourney reference="PUR-0284" close={vi.fn()} complete={vi.fn()}/>);click('معاينة العكس والاستبدال');change('مبلغ خزينة المشتريات','1000');change('تسوية حساب المورد','890');click('مراجعة مستند المشتريات');expect(screen.getByRole('alert')).toHaveTextContent('سببًا واضحًا');change('سبب مستند المشتريات','تصحيح تكلفة التوريد');click('مراجعة مستند المشتريات');expect(screen.getByText(/تُحفظ الفاتورة الأصلية/)).toBeVisible();view.unmount();render(<PurchaseJourney reference="PUR-0284" close={vi.fn()} complete={vi.fn()}/>);change('سيناريو فاتورة المشتريات','فاتورة معكوسة');expect(screen.getByRole('button',{name:'معاينة مرتجع المشتريات'})).toBeDisabled();
});

it('preserves a modified purchase until explicit discard',()=>{
  const close=vi.fn();render(<PurchaseJourney close={close} complete={vi.fn()}/>);change('كمية مشتريات 2','2.5');click('إلغاء مستند المشتريات');expect(close).not.toHaveBeenCalled();click('استكمال المشتريات');expect(screen.getByLabelText('كمية مشتريات 2')).toHaveValue('2.5');fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));click('تجاهل المشتريات وإغلاق');expect(close).toHaveBeenCalledOnce();
});

it('opens real purchase detail and entry design journeys from the purchase page',()=>{
  const view=render(<Purchases announce={vi.fn()}/>);fireEvent.click(screen.getAllByRole('button',{name:'عرض التفاصيل'})[0]!);expect(screen.getByRole('dialog',{name:'تفاصيل فاتورة المشتريات'})).toBeVisible();click('إغلاق التفاصيل');click('فاتورة مشتريات');expect(screen.getByRole('dialog',{name:'إدخال فاتورة مشتريات'})).toBeVisible();view.unmount();
});

it('reviews renewal and changed prices before allowing a held-document continuation preview',()=>{
  const complete=vi.fn();render(<HeldDocumentJourney reference="QUO-0018" action="continue" close={vi.fn()} complete={complete}/>);
  change('حالة المعلّق التجريبية','منتهي الصلاحية');expect(screen.getByRole('button',{name:'مراجعة الاستكمال'})).toBeDisabled();
  click('معاينة تجديد العرض');change('صلاحية العرض الجديد','2026-10-01');click('مراجعة النسخة الجديدة');
  expect(screen.getAllByRole('alert').some(element=>element.textContent?.includes('اختار تاريخًا'))).toBe(true);
  change('صلاحية العرض الجديد','2026-11-05');click('مراجعة النسخة الجديدة');click('مراجعة الاستكمال');
  expect(screen.getByRole('alert')).toHaveTextContent('وافق على إعادة التسعير');
  fireEvent.click(screen.getByRole('checkbox'));click('مراجعة الاستكمال');expect(screen.getByText('مسودة بيع تحتاج مراجعة وسداد')).toBeVisible();
  click('تأكيد المعاينة');expect(complete).toHaveBeenCalledOnce();
});

it('prevents duplicate continuation and offers stock recovery without confirming a sale',()=>{
  render(<HeldDocumentJourney reference="HLD-0007" action="continue" close={vi.fn()} complete={vi.fn()}/>);
  change('حالة المعلّق التجريبية','تم التحويل سابقًا');expect(screen.getByRole('button',{name:'مراجعة الاستكمال'})).toBeDisabled();
  expect(screen.getByRole('link',{name:'فتح سجل الفواتير'})).toHaveAttribute('href','#sales');
  change('حالة المعلّق التجريبية','مخزون غير كافٍ');expect(screen.getByRole('link',{name:'مراجعة المخزون'})).toHaveAttribute('href','#inventory');
  change('حالة المعلّق التجريبية','ملغي');expect(screen.getByRole('button',{name:'مراجعة الاستكمال'})).toBeDisabled();
});

it('requires a cancellation reason and guards against cancelling an already converted document',()=>{
  render(<HeldDocumentJourney reference="QUO-0018" action="cancel" close={vi.fn()} complete={vi.fn()}/>);
  click('مراجعة الإلغاء');expect(screen.getByRole('alert')).toHaveTextContent('سبب إلغاء');
  change('سبب إلغاء المعلّق','بناءً على طلب العميل');click('مراجعة الإلغاء');click('رجوع للمراجعة');
  expect(screen.getByLabelText('سبب إلغاء المعلّق')).toHaveValue('بناءً على طلب العميل');
  change('حالة المعلّق التجريبية','تم التحويل سابقًا');expect(screen.getByRole('button',{name:'مراجعة الإلغاء'})).toBeDisabled();
});

it('opens the held-document review from the workspace instead of silently changing to POS',()=>{
  render(<PlannedWorkspaces screen="quotations" announce={vi.fn()}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'عرض التفاصيل'})[0]!);click('استكمال البيع');
  expect(screen.getByRole('dialog',{name:'استكمال عرض السعر / المعلّق'})).toBeVisible();
  expect(screen.getByText(/لا يتم إنشاء بيع أو نقل أصناف/)).toBeVisible();
});

it('uses exact preview allocation checks for invalid precision, payment ceilings and totals',()=>{
  expect(refundPreviewError({cash:'-1',card:'290',account:'0'})).toContain('منزلتين');
  expect(refundPreviewError({cash:'400.001',card:'290',account:'0'})).toContain('منزلتين');
  expect(refundPreviewError({cash:'400.01',card:'289.99',account:'0'})).toContain('يتجاوز');
  expect(refundPreviewError({cash:'399.99',card:'290',account:'0'})).toContain('مجموع');
  expect(refundPreviewError({cash:'399.99',card:'290',account:'0.01'})).toBe('');
});

it('reviews a split refund only when the illustrative allocation balances',()=>{
  render(<DocumentJourney kind="return" reference="INV-1048" close={vi.fn()} complete={vi.fn()}/>);
  change('كمية قميص أوكسفورد','1');change('سبب أو مرجع المستند','طلب الإرجاع');change('استرداد المستند','توزيع على أكثر من طريقة');
  change('استرداد نقدي','399.99');click('مراجعة المستند');expect(screen.getByRole('alert')).toHaveTextContent('مجموع');
  change('استرداد رصيد حساب العميل','0.01');click('مراجعة المستند');expect(screen.getByText('399.99 ج.م')).toBeVisible();
  click('رجوع للكميات');expect(screen.getByLabelText('استرداد رصيد حساب العميل')).toHaveValue(0.01);
});

it('validates report dates and exposes error, loading, permission, empty and drill-down states',()=>{
  render(<PlannedWorkspaces screen="reports" announce={vi.fn()}/>);
  change('بداية فترة التقرير','2026-11-01');click('عرض التقرير');expect(screen.getByRole('alert')).toHaveTextContent('تاريخ البداية');
  change('بداية فترة التقرير','2026-10-01');click('عرض التقرير');
  click('تفاصيل نتيجة 29 أكتوبر');expect(screen.getByRole('region',{name:'تفاصيل نتيجة التقرير'})).toBeVisible();
  click('إغلاق تفاصيل النتيجة');change('حالة نتيجة التقرير','تعذر التحميل');expect(screen.getByRole('button',{name:'تصدير التقرير'})).toBeDisabled();
  click('إعادة تحميل التقرير');expect(screen.getByRole('button',{name:'تصدير التقرير'})).toBeEnabled();
  change('حالة نتيجة التقرير','جارٍ التحميل');expect(screen.getByRole('status')).toHaveTextContent('تجهيز التقرير');
  change('حالة نتيجة التقرير','غير مسموح');expect(screen.getByRole('alert')).toHaveTextContent('صلاحية عرض');
  change('حالة نتيجة التقرير','لا توجد نتائج');expect(screen.getByRole('heading',{name:'لا توجد نتائج لهذه الفترة'})).toBeVisible();
  click('المخزون');expect(screen.getByText('متاح (قطعة)')).toBeVisible();
});

it('switches print documents and paper formats, validates copies and recovers from a simulated print error',()=>{
  const announce=vi.fn();render(<PrintWorkspace announce={announce}/>);
  change('نوع مستند الطباعة','مرتجع بيع');expect(within(screen.getByRole('article',{name:'معاينة ورقة المستند'})).getByText('RET-0034')).toBeVisible();
  click('إيصال حراري 80 مم');expect(screen.getByRole('button',{name:'إيصال حراري 80 مم'})).toHaveAttribute('aria-pressed','true');
  change('عدد نسخ الطباعة','0');click('مراجعة الطباعة');expect(screen.getByRole('alert')).toHaveTextContent('من 1 إلى 5');
  change('عدد نسخ الطباعة','2');click('مراجعة الطباعة');expect(screen.getByRole('dialog',{name:'مراجعة إعدادات الطباعة'})).toBeVisible();
  click('إنهاء معاينة الطباعة');expect(announce).toHaveBeenCalledOnce();
  change('حالة الطباعة التجريبية','تعذر تجهيز الطباعة');expect(screen.getByRole('button',{name:'مراجعة الطباعة'})).toBeDisabled();
  click('إعادة تجهيز المعاينة');expect(screen.getByRole('button',{name:'مراجعة الطباعة'})).toBeEnabled();
  for(const [kind,reference] of [['فاتورة مشتريات','PUR-0082'],['عرض سعر','QUO-0018'],['فاتورة بيع','INV-1048']]){change('نوع مستند الطباعة',kind!);expect(screen.getByText(reference!)).toBeVisible();}
});

it('reviews a held sale from POS while retaining the cart and links to the print design',()=>{
  const announce=vi.fn();render(<POS announce={announce}/>);
  click('تعليق الفاتورة');change('اسم مسودة البيع','طلب عميل للمراجعة');click('مراجعة تعليق المسودة');
  expect(screen.getByText('طلب عميل للمراجعة')).toBeVisible();click('رجوع لبيانات المسودة');
  expect(screen.getByLabelText('اسم مسودة البيع')).toHaveValue('طلب عميل للمراجعة');
  click('مراجعة تعليق المسودة');click('تأكيد معاينة التعليق');expect(announce).toHaveBeenCalledOnce();
  expect(screen.getByRole('button',{name:'معاينة الدفع'})).toBeEnabled();
  expect(screen.getByRole('link',{name:'فتح تصميم طباعة المستندات'})).toHaveAttribute('href','#printing');
});

it('starts the item-return design from a selected sales invoice',()=>{
  render(<Sales announce={vi.fn()}/>);click('عرض INV-1048');click('معاينة إنشاء مرتجع');
  expect(screen.getByRole('dialog',{name:'مرتجع من فاتورة'})).toBeVisible();
  expect(screen.getByLabelText('كمية قميص أوكسفورد')).toBeVisible();
});
import { OrderCancellation } from './OrderCancellation.js';
