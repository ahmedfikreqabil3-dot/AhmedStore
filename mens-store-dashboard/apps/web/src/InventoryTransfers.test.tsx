import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InventoryTransfers } from './InventoryTransfers.js';
import { CommandScope } from './pending-command.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const product='e5b51424-a9af-417d-9efe-71a4790e6ce1',source='e5b51424-a9af-417d-9efe-71a4790e6ce2',target='e5b51424-a9af-417d-9efe-71a4790e6ce3';
const input={productId:product,sourceWarehouseId:source,destinationWarehouseId:target,quantity:'1.1250',reason:'تغذية الفرع',occurredAt:'2026-10-30T10:00:00.000Z'};
const transfer={...input,id:product,organizationId:product,actorUserId:product,productName:'قميص',sku:'SH-1',createdAt:input.occurredAt};
const key='ahmed-store.pending.org.user.inventory-transfer';
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
async function respond(path:string){if(path==='/products')return {products:[{id:product,name:'قميص',active:true},{id:'inactive',name:'مؤرشف',active:false}]};if(path==='/warehouses')return {warehouses:[{id:source,name:'الرئيسي',active:true},{id:target,name:'المستلم',active:true},{id:'old',name:'فرع قديم',active:false}]};if(path.startsWith('/inventory/transfers?'))return {transfers:[transfer],total:51,limit:50,offset:0};return {transfer,replayed:false};}
beforeEach(()=>{vi.mocked(readJson).mockImplementation(respond);});
afterEach(()=>{cleanup();sessionStorage.clear();vi.resetAllMocks();});
async function ready(){render(<CommandScope.Provider value="org.user"><InventoryTransfers/></CommandScope.Provider>);await screen.findByLabelText('صنف التحويل');}
function fill(){change('صنف التحويل',product);change('مصدر التحويل',source);change('مستلم التحويل',target);change('كمية التحويل','1.1250');change('سبب التحويل','تغذية الفرع');change('وقت التحويل','2026-10-30T14:00');}

it('reviews and posts a valid transfer with one frozen key/body and reloads its real history',async()=>{
  await ready();expect(screen.queryByRole('option',{name:'مؤرشف'})).not.toBeInTheDocument();click('مراجعة التحويل');expect(screen.getByRole('alert')).toHaveTextContent('راجع الصنف');fill();click('مراجعة التحويل');expect(screen.getByText('مراجعة تحويل المخزون')).toBeVisible();click('رجوع لبيانات التحويل');expect(screen.getByLabelText('كمية التحويل')).toHaveValue('1.1250');click('مراجعة التحويل');click('تأكيد تحويل المخزون');await screen.findByText(/تم تسجيل تحويل المخزون/);
  expect(readJson).toHaveBeenCalledWith('/inventory/transfers',expect.objectContaining({method:'POST',headers:expect.objectContaining({'idempotency-key':expect.any(String)}),body:expect.stringContaining('1.1250')}));expect(sessionStorage.getItem(key)).toBeNull();
});

it('paginates tenant transfer history and keeps options available',async()=>{
  await ready();await screen.findByRole('region',{name:'سجل تحويلات المخزون'});click('التحويلات التالية');await waitFor(()=>expect(readJson).toHaveBeenCalledWith('/inventory/transfers?limit=50&offset=50'));await screen.findByRole('region',{name:'سجل تحويلات المخزون'});click('التحويلات السابقة');await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith('/inventory/transfers?limit=50&offset=0'));
});

it('preserves uncertain transfers and original data across remounts even when later retries are rejected',async()=>{
  sessionStorage.setItem(key,JSON.stringify({version:1,key:'original-key',input}));vi.mocked(readJson).mockImplementation(async path=>{if(path==='/inventory/transfers')throw new ApiError(409);return respond(path);});
  await ready();expect(screen.getByLabelText('صنف التحويل')).toBeDisabled();click('إعادة نفس الطلب المحفوظ');await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('تعذر تأكيد نتيجة التحويل'));expect(JSON.parse(sessionStorage.getItem(key)!).key).toBe('original-key');
  vi.mocked(readJson).mockImplementation(respond);click('إعادة نفس الطلب المحفوظ');await screen.findByText(/تم تسجيل تحويل المخزون/);expect(readJson).toHaveBeenCalledWith('/inventory/transfers',expect.objectContaining({headers:expect.objectContaining({'idempotency-key':'original-key'}),body:JSON.stringify(input)}));
});

