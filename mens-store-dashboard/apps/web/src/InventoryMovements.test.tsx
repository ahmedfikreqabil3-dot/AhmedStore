import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InventoryMovements } from './InventoryMovements.js';
import { CommandScope } from './pending-command.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const product='e5b51424-a9af-417d-9efe-71a4790e6ce1',warehouse='e5b51424-a9af-417d-9efe-71a4790e6ce2';
const saved={productId:product,warehouseId:warehouse,type:'OPENING_BALANCE',quantity:'1.1250',referenceType:'MANUAL_OPENING',referenceId:'تأسيس المخزون',occurredAt:'2026-10-30T10:00:00.000Z'};
const key='ahmed-store.pending.org.user.inventory-movement';
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
async function respond(path:string){if(path==='/products')return {products:[{id:product,name:'قميص',active:true},{id:'inactive',name:'مؤرشف',active:false}]};if(path==='/warehouses')return {warehouses:[{id:warehouse,name:'الرئيسي',active:true},{id:'inactive',name:'فرع قديم',active:false}]};return {id:'MOV-001'};}
beforeEach(()=>{vi.mocked(readJson).mockImplementation(respond);});
afterEach(()=>{cleanup();sessionStorage.clear();vi.resetAllMocks();});
async function ready(){render(<CommandScope.Provider value="org.user"><InventoryMovements/></CommandScope.Provider>);await screen.findByLabelText('صنف حركة الرصيد');}
function fill(){change('صنف حركة الرصيد',product);change('فرع حركة الرصيد',warehouse);change('كمية حركة الرصيد','1.1250');change('سبب حركة الرصيد','تأسيس المخزون');change('وقت حركة الرصيد','2026-10-30T14:00');}

it('validates quantities, selections and reason, preserves review edits and posts one exact opening',async()=>{
  await ready();expect(screen.queryByText('مؤرشف')).not.toBeInTheDocument();click('مراجعة حركة المخزون');expect(screen.getByRole('alert')).toHaveTextContent('كمية موجبة');
  change('كمية حركة الرصيد','1');change('سبب حركة الرصيد','سبب واضح');click('مراجعة حركة المخزون');expect(screen.getByRole('alert')).toHaveTextContent('راجع الصنف');
  fill();click('مراجعة حركة المخزون');expect(screen.getByText('1.1250 قطعة')).toBeVisible();click('رجوع لبيانات الحركة');expect(screen.getByLabelText('كمية حركة الرصيد')).toHaveValue('1.1250');click('مراجعة حركة المخزون');click('تأكيد حركة المخزون');expect(await screen.findByText(/تم تسجيل حركة المخزون MOV-001/)).toBeVisible();
  const posted=vi.mocked(readJson).mock.calls.find(([path])=>path==='/inventory/movements')!;expect(JSON.parse(posted[1]!.body as string)).toMatchObject({type:'OPENING_BALANCE',quantity:'1.1250',referenceId:'تأسيس المخزون'});expect(sessionStorage.getItem(key)).toBeNull();
});

it('reviews signed reductions and positive adjustments without changing the entered magnitude',async()=>{
  await ready();fill();change('نوع حركة الرصيد','ADJUSTMENT');change('اتجاه التسوية','decrease');click('مراجعة حركة المخزون');expect(screen.getByText('-1.1250 قطعة')).toBeVisible();click('رجوع لبيانات الحركة');change('اتجاه التسوية','increase');click('مراجعة حركة المخزون');expect(screen.getByText('1.1250 قطعة')).toBeVisible();
});

it.each(['OPENING_ALREADY_EXISTS','INVALID_OPENING_BALANCE','INSUFFICIENT_STOCK','PRODUCT_UNAVAILABLE','WAREHOUSE_UNAVAILABLE','ACTOR_UNAVAILABLE','UNKNOWN'])('allows a definite %s rejection to be corrected',async code=>{
  await ready();fill();click('مراجعة حركة المخزون');vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,code));click('تأكيد حركة المخزون');await screen.findByRole('alert');expect(sessionStorage.getItem(key)).toBeNull();expect(screen.getByRole('button',{name:'رجوع لبيانات الحركة'})).toBeEnabled();
});

it.each([Error('offline'),new ApiError(500,'FAILED')])('preserves the original unknown-result command and guards duplicate clicks',async failure=>{
  await ready();fill();click('مراجعة حركة المخزون');let reject!:(reason:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));const button=screen.getByRole('button',{name:'تأكيد حركة المخزون'});const before=vi.mocked(readJson).mock.calls.length;act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(vi.mocked(readJson).mock.calls.length).toBe(before+1);await act(async()=>reject(failure));expect(screen.getByRole('alert')).toHaveTextContent('تعذر تأكيد');expect(sessionStorage.getItem(key)).not.toBeNull();
});

it('restores a frozen command before catalogues arrive and keeps it on later authorization failure',async()=>{
  sessionStorage.setItem(key,JSON.stringify({version:1,key:'original-key',input:saved}));vi.mocked(readJson).mockImplementation(async path=>path==='/products' ? {products:[]} : path==='/warehouses' ? {warehouses:[]} : Promise.reject(new ApiError(403,'FORBIDDEN')));
  await ready();expect(screen.getByText(product)).toBeVisible();expect(screen.getByText(warehouse)).toBeVisible();click('إعادة نفس الطلب المحفوظ');await screen.findByRole('alert');expect(sessionStorage.getItem(key)).not.toBeNull();
});

it('retries failed option loading and blocks unreadable saved commands',async()=>{
  sessionStorage.setItem(key,'{');vi.mocked(readJson).mockRejectedValue(Error('offline'));render(<CommandScope.Provider value="org.user"><InventoryMovements/></CommandScope.Provider>);expect(await screen.findByText('تعذر تحميل خيارات حركة المخزون.')).toBeVisible();vi.mocked(readJson).mockImplementation(respond);click('إعادة تحميل خيارات الحركة');await screen.findByLabelText('صنف حركة الرصيد');expect(screen.getByRole('button',{name:'مراجعة حركة المخزون'})).toBeDisabled();
});

it('ignores successful option loading after unmount',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValue(new Promise(done=>{resolve=done;}));const view=render(<InventoryMovements/>);view.unmount();await act(async()=>resolve({products:[],warehouses:[]}));
});
it('ignores failed option loading after unmount',async()=>{
  let reject!:(reason:Error)=>void;vi.mocked(readJson).mockReturnValue(new Promise((_done,fail)=>{reject=fail;}));const view=render(<InventoryMovements/>);view.unmount();await act(async()=>reject(Error('offline')));
});
