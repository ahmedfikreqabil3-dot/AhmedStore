import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TreasuryWorkspace} from './TreasuryWorkspace.js';
import {CommandScope} from './pending-command.js';
import {ApiError,readJson} from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const a='25a0aad8-edb0-4091-ad94-4d5a6d5a6d50',b='25a0aad8-edb0-4091-ad94-4d5a6d5a6d51',person='25a0aad8-edb0-4091-ad94-4d5a6d5a6d52',invoice='25a0aad8-edb0-4091-ad94-4d5a6d5a6d53';
const accounts=[{id:a,name:'خزينة المحل',paymentMethod:'CASH',isDefault:true,active:true,version:1,balance:'100.1234'},{id:b,name:'حساب البطاقة',paymentMethod:'CARD',isDefault:false,active:true,version:1,balance:'0.0000'}];
const posted={id:invoice,amount:'20.1234',occurredAt:'2026-11-01',replayed:false};
const ledger={account:accounts[0],from:'2026-11-01',to:'2026-11-02',opening:'50.0000',receipts:'60.1234',payments:'10.0000',closing:'100.1234',total:26,limit:25,offset:0,rows:[{id:invoice,occurredAt:'2026-11-01',type:'ACCOUNT_TRANSFER_OUT',sourceType:'TreasuryTransfer',sourceId:invoice,amount:'-10.0000',balance:'100.1234'}]};
const posts=()=>vi.mocked(readJson).mock.calls.filter(([,init])=>init?.method==='POST');
const respond=async(path:string,init?:RequestInit)=>init?.method==='POST'?posted:path==='/treasury/accounts'?{accounts}:path.includes('/parties?')?{parties:[{id:person,name:'طرف المراجعة',balance:'80.1234'}]}:path.includes('/invoices?')?{invoices:[{id:invoice,occurredAt:'2026-11-01',balance:'50.1234'}]}:ledger;
beforeEach(()=>{sessionStorage.clear();vi.mocked(readJson).mockReset();vi.mocked(readJson).mockImplementation(respond);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const mount=()=>render(<CommandScope.Provider value="treasury-ui"><TreasuryWorkspace/></CommandScope.Provider>);
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name,{exact:true}),{target:{value}});
async function ready(){const view=mount();await screen.findByRole('button',{name:'كشف حركة خزينة المحل'});return view;}
const prepare=()=>fireEvent.submit(screen.getByRole('form',{name:'بيانات عملية الخزينة'}));
async function transfer(){await ready();change('نوع عملية الخزينة','transfer');change('خزينة التحويل المصدر',a);change('خزينة التحويل الوجهة',b);change('مبلغ تحويل الخزائن','20.1234');change('بيان عملية الخزينة','تحويل إيراد اليوم');prepare();}

