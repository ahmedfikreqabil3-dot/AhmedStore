import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SalesWorkspace} from './SalesWorkspace.js';
import {readJson} from './store-api.js';
vi.mock('./store-api.js',()=>({readJson:vi.fn()}));
vi.mock('./InvoiceDocument.js',()=>({InvoiceDocument:({saleId,canReturn}:{saleId:string;canReturn:boolean})=><p>فاتورة {saleId} · {canReturn?'مرتجع متاح':'عرض فقط'}</p>}));
const id='33333333-3333-4333-8333-333333333333',page={sales:[{id,customerName:'عميل الاختبار',warehouseName:'فرع الاختبار',total:'39.9000',status:'POSTED',occurredAt:'2026-11-01'}],total:26,limit:25,offset:0};
beforeEach(()=>vi.mocked(readJson).mockReset().mockResolvedValue(page));afterEach(cleanup);
it('filters, pages and opens authorized full invoice details',async()=>{
  render(<SalesWorkspace canReturn/>);await screen.findByText('عميل الاختبار');fireEvent.click(screen.getByRole('button',{name:'فتح فاتورة '+id}));expect(screen.getByText(/مرتجع متاح/)).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'فواتير تالية'}));await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('offset=25'),expect.any(Object)));
  vi.mocked(readJson).mockResolvedValue({...page,offset:25});fireEvent.click(screen.getByRole('button',{name:'تحديث سجل البيع'}));await waitFor(()=>expect(screen.getByRole('button',{name:'فواتير سابقة'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'فواتير سابقة'}));
  fireEvent.change(screen.getByLabelText('بداية سجل البيع'),{target:{value:'2027-01-01'}});fireEvent.click(screen.getByRole('button',{name:'عرض فواتير البيع'}));expect(screen.getByRole('alert')).toHaveTextContent('حدد فترة صحيحة');fireEvent.change(screen.getByLabelText('بداية سجل البيع'),{target:{value:'2026-01-01'}});fireEvent.change(screen.getByLabelText('نهاية سجل البيع'),{target:{value:'2026-12-31'}});fireEvent.click(screen.getByRole('button',{name:'عرض فواتير البيع'}));await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('from=2026-01-01'),expect.any(Object)));
});
it('supports read-only finance, empty results and retrying a failed read',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));render(<SalesWorkspace canReturn={false}/>);await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'تحديث سجل البيع'}));await screen.findByText('عميل الاختبار');fireEvent.click(screen.getByRole('button',{name:'فتح فاتورة '+id}));expect(screen.getByText(/عرض فقط/)).toBeVisible();vi.mocked(readJson).mockResolvedValueOnce({...page,sales:[],total:0});fireEvent.click(screen.getByRole('button',{name:'تحديث سجل البيع'}));await screen.findByText('لا توجد فواتير للفترة المحددة.');
});
it('ignores delayed responses after unmount',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const view=render(<SalesWorkspace canReturn/>);view.unmount();await act(async()=>resolve(page));expect(screen.queryByText('عميل الاختبار')).not.toBeInTheDocument();
});
