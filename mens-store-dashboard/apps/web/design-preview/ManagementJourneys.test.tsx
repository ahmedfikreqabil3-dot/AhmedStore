import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlannedWorkspaces } from './PlannedWorkspaces.js';
import { LifecycleJourney } from './LifecycleJourney.js';
import { AccountStatement } from './AccountStatement.js';
import { DocumentJourney } from './DocumentJourney.js';
import { OperationJourneys } from './OperationJourneys.js';

beforeEach(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Design preview must not call an API');}));
});
afterEach(()=>{expect(fetch).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();});
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});

it('blocks archiving an account with outstanding obligations without offering confirmation',()=>{
  render(<PlannedWorkspaces screen="customers" announce={vi.fn()}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'عرض التفاصيل'})[0]!);
  click('أرشفة / إيقاف');
  expect(screen.getByRole('alert')).toHaveTextContent('يوجد رصيد أو التزامات مفتوحة');
  expect(screen.queryByRole('button',{name:'تأكيد المعاينة'})).not.toBeInTheDocument();
  click('رجوع للسجل');
  expect(screen.getByRole('heading',{name:'سجل العميل'})).toBeVisible();
});

it('previews archive, archived filtering and restore without changing actual records',()=>{
  const announce=vi.fn();
  render(<PlannedWorkspaces screen="customers" announce={announce}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'عرض التفاصيل'})[1]!);
  click('أرشفة / إيقاف'); change('سبب الإجراء','توقف التعامل مؤقتًا');
  click('متابعة للمراجعة'); click('رجوع للتعديل');
  expect(screen.getByLabelText('سبب الإجراء')).toHaveValue('توقف التعامل مؤقتًا');
  click('متابعة للمراجعة');click('تأكيد المعاينة');
  change('حالة السجل','المؤرشف');
  expect(screen.getByText('محمد حسن')).toBeVisible();
  expect(screen.queryByText('أحمد محمود')).not.toBeInTheDocument();
  click('عرض التفاصيل');click('إعادة تفعيل');change('سبب الإجراء','استئناف التعامل');
  click('متابعة للمراجعة');click('تأكيد المعاينة');
  expect(screen.getByRole('heading',{name:'لا توجد سجلات مؤرشفة'})).toBeVisible();
  click('عرض كل السجلات');
  expect(screen.getByText('محمد حسن')).toBeVisible();expect(announce).toHaveBeenCalledTimes(2);
});

it('requires a replacement category and displays it for review',()=>{
  const complete=vi.fn();
  render(<LifecycleJourney screen="categories" entity="قمصان" action="archive" blocked close={vi.fn()} complete={complete}/>);
  change('الفئة البديلة','بناطيل');change('سبب الإجراء','دمج التصنيفات');click('متابعة للمراجعة');
  expect(screen.getByText('إعادة ربط المنتجات بالفئة')).toBeVisible();
  expect(screen.getByText('بناطيل')).toBeVisible();click('تأكيد المعاينة');expect(complete).toHaveBeenCalledWith('مؤرشف');
});

it('requires a branch for proposed access and preserves the selection on review-back',()=>{
  render(<LifecycleJourney screen="users" entity="محمد علي" action="access" blocked={false} close={vi.fn()} complete={vi.fn()}/>);
  change('سبب الإجراء','مراجعة نطاق العمل');fireEvent.click(screen.getByRole('checkbox',{name:'الفرع الرئيسي'}));click('متابعة للمراجعة');
  expect(screen.getByRole('alert')).toHaveTextContent('اختار فرعًا واحدًا على الأقل');
  fireEvent.click(screen.getByRole('checkbox',{name:'فرع مدينة نصر'}));change('الدور المقترح','مسؤول المخزن');click('متابعة للمراجعة');
  expect(screen.getByText('مسؤول المخزن')).toBeVisible();click('رجوع للتعديل');
  expect(screen.getByRole('checkbox',{name:'فرع مدينة نصر'})).toBeChecked();
});