it('reviews an account opening, retains fields on back and posts one original-key command',async()=>{
  await ready();change('اسم الخزينة','خزينة الفرع');change('رصيد افتتاح الخزينة','20.1234');change('طريقة سداد الخزينة','WALLET');change('بيان عملية الخزينة','أموال افتتاح فعلية');prepare();
  expect(screen.getByRole('heading',{name:'مراجعة العملية قبل التسجيل'})).toBeVisible();expect(posts()).toHaveLength(0);click('رجوع للبيانات');expect(screen.getByLabelText('اسم الخزينة')).toHaveValue('خزينة الفرع');expect(screen.getByLabelText('رصيد افتتاح الخزينة')).toHaveValue('20.1234');prepare();
  await act(async()=>{const button=screen.getByRole('button',{name:'تأكيد تسجيل العملية'});button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  expect(posts()).toHaveLength(1);expect(JSON.parse(posts()[0]![1]!.body as string)).toEqual({name:'خزينة الفرع',paymentMethod:'WALLET',openingBalance:'20.1234',reason:'أموال افتتاح فعلية'});expect(posts()[0]![1]!.headers).toHaveProperty('idempotency-key');await screen.findByText(/تم تسجيل المستند/);
});
it('validates a transfer and retains its source, destination, amount and reason on back',async()=>{
  await ready();change('نوع عملية الخزينة','transfer');prepare();expect(screen.getByRole('alert')).toHaveTextContent('راجع الخزائن');change('خزينة التحويل المصدر',a);change('خزينة التحويل الوجهة',a);change('مبلغ تحويل الخزائن','1');change('بيان عملية الخزينة','تحويل نقد');prepare();expect(posts()).toHaveLength(0);
  change('خزينة التحويل الوجهة',b);prepare();click('رجوع للبيانات');expect(screen.getByLabelText('خزينة التحويل المصدر')).toHaveValue(a);expect(screen.getByLabelText('خزينة التحويل الوجهة')).toHaveValue(b);expect(screen.getByLabelText('مبلغ تحويل الخزائن')).toHaveValue('1');prepare();click('تأكيد تسجيل العملية');await screen.findByText(/تم تسجيل المستند/);expect(posts()[0]![0]).toBe('/treasury/transfers');
});
it('collects a customer balance with optional invoice allocation after review',async()=>{
  await ready();change('نوع عملية الخزينة','settlement');await screen.findByRole('option',{name:/طرف المراجعة/});change('طرف التسوية',person);await screen.findByLabelText('تخصيص '+invoice);change('خزينة التسوية',a);change('مبلغ التسوية','20.1234');change('تخصيص '+invoice,'10.0001');change('بيان عملية الخزينة','تحصيل مستحق العميل');prepare();expect(screen.getByText('تحصيل من العميل')).toBeVisible();click('تأكيد تسجيل العملية');await screen.findByText(/تم تسجيل المستند/);
  expect(JSON.parse(posts()[0]![1]!.body as string)).toMatchObject({kind:'customers',partyId:person,accountId:a,amount:'20.1234',allocations:[{documentId:invoice,amount:'10.0001'}]});
});
it('searches suppliers and records an unallocated payment on their account',async()=>{
  await ready();change('نوع عملية الخزينة','settlement');change('نوع طرف التسوية','suppliers');change('بحث طرف التسوية','طرف');click('بحث الأطراف');await screen.findByRole('option',{name:/طرف المراجعة/});change('طرف التسوية',person);await screen.findByLabelText('تخصيص '+invoice);change('خزينة التسوية',b);change('مبلغ التسوية','1');change('بيان عملية الخزينة','دفعة للمورد');prepare();expect(screen.getByText('تسوية على الحساب دون تخصيص لفاتورة')).toBeVisible();click('تأكيد تسجيل العملية');await screen.findByText(/تم تسجيل المستند/);expect(JSON.parse(posts()[0]![1]!.body as string)).toHaveProperty('kind','suppliers');
});
it('recovers the exact transfer and key after uncertain failure and remount',async()=>{
  await transfer();vi.mocked(readJson).mockImplementation(async(path,init)=>{if(init?.method==='POST')throw Error('Timeout');return respond(path,init);});click('تأكيد تسجيل العملية');await screen.findByText(/تعذر تأكيد التسجيل/);const original=posts()[0]!;cleanup();
  await ready();expect(screen.getByRole('complementary',{name:'استعادة طلب لم تتأكد نتيجته'})).toBeVisible();vi.mocked(readJson).mockImplementation(respond);click('إعادة نفس الطلب المحفوظ');await screen.findByText(/تم تسجيل المستند/);expect(posts()[1]![1]).toEqual(original[1]);expect(sessionStorage.length).toBe(0);
});
it('shows definitive financial rejection while preserving editable reviewed data',async()=>{
  await transfer();vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,'INSUFFICIENT_FUNDS'));click('تأكيد تسجيل العملية');await screen.findByText('رصيد الخزينة لا يكفي. راجع الرصيد الحالي.');click('رجوع للبيانات');expect(screen.getByLabelText('مبلغ تحويل الخزائن')).toHaveValue('20.1234');expect(sessionStorage.length).toBe(0);
});
it('loads scoped ledger totals and applies period and pagination without replacing full-period totals',async()=>{
  await ready();click('كشف حركة خزينة المحل');await screen.findByText('رصيد أول الفترة');expect(screen.getByText('-10.0000')).toBeVisible();click('حركات تالية');await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'),expect.any(Object)));
  vi.mocked(readJson).mockImplementation(async(path,init)=>path.includes('/ledger?')?{...ledger,offset:25}:respond(path,init));click('تحديث الأرصدة');await screen.findByRole('button',{name:'حركات سابقة'});await waitFor(()=>expect(screen.getByRole('button',{name:'حركات سابقة'})).toBeEnabled());click('حركات سابقة');
  change('بداية كشف الخزينة','2027-01-01');fireEvent.submit(screen.getByRole('form',{name:'فترة كشف الخزينة'}));expect(screen.getByRole('alert')).toHaveTextContent('اختر فترة صحيحة');change('بداية كشف الخزينة','2026-01-01');change('نهاية كشف الخزينة','2026-12-31');fireEvent.submit(screen.getByRole('form',{name:'فترة كشف الخزينة'}));await screen.findByText('رصيد أول الفترة');
});
it('blocks unreadable saved commands and allows retrying a failed accounts read',async()=>{
  sessionStorage.setItem('ahmed-store.pending.treasury-ui.treasury-command','broken');vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));mount();await screen.findByText(/تعذر تحميل الخزائن/);expect(screen.getByText(/تعذر قراءة الطلب المحفوظ/)).toBeVisible();click('تحديث الأرصدة');await screen.findByRole('button',{name:'كشف حركة خزينة المحل'});
});

