import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DashboardWorkspace} from './DashboardWorkspace.js';
import {readJson} from './store-api.js';
vi.mock('./store-api.js',()=>({readJson:vi.fn()}));
const id='ab8ce3b4-3af9-4f30-a650-e635dd6b1c80';
function report(kind='sales',amount='9007199254740993.1234'){
  return {kind,from:'2026-03-01',to:'2026-03-05',total:20,totalAmount:amount,totalQuantity:null,limit:5,offset:0,rows:kind==='sales'?[{id,occurredAt:'2026-03-05',label:'SALE',reference:id,amount:'20.0000',quantity:null},{id:id+'r',occurredAt:'2026-03-04',label:'SALES_RETURN',reference:id,amount:'-5.0000',quantity:null}]:[]};
}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-03-05T10:00:00Z'));vi.mocked(readJson).mockReset();
  vi.mocked(readJson).mockImplementation(async path=>{const p=new URLSearchParams(path.split('?')[1]);return report(p.get('kind')!,p.get('from')!.startsWith('2026-02')?'9007199254740993.1233':'9007199254740993.1234');});
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('loads five summaries in parallel with exact totals and equal-length previous dates',async()=>{
  render(<DashboardWorkspace/>);expect(screen.getByRole('status')).toHaveTextContent('جارٍ تحميل');
  await screen.findByText('المبيعات أعلى من الفترة السابقة');
  expect(screen.getAllByText('9,007,199,254,740,993.1234')).toHaveLength(4);expect(screen.getByText('فاتورة بيع')).toBeVisible();expect(screen.getByText('مرتجع بيع')).toBeVisible();expect(screen.getByText('-5.0000')).toBeVisible();
  expect(readJson).toHaveBeenCalledTimes(5);const calls=vi.mocked(readJson).mock.calls.map(([path])=>new URLSearchParams(path.split('?')[1]));
  expect(calls[1]!.get('from')).toBe('2026-02-24T00:00:00.000Z');expect(calls[1]!.get('to')).toBe('2026-02-28T23:59:59.999Z');expect(calls.every(p=>p.get('limit')==='5'&&p.get('offset')==='0')).toBe(true);
  expect(screen.getByRole('link',{name:'راجع فواتير البيع'})).toHaveAttribute('href','#sales');expect(screen.getByRole('link',{name:'افتح التقارير التفصيلية'})).toHaveAttribute('href','#reports');
});
it('validates the date period, applies both dates and shows zero without invented growth',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>({...report(new URLSearchParams(path.split('?')[1]).get('kind')!,'0.0000'),total:0,rows:[]}));
  render(<DashboardWorkspace/>);await screen.findByText('المبيعات بدون تغيير عن الفترة السابقة');
  expect(screen.getByText('لا توجد مبيعات أو مرتجعات خلال الفترة.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('من تاريخ'),{target:{value:''}});fireEvent.submit(screen.getByRole('form'));expect(screen.getByRole('alert')).toHaveTextContent('اختر فترة صحيحة');
  fireEvent.change(screen.getByLabelText('من تاريخ'),{target:{value:'2026-04-01'}});fireEvent.submit(screen.getByRole('form'));expect(readJson).toHaveBeenCalledTimes(5);
  fireEvent.change(screen.getByLabelText('من تاريخ'),{target:{value:'2026-02-28'}});fireEvent.change(screen.getByLabelText('إلى تاريخ'),{target:{value:''}});fireEvent.submit(screen.getByRole('form'));expect(readJson).toHaveBeenCalledTimes(5);
  fireEvent.change(screen.getByLabelText('إلى تاريخ'),{target:{value:'2026-03-02'}});fireEvent.submit(screen.getByRole('form'));
  await waitFor(()=>expect(readJson).toHaveBeenCalledTimes(10));await screen.findByText('المبيعات بدون تغيير عن الفترة السابقة');expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const p=new URLSearchParams(vi.mocked(readJson).mock.calls[6]![0].split('?')[1]);expect(p.get('from')).toBe('2026-02-25T00:00:00.000Z');expect(p.get('to')).toBe('2026-02-27T23:59:59.999Z');
});
it('shows a decline when current net sales are negative',async()=>{
  vi.mocked(readJson).mockImplementation(async path=>report(new URLSearchParams(path.split('?')[1]).get('kind')!,path.includes('2026-03')?'-1.1234':'1.1234'));
  render(<DashboardWorkspace/>);await screen.findByText('المبيعات أقل من الفترة السابقة');expect(screen.getAllByText('-1.1234')).toHaveLength(4);
});
it.each(['network','schema','kind','amount'])('rejects an incomplete %s summary and retries the whole set',async failure=>{
  const successful=vi.mocked(readJson).getMockImplementation()!;
  vi.mocked(readJson).mockImplementationOnce(async()=>{if(failure==='network')throw Error('offline');if(failure==='schema')return {};return report(failure==='kind'?'expenses':'sales',failure==='amount'?null as unknown as string:'1.0000');});
  render(<DashboardWorkspace/>);expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل');expect(screen.queryByText('صافي المبيعات')).not.toBeInTheDocument();
  vi.mocked(readJson).mockImplementation(successful);fireEvent.click(screen.getByRole('button',{name:'إعادة تحميل الملخص'}));await screen.findByText('المبيعات أعلى من الفترة السابقة');
});
it.each([true,false])('aborts stale results and failures on unmount (success=%s)',async success=>{
  let resolve!:(value:unknown)=>void,reject!:(reason:Error)=>void;
  vi.mocked(readJson).mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));
  const view=render(<DashboardWorkspace/>),signal=vi.mocked(readJson).mock.calls[0]![1]!.signal!;
  view.unmount();expect(signal.aborted).toBe(true);await act(async()=>{if(success)resolve(report());else reject(Error('aborted'));});
});
