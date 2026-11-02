import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReportsWorkspace } from './ReportsWorkspace.js';
import { readJson } from './store-api.js';
vi.mock('./store-api.js', () => ({ readJson: vi.fn() }));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
const id='ab8ce3b4-3af9-4f30-a650-e635dd6b1c80';
const report={kind:'sales',from:'2026-11-01',to:'2026-11-02',total:26,totalAmount:'110.1233',totalQuantity:null,limit:25,offset:0,rows:[{id,occurredAt:'2026-11-01',label:'SALE',reference:id,amount:'100.1234',quantity:null}]};
beforeEach(()=>{
  vi.restoreAllMocks();vi.mocked(readJson).mockReset();
  vi.mocked(readJson).mockImplementation(async(path)=>path==='/warehouses'?{warehouses:[{id,name:'فرع المراجعة'}]}:report);
});
it('loads exact full-period totals, applies filters and pages the applied query',async()=>{
  render(<ReportsWorkspace/>);await screen.findByText('110.1233');
  expect(screen.getByText('فاتورة بيع')).toBeVisible();
  fireEvent.change(screen.getByLabelText('إلى تاريخ'),{target:{value:''}});
  fireEvent.change(screen.getByLabelText('من تاريخ'),{target:{value:'2026-11-01'}});fireEvent.change(screen.getByLabelText('إلى تاريخ'),{target:{value:'2026-11-02'}});
  fireEvent.change(screen.getByLabelText('الفرع'),{target:{value:id}});fireEvent.submit(screen.getByRole('form',{name:'فلاتر التقارير'}));
  await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('warehouseId='+id),expect.any(Object)));
  await screen.findByText('110.1233');fireEvent.click(screen.getByRole('button',{name:'التالي'}));
  await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'),expect.any(Object)));
});
it('shows cumulative inventory, an empty result and a retry after a failed request',async()=>{
  vi.mocked(readJson).mockImplementation(async(path)=>{if(path==='/warehouses')return{warehouses:[]};throw Error('offline');});
  render(<ReportsWorkspace/>);await screen.findByRole('alert');
  vi.mocked(readJson).mockResolvedValue({...report,kind:'inventory',total:0,totalAmount:null,totalQuantity:'0.0000',rows:[]});
  fireEvent.click(screen.getByRole('button',{name:'إعادة تحميل التقرير'}));await screen.findByText('لا توجد نتائج للفلاتر المحددة.');
  expect(screen.getByText(/رصيد تراكمي/)).toBeVisible();expect(screen.getByRole('button',{name:'تصدير Excel لكل النتائج'})).toBeDisabled();
});
it('validates periods and exports only the applied filters, with bounded export errors and print action',async()=>{
  const print=vi.spyOn(window,'print').mockImplementation(()=>{});
  render(<ReportsWorkspace/>);await screen.findByText('110.1233');
  fireEvent.change(screen.getByLabelText('من تاريخ'),{target:{value:'2027-01-01'}});fireEvent.submit(screen.getByRole('form',{name:'فلاتر التقارير'}));expect(screen.getByRole('alert')).toHaveTextContent('اختر فترة صحيحة');
  const fetcher=vi.fn().mockResolvedValue({ok:false,status:422});vi.stubGlobal('fetch',fetcher);
  fireEvent.click(screen.getByRole('button',{name:'تصدير Excel لكل النتائج'}));await screen.findByText(/١٠ آلاف/);
  expect(fetcher.mock.calls[0]![0]).not.toContain('2027-01-01');
  fetcher.mockResolvedValueOnce({ok:false,status:500});fireEvent.click(screen.getByRole('button',{name:'تصدير Excel لكل النتائج'}));await screen.findByText('تعذر تصدير التقرير. أعد المحاولة.');
  fireEvent.click(screen.getByRole('button',{name:'طباعة الصفحة الحالية'}));expect(print).toHaveBeenCalledOnce();vi.unstubAllGlobals();
});
it('discards stale responses when filters change and cancels on unmount',async()=>{
  let resolve!:(value:unknown)=>void;
  vi.mocked(readJson).mockImplementation(async(path)=>path==='/warehouses'?{warehouses:[]}:new Promise(done=>{resolve=done;}));
  const view=render(<ReportsWorkspace/>);expect(screen.getByRole('status')).toBeVisible();view.unmount();
  await act(async()=>resolve(report));expect(screen.queryByText('110.1233')).not.toBeInTheDocument();
});

it('downloads an exact report workbook and releases its object URL',async()=>{
  const create=vi.fn(()=> 'blob:report'),revoke=vi.fn();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>new Blob(['workbook'])})));
  render(<ReportsWorkspace/>);await screen.findByText('110.1233');vi.useFakeTimers();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'تصدير Excel لكل النتائج'})));
  expect(click).toHaveBeenCalledOnce();vi.runAllTimers();expect(revoke).toHaveBeenCalledWith('blob:report');
});

it('switches report kinds, removes inapplicable branch filters and renders non-monetary rows',async()=>{
  render(<ReportsWorkspace/>);await screen.findByText('110.1233');
  vi.mocked(readJson).mockResolvedValueOnce({...report,kind:'inventory',totalAmount:null,totalQuantity:'2.1234',offset:25,rows:[{...report.rows[0],label:'قميص',amount:null,quantity:'2.1234'}]});
  fireEvent.change(screen.getByLabelText('نوع التقرير'),{target:{value:'inventory'}});fireEvent.submit(screen.getByRole('form',{name:'فلاتر التقارير'}));await screen.findByText('قميص');
  fireEvent.click(screen.getByRole('button',{name:'السابق'}));await screen.findByText('110.1233');
  fireEvent.change(screen.getByLabelText('نوع التقرير'),{target:{value:'treasury'}});fireEvent.submit(screen.getByRole('form',{name:'فلاتر التقارير'}));
  await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('kind=treasury'),expect.any(Object)));expect(screen.queryByLabelText('الفرع')).not.toBeInTheDocument();
});

it('retains a historical branch identifier if its name is unavailable',async()=>{
  render(<ReportsWorkspace/>);await screen.findByText('110.1233');
  const select=screen.getByLabelText('الفرع');const historical=document.createElement('option');historical.value='old-branch';historical.text='فرع تاريخي';select.append(historical);
  fireEvent.change(select,{target:{value:'old-branch'}});fireEvent.submit(screen.getByRole('form',{name:'فلاتر التقارير'}));await screen.findByText(/old-branch/);
});
