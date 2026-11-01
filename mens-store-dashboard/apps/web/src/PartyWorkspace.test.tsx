import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PartyEditor, PartyWorkspace } from './PartyWorkspace.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const supplier={id,organizationId:id,name:'شركة الملابس',phone:null,email:null,address:null,notes:null,active:true,version:1};
const customer={...supplier,legacyId:null,name:'أحمد محمود',creditLimit:'10.1234'};
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});

it('pages the archived directory, reactivates a supplier and refreshes without losing the selected view',async()=>{
  const archived={...supplier,active:false};vi.mocked(readJson).mockImplementation(async(path,init)=>{
    if(init?.method==='PATCH')return {id,active:true,version:2};
    if(path.startsWith('/suppliers/directory'))return {kind:'suppliers',parties:[archived],total:26,limit:25,offset:path.includes('offset=25')?25:0};
    return {suppliers:[supplier]};
  });
  render(<PartyWorkspace kind="suppliers"/>);await screen.findByText('شركة الملابس');change('حالة الأطراف','archived');await screen.findByRole('button',{name:'إعادة تفعيل شركة الملابس'});click('أطراف تالية');await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith('/suppliers/directory?status=archived&limit=25&offset=25'));click('أطراف سابقة');await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith('/suppliers/directory?status=archived&limit=25&offset=0'));
  click('إعادة تفعيل شركة الملابس');change('سبب إجراء الطرف','استئناف التعامل');click('مراجعة إجراء الطرف');click('تأكيد إعادة تفعيل الطرف');await screen.findByText('تم تحديث حالة السجل.');expect(screen.getByLabelText('حالة الأطراف')).toHaveValue('archived');expect(screen.getByRole('region',{name:'إدارة الأطراف'})).toHaveFocus();
  change('حالة الأطراف','all');await screen.findByRole('button',{name:'إعادة تفعيل شركة الملابس'});click('إعادة تفعيل شركة الملابس');click('إلغاء إجراء الطرف');await screen.findByRole('button',{name:'إعادة تفعيل شركة الملابس'});
});

it('rejects malformed or mismatched directory responses and ignores superseded directory results',async()=>{
  render(<PartyWorkspace kind="customers"/>);await screen.findByText('أحمد محمود');vi.mocked(readJson).mockResolvedValueOnce({kind:'suppliers',parties:[],total:0,limit:25,offset:0});change('حالة الأطراف','archived');expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل');
  vi.mocked(readJson).mockResolvedValueOnce({invalid:true});click('تحديث القائمة');expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل');
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));click('تحديث القائمة');vi.mocked(readJson).mockResolvedValueOnce({customers:[customer]});change('حالة الأطراف','active');await screen.findByText('أحمد محمود');await act(async()=>{resolve({kind:'customers',parties:[{...customer,name:'استجابة قديمة'}],total:1,limit:25,offset:0});});expect(screen.queryByText('استجابة قديمة')).not.toBeInTheDocument();
});

it('opens a real account statement, labels zero as unlimited and restores keyboard focus after closing',async()=>{
  const statement={kind:'customers',party:{id,name:customer.name,active:true},from:'2026-10-01',to:'2026-10-30',opening:'0.0000',debits:'0.0000',credits:'0.0000',closing:'0.0000',total:0,limit:25,offset:0,rows:[]};
  vi.mocked(readJson).mockImplementation(async path=>path==='/customers'?{customers:[{...customer,creditLimit:'0.0000'}]}:statement);
  render(<PartyWorkspace kind="customers"/>);await screen.findByText('أحمد محمود');expect(screen.getByText('بدون سقف')).toBeVisible();
  click('كشف حساب أحمد محمود');await screen.findByText(/لا توجد حركات في هذه الصفحة/);click('إغلاق كشف الحساب');expect(screen.getByRole('button',{name:'كشف حساب أحمد محمود'})).toHaveFocus();
  click('كشف حساب أحمد محمود');await screen.findByText(/لا توجد حركات في هذه الصفحة/);change('بحث الأطراف','غير موجود');click('إغلاق كشف الحساب');expect(screen.getByRole('region',{name:'إدارة الأطراف'})).toHaveFocus();
});
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};vi.mocked(readJson).mockImplementation(async path=>path==='/customers' ? {customers:[customer]} : path==='/suppliers' ? {suppliers:[supplier]} : customer);});
afterEach(()=>{cleanup();vi.resetAllMocks();});

it('lists real customer data, searches contacts and saves a reviewed versioned profile',async()=>{
  render(<PartyWorkspace kind="customers"/>);expect(screen.getByRole('status')).toHaveTextContent('تحميل');await screen.findByText('أحمد محمود');
  change('بحث الأطراف','غير موجود');expect(screen.getByText(/لا توجد بيانات مطابقة/)).toBeVisible();change('بحث الأطراف','أحمد');
  click('تعديل أحمد محمود');change('اسم الطرف','أحمد الجديد');change('هاتف الطرف','01000000000');change('بريد الطرف','ahmed@example.test');change('عنوان الطرف','القاهرة');change('ملاحظات الطرف','مراجعة التواصل');change('حد ائتمان العميل','20.1234');click('مراجعة البيانات');
  expect(screen.getByText('مراجعة البيانات قبل الحفظ')).toBeVisible();click('رجوع للبيانات');expect(screen.getByLabelText('اسم الطرف')).toHaveValue('أحمد الجديد');click('مراجعة البيانات');click('حفظ العميل');await screen.findByText('تم حفظ البيانات بنجاح.');
  expect(readJson).toHaveBeenCalledWith(`/customers/${id}`,expect.objectContaining({method:'PATCH',body:JSON.stringify({name:'أحمد الجديد',phone:'01000000000',email:'ahmed@example.test',address:'القاهرة',notes:'مراجعة التواصل',creditLimit:'20.1234',version:1})}));
});