it('renders empty and archived directories and safe fallback ledger movement descriptions',async()=>{
  vi.mocked(readJson).mockResolvedValueOnce({accounts:[]});const view=mount();await screen.findByText('لا توجد خزائن. أضف خزينة للبدء.');view.unmount();
  vi.mocked(readJson).mockImplementation(async(path,init)=>path==='/treasury/accounts'?{accounts:[{...accounts[0],active:false}]}:path.includes('/ledger?')?{...ledger,total:0,rows:[]}:respond(path,init));await ready();expect(screen.getByText(/مؤرشفة/,{selector:'td'})).toBeVisible();click('كشف حركة خزينة المحل');await screen.findByText('لا توجد حركات في هذه الصفحة.');
  vi.mocked(readJson).mockImplementation(async(path,init)=>path.includes('/ledger?')?{...ledger,rows:[{...ledger.rows[0],type:'HISTORICAL_MOVEMENT'}]}:respond(path,init));click('تحديث الأرصدة');await screen.findByText('HISTORICAL_MOVEMENT');
});

it('blocks review while invoice allocation options load and surfaces failed option reads',async()=>{
  await ready();change('نوع عملية الخزينة','settlement');await screen.findByRole('option',{name:/طرف المراجعة/});
  let reject!:(error:Error)=>void;vi.mocked(readJson).mockImplementation(async(path,init)=>path.includes('/invoices?')?new Promise((_resolve,fail)=>{reject=fail;}):respond(path,init));change('طرف التسوية',person);await screen.findByText('جارٍ تحميل الفواتير المستحقة…');expect(screen.getByRole('button',{name:'مراجعة العملية'})).toBeDisabled();
  await act(async()=>reject(Error('offline')));await screen.findByText('تعذر تحميل الفواتير. حدّث البيانات قبل التخصيص.');expect(screen.getByRole('button',{name:'مراجعة العملية'})).toBeDisabled();
  vi.mocked(readJson).mockImplementation(async(path,init)=>path.includes('/parties?')?Promise.reject(Error('offline')):respond(path,init));click('بحث الأطراف');await screen.findByText('تعذر تحميل الأطراف. أعد البحث أو حدّث البيانات.');
});

it('recovers a settlement using stable identifiers when party display names are not loaded',async()=>{
  sessionStorage.setItem('ahmed-store.pending.treasury-ui.treasury-command',JSON.stringify({version:1,key:'saved-settlement',input:{operation:'settlement',input:{kind:'suppliers',partyId:person,accountId:a,amount:'1',reason:'دفعة محفوظة',allocations:[]}}}));
  await ready();expect(screen.getByText(person)).toBeVisible();click('إعادة نفس الطلب المحفوظ');await screen.findByText(/تم تسجيل المستند/);expect(posts()[0]![1]!.headers).toHaveProperty('idempotency-key','saved-settlement');
});

it('shows a generic definitive rejection and ledger read recovery without exposing server details',async()=>{
  await transfer();vi.mocked(readJson).mockRejectedValueOnce(new ApiError(400,'UNKNOWN_REJECTION'));click('تأكيد تسجيل العملية');await screen.findByText('رفض الخادم العملية. راجع البيانات الحالية.');click('رجوع للبيانات');
  vi.mocked(readJson).mockImplementation(async(path,init)=>path.includes('/ledger?')?Promise.reject(Error('private failure')):respond(path,init));click('كشف حركة خزينة المحل');await screen.findByText('تعذر تحميل كشف الخزينة. أعد المحاولة.');
  vi.mocked(readJson).mockImplementation(respond);click('تحديث الأرصدة');await screen.findByText('رصيد أول الفترة');
});
