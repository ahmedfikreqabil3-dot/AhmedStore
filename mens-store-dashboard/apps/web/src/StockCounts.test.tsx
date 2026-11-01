import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StockCounts } from './StockCounts.js';
import { CommandScope } from './pending-command.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const product='e5b51424-a9af-417d-9efe-71a4790e6ce1',warehouse='e5b51424-a9af-417d-9efe-71a4790e6ce2';
const input={warehouseId:warehouse,reason:'جرد فعلي',occurredAt:'2026-10-30T10:00:00.000Z',lines:[{productId:product,expectedQuantity:'1.1250',countedQuantity:'0'}]};
const count={...input,id:product,organizationId:product,actorUserId:product,createdAt:input.occurredAt,lines:[{...input.lines[0]!,id:product,productName:'قميص',sku:'SH-1',difference:'-1.1250',inventoryTransactionId:product}]};
const key='ahmed-store.pending.org.user.stock-count';
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
async function respond(path:string){if(path==='/products')return {products:[{id:product,name:'قميص',active:true},{id:'inactive',name:'مؤرشف',active:false}]};if(path==='/warehouses')return {warehouses:[{id:warehouse,name:'الرئيسي',active:true},{id:'old',name:'فرع قديم',active:false}]};if(path.startsWith('/inventory/stock?'))return {quantity:'1.1250'};if(path.startsWith('/inventory/counts?'))return {counts:[count],total:11,limit:10,offset:0};return {count,replayed:false};}
beforeEach(()=>{vi.mocked(readJson).mockImplementation(respond);});afterEach(()=>{cleanup();sessionStorage.clear();vi.resetAllMocks();});
async function ready(){render(<CommandScope.Provider value="org.user"><StockCounts/></CommandScope.Provider>);await screen.findByLabelText('فرع الجرد');}
function select(){change('فرع الجرد',warehouse);change('وقت الجرد','2026-10-30T14:00');change('إضافة صنف للجرد',product);click('إضافة إلى أصناف الجرد');}
async function counted(value='0'){await ready();select();click('تحميل أرصدة الجرد');await screen.findByLabelText('العد الفعلي قميص');change('العد الفعلي قميص',value);change('سبب الجرد','جرد فعلي');}

it('requires valid selections, removes selected products and excludes inactive options',async()=>{
  await ready();expect(screen.queryByText('مؤرشف')).not.toBeInTheDocument();click('تحميل أرصدة الجرد');expect(screen.getByRole('alert')).toHaveTextContent('اختار الفرع');select();change('إضافة صنف للجرد',product);expect(screen.getByRole('button',{name:'إضافة إلى أصناف الجرد'})).toBeDisabled();click('حذف قميص من الجرد');expect(screen.getByRole('button',{name:'إضافة إلى أصناف الجرد'})).toBeEnabled();click('إضافة إلى أصناف الجرد');change('وقت الجرد','');click('تحميل أرصدة الجرد');expect(screen.getByRole('alert')).toHaveTextContent('اختار الفرع');
});

it('preserves counted values through review and posts an exact zero count with negative discrepancy',async()=>{
  await ready();select();click('تحميل أرصدة الجرد');await screen.findByLabelText('العد الفعلي قميص');click('مراجعة محضر الجرد');expect(screen.getByRole('alert')).toHaveTextContent('كمية المعدودة');change('سبب الجرد','جرد فعلي');change('العد الفعلي قميص','0');click('مراجعة محضر الجرد');expect(screen.getByRole('heading',{name:'مراجعة محضر الجرد'})).toBeVisible();click('رجوع للكميات المعدودة');expect(screen.getByLabelText('العد الفعلي قميص')).toHaveValue('0');click('مراجعة محضر الجرد');click('تأكيد محضر الجرد');expect(await screen.findByText(/تم تسجيل محضر الجرد/)).toBeVisible();expect(sessionStorage.getItem(key)).toBeNull();const post=vi.mocked(readJson).mock.calls.find(([path])=>path==='/inventory/counts')!;expect(JSON.parse(post[1]!.body as string)).toMatchObject({warehouseId:warehouse,lines:[{productId:product,expectedQuantity:'1.1250',countedQuantity:'0'}]});
});