it('creates suppliers and customers from reviewed data and hides credit controls from read-only roles',async()=>{
  const view=render(<PartyWorkspace kind="suppliers"/>);await screen.findByText('شركة الملابس');click('إضافة المورد');change('اسم الطرف','مورد جديد');click('مراجعة البيانات');click('حفظ المورد');await screen.findByText('تم حفظ البيانات بنجاح.');expect(readJson).toHaveBeenCalledWith('/suppliers',expect.objectContaining({method:'POST'}));view.unmount();
  render(<PartyWorkspace kind="customers" canEdit={false}/>);await screen.findByText('أحمد محمود');expect(screen.queryByRole('button',{name:'تعديل أحمد محمود'})).not.toBeInTheDocument();click('إضافة العميل');expect(screen.queryByLabelText('حد ائتمان العميل')).not.toBeInTheDocument();change('اسم الطرف','عميل جديد');click('مراجعة البيانات');click('حفظ العميل');await screen.findByText('تم حفظ البيانات بنجاح.');expect(readJson).toHaveBeenCalledWith('/customers',expect.objectContaining({body:JSON.stringify({name:'عميل جديد',phone:null,email:null,address:null,notes:null,creditLimit:'0'})}));
});

it('validates fields and requires explicit discard on cancel or Escape after edits',()=>{
  const close=vi.fn();render(<PartyEditor kind="customers" record={null} close={close} saved={vi.fn()}/>);click('مراجعة البيانات');expect(screen.getByRole('alert')).toHaveTextContent('راجع الاسم');
  change('اسم الطرف','أحمد');click('إلغاء');expect(close).not.toHaveBeenCalled();click('استكمال التعديل');
  fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(screen.getByText(/هل تريد تجاهل التعديلات/)).toBeVisible();click('تجاهل وإغلاق');expect(close).toHaveBeenCalledOnce();
});

it('closes an unchanged editor and initializes non-null supplier contact fields',()=>{
  const close=vi.fn();const view=render(<PartyEditor kind="suppliers" record={{...supplier,phone:'01012345678',email:'supplier@example.test',address:'المنصورة',notes:'توريد'}} close={close} saved={vi.fn()}/>);
  expect(screen.getByLabelText('هاتف الطرف')).toHaveValue('01012345678');click('إغلاق بيانات الطرف');expect(close).toHaveBeenCalledOnce();view.unmount();
  render(<PartyEditor kind="suppliers" record={supplier} close={close} saved={vi.fn()}/>);click('مراجعة البيانات');expect(screen.getAllByText('—').length).toBeGreaterThan(0);
});

it('reports conflicts and network failures without silently overwriting the server version',async()=>{
  const saved=vi.fn();render(<PartyEditor kind="customers" record={customer} close={vi.fn()} saved={saved}/>);click('مراجعة البيانات');vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409));click('حفظ العميل');expect(await screen.findByRole('alert')).toHaveTextContent('آخر نسخة');
  vi.mocked(readJson).mockRejectedValueOnce(Error('lost response'));click('حفظ العميل');await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('تعذر تأكيد الحفظ'));expect(saved).not.toHaveBeenCalled();
});

it('prevents duplicate saves and ignores close requests while a save is in flight',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValue(new Promise(done=>{resolve=done;}));const saved=vi.fn(),close=vi.fn();render(<PartyEditor kind="suppliers" record={supplier} close={close} saved={saved}/>);click('مراجعة البيانات');const button=screen.getByRole('button',{name:'حفظ المورد'});act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(readJson).toHaveBeenCalledOnce();fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(close).not.toHaveBeenCalled();await act(async()=>resolve(supplier));expect(saved).toHaveBeenCalledOnce();
});

it('recovers loading errors, distinguishes permissions and handles an empty list',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(new ApiError(403));render(<PartyWorkspace kind="suppliers"/>);expect(await screen.findByRole('alert')).toHaveTextContent('صلاحيات');vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));click('تحديث القائمة');await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('الاتصال'));vi.mocked(readJson).mockResolvedValueOnce({suppliers:[]});click('تحديث القائمة');expect(await screen.findByText(/لا توجد بيانات مطابقة/)).toBeVisible();click('إضافة المورد');click('إلغاء');await screen.findByText('شركة الملابس');
});

it('does not update unmounted workspaces when pending reads resolve or reject',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));const loading=render(<PartyWorkspace kind="customers"/>);loading.unmount();await act(async()=>resolve({customers:[]}));
  let reject!:(reason:Error)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));const failing=render(<PartyWorkspace kind="suppliers"/>);failing.unmount();await act(async()=>reject(Error('offline')));
});
