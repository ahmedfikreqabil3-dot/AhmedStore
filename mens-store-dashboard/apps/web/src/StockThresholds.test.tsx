import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StockThresholds } from './StockThresholds.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const product='e5b51424-a9af-417d-9efe-71a4790e6ce1',warehouse='e5b51424-a9af-417d-9efe-71a4790e6ce2',second='e5b51424-a9af-417d-9efe-71a4790e6ce3';
const row={id:product,productId:product,productName:'قميص',sku:'SH-1',warehouseId:warehouse,warehouseName:'الرئيسي',minimum:'1.1250',quantity:'1.0000',version:1,updatedAt:'2026-10-30T10:00:00Z'};
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
async function respond(path:string){if(path==='/products')return {products:[{id:product,name:'قميص',active:true},{id:second,name:'بنطلون',active:true},{id:'old',name:'مؤرشف',active:false}]};if(path==='/warehouses')return {warehouses:[{id:warehouse,name:'الرئيسي',active:true},{id:'old',name:'فرع قديم',active:false}]};if(path.startsWith('/inventory/thresholds?'))return {thresholds:[row,{...row,id:second,productId:second,productName:'بنطلون',quantity:'2.0000',minimum:'1'}],total:26,limit:25,offset:0,asOf:'2026-10-30T10:00:00Z'};return {id:product,minimum:'0.0000',version:2};}
beforeEach(()=>{vi.mocked(readJson).mockImplementation(respond);});afterEach(()=>{cleanup();vi.resetAllMocks();});
async function ready(){render(<StockThresholds/>);await screen.findByRole('option',{name:'الرئيسي'});}
function fill(){change('صنف حد التنبيه',product);change('فرع حد التنبيه',warehouse);change('قيمة حد التنبيه','0.0000');}

it('validates a new threshold and reviews exact zero before saving',async()=>{
  await ready();expect(screen.queryByText('مؤرشف')).not.toBeInTheDocument();click('إعداد حد تنبيه');click('مراجعة حد التنبيه');expect(screen.getByRole('alert')).toHaveTextContent('اختار الصنف');fill();click('مراجعة حد التنبيه');expect(screen.getByText('0.0000 قطعة')).toBeVisible();click('رجوع لبيانات الحد');expect(screen.getByLabelText('قيمة حد التنبيه')).toHaveValue('0.0000');click('مراجعة حد التنبيه');click('تأكيد حفظ حد التنبيه');expect(await screen.findByText('تم حفظ حد تنبيه المخزون.')).toBeVisible();const call=vi.mocked(readJson).mock.calls.find(([,options])=>options?.method==='PUT')!;expect(JSON.parse(call[1]!.body as string)).toEqual({productId:product,warehouseId:warehouse,minimum:'0.0000',version:0});
});

it('uses the current version for an existing threshold and never changes its product or warehouse',async()=>{
  await ready();await screen.findByRole('button',{name:'تعديل حد قميص'});click('تعديل حد قميص');expect(screen.getByLabelText('صنف حد التنبيه')).toBeDisabled();expect(screen.getByLabelText('فرع حد التنبيه')).toBeDisabled();change('قيمة حد التنبيه','2.1250');click('مراجعة حد التنبيه');click('تأكيد حفظ حد التنبيه');await screen.findByText('تم حفظ حد تنبيه المخزون.');const call=vi.mocked(readJson).mock.calls.find(([,options])=>options?.method==='PUT')!;expect(JSON.parse(call[1]!.body as string)).toMatchObject({minimum:'2.1250',version:1});
});

it('preserves dirty values when opening another record or cancelling until explicit discard',async()=>{
  await ready();click('إعداد حد تنبيه');fill();click('تعديل حد قميص');expect(screen.getByRole('alert')).toHaveTextContent('تجاهل تعديلات');click('استكمال تعديل الحد');expect(screen.getByLabelText('قيمة حد التنبيه')).toHaveValue('0.0000');click('تعديل حد قميص');click('تجاهل تعديلات الحد');expect(screen.getByLabelText('قيمة حد التنبيه')).toHaveValue('1.1250');click('إلغاء تعديل الحد');expect(screen.queryByLabelText('قيمة حد التنبيه')).not.toBeInTheDocument();click('إعداد حد تنبيه');fill();click('مراجعة حد التنبيه');click('إلغاء تعديل الحد');click('تجاهل تعديلات الحد');expect(screen.queryByLabelText('قيمة حد التنبيه')).not.toBeInTheDocument();
});