it('refreshes a changed snapshot while retaining the physical count and requires a second review',async()=>{
  await counted('0.5');click('مراجعة محضر الجرد');vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,'STOCK_CHANGED'));click('تأكيد محضر الجرد');expect(await screen.findByRole('alert')).toHaveTextContent('الرصيد تغيّر');expect(sessionStorage.getItem(key)).toBeNull();vi.mocked(readJson).mockImplementation(async path=>path.startsWith('/inventory/stock?') ? {quantity:'2.0000'} : respond(path));click('تحديث الأرصدة ومراجعة الفروق');await waitFor(()=>expect(screen.getByLabelText('العد الفعلي قميص')).toHaveValue('0.5'));await screen.findByText('2.0000');expect(screen.getByText('-1.5000')).toBeVisible();click('مراجعة محضر الجرد');expect(screen.getByRole('button',{name:'تأكيد محضر الجرد'})).toBeEnabled();
});

it('allows a definite stock constraint rejection to be corrected',async()=>{
  await counted();click('مراجعة محضر الجرد');vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,'INSUFFICIENT_STOCK'));click('تأكيد محضر الجرد');expect(await screen.findByRole('alert')).toHaveTextContent('لم يُسجّل الجرد');expect(sessionStorage.getItem(key)).toBeNull();
});

it.each([Error('offline'),new ApiError(500,'UNAVAILABLE')])('keeps the original unknown-result command and prevents concurrent duplicate posts',async failure=>{
  await counted();click('مراجعة محضر الجرد');let reject!:(failure:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));const button=screen.getByRole('button',{name:'تأكيد محضر الجرد'}),before=vi.mocked(readJson).mock.calls.length;act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(vi.mocked(readJson).mock.calls.length).toBe(before+1);await act(async()=>reject(failure));expect(screen.getByRole('alert')).toHaveTextContent('تعذر تأكيد');expect(sessionStorage.getItem(key)).not.toBeNull();
});

it('restores original identifiers and never clears an uncertain count on a later authorization failure',async()=>{
  sessionStorage.setItem(key,JSON.stringify({version:1,key:'original-count',input}));vi.mocked(readJson).mockImplementation(async path=>path==='/products' ? {products:[]} : path==='/warehouses' ? {warehouses:[]} : path.startsWith('/inventory/counts?') ? {counts:[],total:0,limit:10,offset:0} : Promise.reject(new ApiError(403,'FORBIDDEN')));await ready();expect(screen.getByText(product)).toBeVisible();expect(screen.getByText(warehouse)).toBeVisible();click('إعادة نفس الطلب المحفوظ');expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تأكيد');expect(sessionStorage.getItem(key)).not.toBeNull();
});

it('requires explicit confirmation before clearing a modified count selection',async()=>{
  await counted('0.5');click('تغيير الأصناف أو التوقيت');click('الرجوع للجرد');expect(screen.getByLabelText('العد الفعلي قميص')).toHaveValue('0.5');click('تغيير الأصناف أو التوقيت');click('تغيير بيانات الجرد');expect(screen.getByLabelText('فرع الجرد')).toHaveValue(warehouse);expect(screen.queryByLabelText('العد الفعلي قميص')).not.toBeInTheDocument();
});

it('recovers catalogue/history read errors, supports an empty history and blocks malformed stored commands',async()=>{
  sessionStorage.setItem(key,'{');vi.mocked(readJson).mockRejectedValue(Error('offline'));render(<CommandScope.Provider value="org.user"><StockCounts/></CommandScope.Provider>);await screen.findByText('تعذر تحميل خيارات الجرد.');await screen.findByText('تعذر تحميل سجل الجرد. أعد المحاولة.');vi.mocked(readJson).mockImplementation(async path=>path.startsWith('/inventory/counts?') ? {counts:[],total:0,limit:10,offset:0} : respond(path));click('إعادة تحميل خيارات الجرد');await screen.findByLabelText('فرع الجرد');expect(screen.getByRole('button',{name:'تحميل أرصدة الجرد'})).toBeDisabled();expect(await screen.findByText('لا توجد محاضر جرد مسجلة.')).toBeVisible();click('تحديث سجل الجرد');await screen.findByLabelText('فرع الجرد');
});