it('blocks disabling the current user and keeps reset requests free of credential fields',()=>{
  const view=render(<LifecycleJourney screen="users" entity="أحمد محمود" action="archive" blocked close={vi.fn()} complete={vi.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('حساب المستخدم الحالي');
  view.unmount();render(<LifecycleJourney screen="users" entity="محمد علي" action="reset" blocked={false} close={vi.fn()} complete={vi.fn()}/>);
  expect(document.querySelector('input[type=password]')).toBeNull();
  change('سبب الإجراء','طلب صاحب الحساب');click('متابعة للمراجعة');
  expect(screen.getByText(/لا تنشئ كلمة مرور ولا ترسل رابطًا/)).toBeVisible();
});

it('preserves typed fields across review and requires an explicit discard decision on cancel and Escape',()=>{
  render(<PlannedWorkspaces screen="customers" announce={vi.fn()}/>);
  click('إضافة عميل');change('اسم العميل','عميل معاينة');change('رقم الهاتف','01000000000');
  click('متابعة للمراجعة');click('رجوع للتعديل');expect(screen.getByLabelText('اسم العميل')).toHaveValue('عميل معاينة');
  click('إلغاء');expect(screen.getByRole('alert')).toHaveTextContent('تجاهل التعديلات؟');click('استكمال التعديل');
  const dialog=screen.getByRole('dialog');fireEvent(dialog,new Event('cancel',{cancelable:true}));
  expect(dialog).toHaveAttribute('open');expect(screen.getByRole('alert')).toBeVisible();
  click('تجاهل وإغلاق');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('validates statement dates and opens a document or a period without movements',()=>{
  render(<AccountStatement screen="customers" entity="عميل معاينة" announce={vi.fn()}/>);
  change('كشف الحساب من تاريخ','2026-11-01');click('تطبيق الفترة');expect(screen.getByRole('alert')).toHaveTextContent('قبل نهايتها');
  change('كشف الحساب من تاريخ','2026-10-01');click('تطبيق الفترة');expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  click('تفاصيل مستند INV-1048');expect(screen.getByRole('region',{name:'تفاصيل مستند كشف الحساب'})).toBeVisible();
  click('إغلاق تفاصيل المستند');fireEvent.click(screen.getByRole('checkbox',{name:'معاينة فترة بدون حركات'}));
  expect(screen.getByRole('heading',{name:'لا توجد حركات خلال الفترة'})).toBeVisible();
});

it('blocks empty and excessive receipts, and preserves partial quantities across review-back',()=>{
  const complete=vi.fn();render(<DocumentJourney kind="receipt" reference="PO-0024" close={vi.fn()} complete={complete}/>);
  change('سبب أو مرجع المستند','GRN-001');click('مراجعة المستند');expect(screen.getByRole('alert')).toHaveTextContent('صنفًا واحدًا');
  change('كمية قميص أوكسفورد','13');click('مراجعة المستند');expect(screen.getByRole('alert')).toHaveTextContent('من غير تجاوز');
  change('كمية قميص أوكسفورد','6');click('مراجعة المستند');expect(screen.getByText('6 قطعة')).toBeVisible();
  click('رجوع للكميات');expect(screen.getByLabelText('كمية قميص أوكسفورد')).toHaveValue(6);
  click('مراجعة المستند');click('تأكيد المعاينة');expect(complete).toHaveBeenCalledOnce();
});

it('respects returnable quantities and reviews the original return in a replacement journey',()=>{
  render(<DocumentJourney kind="return-revision" reference="INV-1048" close={vi.fn()} complete={vi.fn()}/>);
  change('سبب أو مرجع المستند','تصحيح الصنف المرتجع');change('كمية تيشيرت بولو','2');click('مراجعة المستند');
  expect(screen.getByRole('alert')).toHaveTextContent('المتاح للإرجاع');
  change('كمية تيشيرت بولو','1');change('استرداد المستند','تسوية حساب العميل');click('مراجعة المستند');
  expect(screen.getByText('RET-0034')).toBeVisible();expect(screen.getByText('تسوية حساب العميل')).toBeVisible();
  expect(screen.getByText(/لا يتم تعديل أو حذف المستند السابق/)).toBeVisible();
});

it('requires an explicit discard decision in a modified document journey',()=>{
  const close=vi.fn();render(<DocumentJourney kind="return" reference="INV-1048" close={close} complete={vi.fn()}/>);
  change('كمية قميص أوكسفورد','1');click('إلغاء');expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('تجاهل تعديلات المستند');click('استكمال المستند');
  expect(screen.getByLabelText('كمية قميص أوكسفورد')).toHaveValue(1);click('إلغاء');click('تجاهل وإغلاق');expect(close).toHaveBeenCalledOnce();
});

it('opens partial receipt and original-invoice return journeys from their workspaces',()=>{
  const view=render(<PlannedWorkspaces screen="purchase-orders" announce={vi.fn()}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'عرض التفاصيل'})[0]!);click('استلام كميات');
  expect(screen.getByRole('dialog',{name:'استلام أمر شراء'})).toBeVisible();view.unmount();
  render(<PlannedWorkspaces screen="invoice-returns" announce={vi.fn()}/>);click('إنشاء مرتجع من فاتورة');
  expect(screen.getByRole('dialog',{name:'مرتجع من فاتورة'})).toBeVisible();
});

it('reviews count discrepancies and prevents invalid or excessive stock transfer quantities',()=>{
  render(<OperationJourneys kind="stock" close={vi.fn()} complete={vi.fn()}/>);
  change('بيان العملية','مراجعة الجرد');change('مصدر العملية','الرئيسي');change('مستلم العملية','الرئيسي');change('قيمة العملية','1');click('مراجعة العملية');
  expect(screen.getByRole('alert')).toHaveTextContent('مختلفين');change('مستلم العملية','مدينة نصر');change('قيمة العملية','25');click('مراجعة العملية');expect(screen.getByRole('alert')).toHaveTextContent('تتجاوز');
  change('نوع حركة المخزون','جرد فعلي');change('جرد قميص أوكسفورد','23.5000');click('مراجعة العملية');expect(screen.getByText('-0.5000')).toBeVisible();
});

it('requires two different treasury accounts before review',()=>{
  render(<OperationJourneys kind="transfer" close={vi.fn()} complete={vi.fn()}/>);
  change('بيان العملية','تغذية الحساب');change('مصدر العملية','الخزينة الرئيسية');change('مستلم العملية','الخزينة الرئيسية');change('قيمة العملية','100');click('مراجعة العملية');expect(screen.getByRole('alert')).toHaveTextContent('حسابين مختلفين');
  change('مستلم العملية','حساب البنك');click('مراجعة العملية');expect(screen.getByText(/حركة خروج ودخول مترابطة/)).toBeVisible();
});

it('checks settlement allocations against each document and the collection total',()=>{
  render(<OperationJourneys kind="settlement" close={vi.fn()} complete={vi.fn()}/>);
  change('بيان العملية','تحصيل الحساب');change('قيمة العملية','500');change('توزيع التسوية 1','800');click('مراجعة العملية');expect(screen.getByRole('alert')).toHaveTextContent('لا تتجاوز');
  change('توزيع التسوية 1','400');click('مراجعة العملية');expect(screen.getByRole('alert')).toHaveTextContent('مجموع التوزيع');
  change('توزيع التسوية 2','100');click('مراجعة العملية');expect(screen.getByText('400 ج.م')).toBeVisible();
});
