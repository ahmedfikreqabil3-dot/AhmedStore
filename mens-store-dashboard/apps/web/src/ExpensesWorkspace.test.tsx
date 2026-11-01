import '@testing-library/jest-dom/vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { ExpensesWorkspace } from './ExpensesWorkspace.js';
import { CommandScope } from './pending-command.js';
import { ApiError,readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const expense={id,organizationId:id,category:'نقل',description:'توصيل البضاعة',amount:'12.3456',paymentMethod:'CASH',occurredAt:'2026-10-01T12:00:00Z'};
const history={expenses:[expense],total:1,totalAmount:'12.3456',limit:25,offset:0};
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});
const mount=()=>render(<CommandScope.Provider value="expense-test"><ExpensesWorkspace/></CommandScope.Provider>);
const storageKey='ahmed-store.pending.expense-test.expense';
beforeEach(()=>{sessionStorage.clear();vi.mocked(readJson).mockImplementation(async(path,init)=>init?.method==='POST'?{id:'posted-expense'}:history);});
afterEach(()=>{cleanup();vi.resetAllMocks();sessionStorage.clear();});
function prepare(){click('مصروف جديد');change('فئة المصروف','نقل');change('وصف المصروف','توصيل جديد');change('مبلغ المصروف','15.1234');change('طريقة دفع المصروف','CARD');change('تاريخ المصروف','2026-10-10T12:30');click('مراجعة المصروف');}

it('loads posted expenses, reviews a new exact payment and records one immutable command',async()=>{
  mount();expect(screen.getByRole('status')).toHaveTextContent('تحميل');await screen.findByText('توصيل البضاعة');
  click(`تفاصيل المصروف ${id}`);expect(screen.getByRole('region',{name:'تفاصيل مصروف مسجل'})).toHaveTextContent(id);click('إغلاق تفاصيل المصروف');
  prepare();expect(screen.getByText('مراجعة المصروف قبل الدفع')).toBeVisible();expect(screen.getByText('15.1234')).toBeVisible();
  click('رجوع لبيانات المصروف');expect(screen.getByLabelText('مبلغ المصروف')).toHaveValue('15.1234');click('مراجعة المصروف');click('تأكيد تسجيل المصروف والدفع');
  await screen.findByText('تم تسجيل المصروف posted-expense.');const call=vi.mocked(readJson).mock.calls.find(([,init])=>init?.method==='POST')!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({category:'نقل',description:'توصيل جديد',amount:'15.1234',paymentMethod:'CARD'});expect(call[1]!.headers).toMatchObject({'idempotency-key':expect.any(String)});expect(sessionStorage.getItem(storageKey)).toBeNull();
});

it('validates amount and description and makes discarding a modified draft explicit',async()=>{
  mount();await screen.findByText('توصيل البضاعة');click('مصروف جديد');click('إلغاء المصروف');expect(screen.queryByLabelText('مبلغ المصروف')).not.toBeInTheDocument();
  click('مصروف جديد');change('مبلغ المصروف','00');change('وصف المصروف','x');click('مراجعة المصروف');expect(screen.getByRole('alert')).toHaveTextContent('المبلغ موجب');
  click('إلغاء المصروف');click('استكمال المصروف');expect(screen.getByLabelText('مبلغ المصروف')).toHaveValue('00');click('إلغاء المصروف');click('تجاهل المصروف');expect(screen.queryByLabelText('مبلغ المصروف')).not.toBeInTheDocument();
});

it('filters dates and pages the server result without changing the whole-period total',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>({...history,total:26,offset:path.includes('offset=25')?25:0}));
  mount();await screen.findByText('توصيل البضاعة');change('بداية فترة المصروفات','');click('عرض المصروفات');expect(screen.getByRole('alert')).toHaveTextContent('فترة صحيحة');
  change('بداية فترة المصروفات','2026-10-31');change('نهاية فترة المصروفات','');click('عرض المصروفات');change('نهاية فترة المصروفات','2026-10-01');click('عرض المصروفات');expect(screen.getByRole('alert')).toBeVisible();
  change('بداية فترة المصروفات','2026-10-01');change('نهاية فترة المصروفات','2026-10-30');click('عرض المصروفات');await waitFor(()=>expect(screen.queryByRole('status')).not.toBeInTheDocument());
  click('مصروفات تالية');await waitFor(()=>expect(screen.getByRole('button',{name:'مصروفات تالية'})).toBeDisabled());expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'));click('مصروفات سابقة');await waitFor(()=>expect(screen.getByRole('button',{name:'مصروفات سابقة'})).toBeDisabled());
});