it('paginates the count history',async()=>{
  await ready();await screen.findByText(/محضر e5b51424/);click('محاضر تالية في القائمة');await waitFor(()=>expect(readJson).toHaveBeenCalledWith('/inventory/counts?limit=10&offset=10'));await screen.findByText(/محضر e5b51424/);click('محاضر أسبق في القائمة');await screen.findByText(/محضر e5b51424/);
});

it.each([Error('offline'),{quantity:'invalid'}])('requires a valid balance read before entering actual quantities',async result=>{
  await ready();select();vi.mocked(readJson).mockImplementationOnce(async()=>{if(result instanceof Error)throw result;return result;});click('تحميل أرصدة الجرد');expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل أرصدة');
});

it('serializes balance loading and ignores a successful late read after unmount',async()=>{
  const view=render(<StockCounts/>);await screen.findByLabelText('فرع الجرد');select();let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));const button=screen.getByRole('button',{name:'تحميل أرصدة الجرد'}),before=vi.mocked(readJson).mock.calls.length;act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(vi.mocked(readJson).mock.calls.length).toBe(before+1);view.unmount();await act(async()=>resolve({quantity:'1'}));
});
it('ignores a failed balance read after unmount',async()=>{
  const view=render(<StockCounts/>);await screen.findByLabelText('فرع الجرد');select();let reject!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));click('تحميل أرصدة الجرد');view.unmount();await act(async()=>reject(Error('offline')));
});
it.each([true,false])('ignores option/history results after unmount (success %s)',async success=>{
  let resolve!:(value:unknown)=>void,reject!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValue(new Promise((done,fail)=>{resolve=done;reject=fail;}));const view=render(<StockCounts/>);view.unmount();await act(async()=>success ? resolve({products:[],warehouses:[],counts:[],total:0}) : reject(Error('offline')));
});

it('shows signed and invalid discrepancies safely when balances or legacy history need review',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>path.startsWith('/inventory/stock?') ? {quantity:'-1'} : path.startsWith('/inventory/counts?') ? {counts:[{...count,lines:[{...count.lines[0],expectedQuantity:'invalid',countedQuantity:'0'}]}],total:1,limit:10,offset:0} : respond(path));await ready();select();click('تحميل أرصدة الجرد');await screen.findByLabelText('العد الفعلي قميص');change('العد الفعلي قميص','0');expect(screen.getByText('1.0000')).toBeVisible();change('العد الفعلي قميص','-1');expect(screen.getByText('0.0000')).toBeVisible();
});

it('limits each count to one hundred distinct products',async()=>{
  const products=Array.from({length:101},(_,index)=>({id:`e5b51424-a9af-417d-9efe-${String(index).padStart(12,'0')}`,name:`صنف ${index}`,active:true}));
  vi.mocked(readJson).mockImplementation(async path=>path==='/products' ? {products} : path.startsWith('/inventory/counts?') ? {counts:[],total:0,limit:10,offset:0} : respond(path));await ready();
  const selector=screen.getByLabelText('إضافة صنف للجرد'),add=screen.getByRole('button',{name:'إضافة إلى أصناف الجرد'});
  for(const row of products.slice(0,100)){fireEvent.change(selector,{target:{value:row.id}});fireEvent.click(add);}
  change('إضافة صنف للجرد',products[100]!.id);expect(screen.getByRole('button',{name:'إضافة إلى أصناف الجرد'})).toBeDisabled();
},15000);

it('keeps each physical quantity independent in a multi-product count',async()=>{
  const second='e5b51424-a9af-417d-9efe-71a4790e6ce3';vi.mocked(readJson).mockImplementation(async path=>path==='/products' ? {products:[{id:product,name:'قميص',active:true},{id:second,name:'بنطلون',active:true}]} : respond(path));await ready();select();change('إضافة صنف للجرد',second);click('إضافة إلى أصناف الجرد');click('تحميل أرصدة الجرد');await screen.findByLabelText('العد الفعلي قميص');change('العد الفعلي قميص','1');change('العد الفعلي بنطلون','2.5');expect(screen.getByLabelText('العد الفعلي قميص')).toHaveValue('1');expect(screen.getByLabelText('العد الفعلي بنطلون')).toHaveValue('2.5');change('سبب الجرد','مراجعة العد');click('مراجعة محضر الجرد');expect(screen.getByRole('heading',{name:'مراجعة محضر الجرد'})).toBeVisible();
});
