import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PartyStatement, statementAmount } from './PartyStatement.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f',party={id,name:'أحمد محمود'};
const fixture={kind:'customers',party:{...party,active:true},from:'2026-10-01T00:00:00Z',to:'2026-10-30T23:59:59Z',opening:'10.0000',debits:'20.1234',credits:'2.0001',closing:'28.1233',limit:25,offset:0,total:1,rows:[{id:'movement',occurredAt:'2026-10-10T12:00:00Z',type:'SALE_CREDIT',sourceType:'Sale',sourceId:'sale-reference',amount:'20.1234',balance:'30.1234'}]};
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});
beforeEach(()=>{vi.mocked(readJson).mockResolvedValue(fixture);});
afterEach(()=>{cleanup();vi.resetAllMocks();});

it('displays exact account amounts, document references and safe signed balances without floating point conversion',async()=>{
  const close=vi.fn();render(<PartyStatement kind="customers" party={party} close={close}/>);
  expect(screen.getByRole('status')).toHaveTextContent('تحميل');await screen.findByText('sale-reference');
  expect(screen.getByText('28.1233')).toBeVisible();expect(screen.getByText('بيع آجل')).toBeVisible();
  expect(screen.getByRole('region',{name:'حركات كشف الحساب'})).toHaveAttribute('tabindex','0');
  expect(screen.getByRole('button',{name:'الحركات السابقة'})).toBeDisabled();expect(screen.getByRole('button',{name:'الحركات التالية'})).toBeDisabled();
  click('إغلاق كشف الحساب');expect(close).toHaveBeenCalledOnce();
  expect(statementAmount('-999999999999999999.9999')).toBe('-999,999,999,999,999,999.9999');
});

it('validates the period and loads server pagination while preserving filters',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>({...fixture,total:26,offset:path.includes('offset=25')?25:0}));
  render(<PartyStatement kind="customers" party={party} close={vi.fn()}/>);await screen.findByText('sale-reference');
  change('بداية كشف الحساب','');click('عرض كشف الحساب');expect(screen.getByRole('alert')).toHaveTextContent('حدد فترة صحيحة');
  change('بداية كشف الحساب','2026-10-31');change('نهاية كشف الحساب','');click('عرض كشف الحساب');expect(screen.getByRole('alert')).toBeVisible();
  change('نهاية كشف الحساب','2026-10-01');click('عرض كشف الحساب');expect(screen.getByRole('alert')).toBeVisible();
  change('بداية كشف الحساب','2026-10-01');change('نهاية كشف الحساب','2026-10-30');click('عرض كشف الحساب');
  await waitFor(()=>expect(screen.queryByRole('status')).not.toBeInTheDocument());expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  click('الحركات التالية');await waitFor(()=>expect(screen.getByRole('button',{name:'الحركات التالية'})).toBeDisabled());
  expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'));
  expect(screen.getByLabelText('بداية كشف الحساب')).toHaveValue('2026-10-01');click('الحركات السابقة');await waitFor(()=>expect(screen.getByRole('button',{name:'الحركات السابقة'})).toBeDisabled());
});

it('shows archived supplier balances, empty periods and unknown movement descriptions without hiding the balance',async()=>{
  vi.mocked(readJson).mockResolvedValueOnce({...fixture,kind:'suppliers',party:{...party,active:false},rows:[]});
  const view=render(<PartyStatement kind="suppliers" party={party} close={vi.fn()}/>);
  await screen.findByText(/سجل مؤرشف/);expect(screen.getByText(/لا توجد حركات في هذه الصفحة/)).toBeVisible();expect(screen.getByText('28.1233')).toBeVisible();
  vi.mocked(readJson).mockResolvedValueOnce({...fixture,rows:[{...fixture.rows[0],type:'LEGACY_CREDIT'}]});
  view.rerender(<PartyStatement kind="customers" party={party} close={vi.fn()}/>);expect(await screen.findByText('LEGACY_CREDIT')).toBeVisible();
});

it.each([new ApiError(403),Error('network'),{bad:'response'}])('keeps the period and allows retry after a rejected or invalid response',async failure=>{
  if('bad' in failure)vi.mocked(readJson).mockResolvedValueOnce(failure);else vi.mocked(readJson).mockRejectedValueOnce(failure);
  render(<PartyStatement kind="customers" party={party} close={vi.fn()}/>);
  await screen.findByRole('alert');click('إعادة تحميل كشف الحساب');expect(await screen.findByText('sale-reference')).toBeVisible();
});

it('ignores a superseded account response and a rejection after leaving the workspace',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const view=render(<PartyStatement kind="customers" party={party} close={vi.fn()}/>);
  view.rerender(<PartyStatement kind="suppliers" party={party} close={vi.fn()}/>);await screen.findByText('sale-reference');
  await act(async()=>{resolve({...fixture,closing:'999.0000'});});expect(screen.queryByText('999.0000')).not.toBeInTheDocument();
  let reject!:(reason:Error)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise((_done,fail)=>{reject=fail;}));
  view.rerender(<PartyStatement kind="customers" party={party} close={vi.fn()}/>);view.unmount();await act(async()=>{reject(Error('late response'));});
});