it.each([new ApiError(403),Error('offline'),{invalid:true}])('retains filters and recovers the expense history after an unavailable or invalid response',async failure=>{
  if('invalid' in failure)vi.mocked(readJson).mockResolvedValueOnce(failure);else vi.mocked(readJson).mockRejectedValueOnce(failure);
  mount();await screen.findByRole('alert');click('إعادة تحميل المصروفات');expect(await screen.findByText('توصيل البضاعة')).toBeVisible();
});

it('shows an actual empty period and ignores superseded or unmounted reads',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const view=mount();change('بداية فترة المصروفات','2026-10-01');change('نهاية فترة المصروفات','2026-10-30');
  vi.mocked(readJson).mockResolvedValueOnce({...history,expenses:[],total:0,totalAmount:'0.0000'});click('عرض المصروفات');await screen.findByText(/لا توجد مصروفات/);
  await act(async()=>{resolve(history);});expect(screen.queryByText('توصيل البضاعة')).not.toBeInTheDocument();
  let reject!:(error:Error)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));click('عرض المصروفات');view.unmount();await act(async()=>{reject(Error('late'));});
});

it('keeps an uncertain expense frozen across retry and refresh and reuses its exact idempotency key',async()=>{
  vi.mocked(readJson).mockImplementation(async(_path,init)=>{if(init?.method==='POST')throw Error('Lost response');return history;});
  const view=mount();await screen.findByText('توصيل البضاعة');prepare();click('تأكيد تسجيل المصروف والدفع');await screen.findByRole('alert');
  const saved=JSON.parse(sessionStorage.getItem(storageKey)!);expect(screen.getByRole('button',{name:'مصروف جديد'})).toBeDisabled();view.unmount();
  vi.mocked(readJson).mockImplementation(async(_path,init)=>init?.method==='POST'?{id:'recovered'}:history);mount();await screen.findByText('توصيل البضاعة');expect(screen.getByText('15.1234')).toBeVisible();click('إعادة نفس الطلب المحفوظ');await screen.findByText('تم تسجيل المصروف recovered.');
  const posts=vi.mocked(readJson).mock.calls.filter(([,init])=>init?.method==='POST');expect(posts).toHaveLength(2);expect(posts[1]![1]!.headers).toMatchObject({'idempotency-key':saved.key});expect(JSON.parse(posts[1]![1]!.body as string)).toEqual(saved.input);
});

it('reports a definite rejection and prevents double submit while one command is in flight',async()=>{
  let reject!:(reason:Error)=>void;vi.mocked(readJson).mockImplementation(async(_path,init)=>{if(init?.method==='POST')return new Promise((_done,fail)=>{reject=fail;});return history;});
  mount();await screen.findByText('توصيل البضاعة');prepare();const button=screen.getByRole('button',{name:'تأكيد تسجيل المصروف والدفع'});fireEvent.click(button);fireEvent.click(button);expect(vi.mocked(readJson).mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  await act(async()=>{reject(new ApiError(409));});expect(screen.getByRole('alert')).toHaveTextContent('رفض تسجيل المصروف');expect(sessionStorage.getItem(storageKey)).toBeNull();
});

it('blocks creating a replacement expense when saved recovery data cannot be read',async()=>{
  sessionStorage.setItem(storageKey,'broken');mount();await screen.findByText('توصيل البضاعة');expect(screen.getByRole('alert')).toHaveTextContent('تعذر قراءة الطلب');expect(screen.getByRole('button',{name:'مصروف جديد'})).toBeDisabled();
});