it.each(['VERSION_CONFLICT','PRODUCT_UNAVAILABLE'])('explains a definite %s rejection and returns to editing',async code=>{
  await ready();click('تعديل حد قميص');change('قيمة حد التنبيه','3');click('مراجعة حد التنبيه');vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,code));click('تأكيد حفظ حد التنبيه');expect(await screen.findByRole('alert')).toHaveTextContent(code==='VERSION_CONFLICT' ? 'الحد مسجّل أو تغيّر' : 'الصنف أو الفرع');expect(screen.getByLabelText('قيمة حد التنبيه')).toHaveValue('3');
});

it.each([Error('offline'),new ApiError(500,'FAILED')])('keeps the reviewed original version after an uncertain save and prevents duplicate submission',async failure=>{
  await ready();click('تعديل حد قميص');change('قيمة حد التنبيه','3');click('مراجعة حد التنبيه');let reject!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));const button=screen.getByRole('button',{name:'تأكيد حفظ حد التنبيه'}),before=vi.mocked(readJson).mock.calls.length;act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(vi.mocked(readJson).mock.calls.length).toBe(before+1);await act(async()=>reject(failure));expect(screen.getByRole('alert')).toHaveTextContent('تعذر تأكيد');expect(screen.getByRole('heading',{name:'مراجعة حد التنبيه'})).toBeVisible();
});

it('applies branch/time filters only on submission and paginates',async()=>{
  await ready();change('نطاق حدود المخزون','all');change('تصفية فرع التنبيه',warehouse);change('توقيت عرض التنبيهات','2026-10-20T14:00');click('عرض حدود المخزون');await waitFor(()=>expect(vi.mocked(readJson).mock.calls.some(([path])=>path.includes('warehouseId='+warehouse)&&path.includes('asOf=')&&path.includes('mode=all'))).toBe(true));await screen.findByRole('button',{name:'تعديل حد قميص'});click('حدود تالية في القائمة');await waitFor(()=>expect(vi.mocked(readJson).mock.calls.some(([path])=>path.includes('offset=25'))).toBe(true));await screen.findByRole('button',{name:'تعديل حد قميص'});click('حدود أسبق في القائمة');await screen.findByRole('button',{name:'تعديل حد قميص'});change('تصفية فرع التنبيه','');change('توقيت عرض التنبيهات','');click('عرض حدود المخزون');await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith('/inventory/thresholds?mode=all&limit=25&offset=0'));
});

it('rejects dates outside the supported range',async()=>{
  await ready();change('توقيت عرض التنبيهات','999999-01-01T00:00');click('عرض حدود المخزون');expect(await screen.findByRole('alert')).toHaveTextContent('راجع الفرع والتاريخ');
});

it('recovers option/list errors and supports an empty filtered result',async()=>{
  vi.mocked(readJson).mockRejectedValue(Error('offline'));render(<StockThresholds/>);await screen.findByText('تعذر تحميل أصناف وفروع التنبيه.');await screen.findByText('تعذر تحميل حدود المخزون. أعد المحاولة.');vi.mocked(readJson).mockImplementation(async path=>path.startsWith('/inventory/thresholds?') ? {thresholds:[],total:0,limit:25,offset:0,asOf:'2026-10-30T10:00:00Z'} : respond(path));click('إعادة تحميل خيارات التنبيه');await screen.findByText('لا توجد حدود مطابقة للفلاتر المطبقة.');click('تحديث حدود المخزون');await screen.findByText('لا توجد حدود مطابقة للفلاتر المطبقة.');
});

it('renders read-only low-stock data without modification controls',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>path.startsWith('/inventory/thresholds?') ? {thresholds:[{...row,quantity:'-1.0000'}],total:1,limit:25,offset:0,asOf:'2026-10-30T10:00:00Z'} : respond(path));render(<StockThresholds canEdit={false}/>);expect(await screen.findByText('-1.0000')).toBeVisible();expect(screen.queryByRole('button',{name:'إعداد حد تنبيه'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'تعديل حد قميص'})).not.toBeInTheDocument();
});

it('keeps unavailable option identifiers visible when reviewing an existing record',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>path==='/products' ? {products:[]} : path==='/warehouses' ? {warehouses:[]} : respond(path));render(<StockThresholds/>);await screen.findByRole('button',{name:'تعديل حد قميص'});click('تعديل حد قميص');click('مراجعة حد التنبيه');expect(screen.getByText(product)).toBeVisible();expect(screen.getByText(warehouse)).toBeVisible();
});

it.each([true,false])('ignores catalogue/list results after unmount (success %s)',async success=>{
  let resolve!:(value:unknown)=>void,reject!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValue(new Promise((done,fail)=>{resolve=done;reject=fail;}));const view=render(<StockThresholds/>);view.unmount();await act(async()=>success ? resolve({products:[],warehouses:[],thresholds:[],total:0,asOf:'2026-10-30'}) : reject(Error('offline')));
});