it('allows correction after a definite initial rejection without losing the review',async()=>{
  await ready();fill();click('مراجعة التحويل');vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409));click('تأكيد تحويل المخزون');expect(await screen.findByRole('alert')).toHaveTextContent('لم يُسجّل التحويل');expect(sessionStorage.getItem(key)).toBeNull();click('رجوع لبيانات التحويل');expect(screen.getByLabelText('كمية التحويل')).toBeEnabled();
});

it.each([Error('offline'),new ApiError(500)])('retains a newly sent uncertain transfer instead of unlocking a duplicate',async failure=>{
  await ready();fill();click('مراجعة التحويل');vi.mocked(readJson).mockRejectedValueOnce(failure);click('تأكيد تحويل المخزون');expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تأكيد نتيجة التحويل');expect(sessionStorage.getItem(key)).not.toBeNull();
});

it('guards rapid duplicate confirmations while a request remains in flight',async()=>{
  let resolve!:(value:unknown)=>void;await ready();fill();click('مراجعة التحويل');vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));const button=screen.getByRole('button',{name:'تأكيد تحويل المخزون'});const before=vi.mocked(readJson).mock.calls.length;act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(vi.mocked(readJson).mock.calls.length).toBe(before+1);await act(async()=>resolve({transfer,replayed:false}));await screen.findByText(/تم تسجيل تحويل المخزون/);
});

it('recovers option/history errors and supports an empty transfer list',async()=>{
  vi.mocked(readJson).mockRejectedValue(Error('offline'));render(<InventoryTransfers/>);await screen.findByText(/تعذر تحميل الأصناف/);await screen.findByText(/تعذر تحميل سجل التحويلات/);vi.mocked(readJson).mockImplementation(async path=>path.startsWith('/inventory/transfers?') ? {transfers:[],total:0,limit:50,offset:0} : respond(path));click('إعادة تحميل خيارات التحويل');await screen.findByLabelText('صنف التحويل');expect(await screen.findByText('لا توجد تحويلات مسجلة.')).toBeVisible();click('تحديث سجل التحويلات');await screen.findByLabelText('صنف التحويل');
});

it('keeps restored record identifiers visible before options load and blocks malformed saved data',async()=>{
  sessionStorage.setItem(key,JSON.stringify({version:1,key:'original-key',input}));let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValue(new Promise(done=>{resolve=done;}));const view=render(<CommandScope.Provider value="org.user"><InventoryTransfers/></CommandScope.Provider>);expect(screen.getAllByText(product).length).toBeGreaterThan(0);view.unmount();await act(async()=>resolve({products:[],warehouses:[],transfers:[],total:0}));
  sessionStorage.setItem(key,'{');vi.mocked(readJson).mockImplementation(respond);render(<CommandScope.Provider value="org.user"><InventoryTransfers/></CommandScope.Provider>);expect(screen.getByRole('alert')).toHaveTextContent('تعذر قراءة الطلب المحفوظ');
});

it('ignores both rejected reads after unmount',async()=>{
  let reject!:(reason:Error)=>void;vi.mocked(readJson).mockReturnValue(new Promise((_done,fail)=>{reject=fail;}));const view=render(<InventoryTransfers/>);view.unmount();await act(async()=>reject(Error('offline')));
});

it('shows identifiers for restored inactive or unavailable option records',async()=>{
  sessionStorage.setItem(key,JSON.stringify({version:1,key:'original-key',input}));vi.mocked(readJson).mockImplementation(async path=>path==='/products' ? {products:[]} : path==='/warehouses' ? {warehouses:[]} : {transfers:[],total:0,limit:50,offset:0});
  await ready();expect(screen.getAllByText(product).length).toBeGreaterThan(0);expect(screen.getByText(target)).toBeVisible();
});
