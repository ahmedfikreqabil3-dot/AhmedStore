import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {InvoiceDocument} from './InvoiceDocument.js';
import {invoiceFixture as invoice} from './sale-document.fixture.js';
import {readJson} from './store-api.js';
import {printSaleDocument} from './invoice-print.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
vi.mock('./invoice-print.js',()=>({printSaleDocument:vi.fn()}));
vi.mock('./InvoiceReturnEditor.js',()=>({InvoiceReturnEditor:({close,complete}:{close:()=>void;complete:(id:string)=>void})=><div><button onClick={close}>إغلاق محرر الاختبار</button><button onClick={()=>complete(invoice.id)}>حفظ مرتجع الاختبار</button></div>}));
beforeEach(()=>{vi.mocked(readJson).mockReset().mockResolvedValue(invoice);vi.mocked(printSaleDocument).mockReset().mockResolvedValue();});afterEach(cleanup);
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
it('shows immutable lines, payments and return history with printing and return correction',async()=>{
  render(<InvoiceDocument saleId={invoice.id} canReturn/>);await screen.findByRole('heading',{name:'تفاصيل فاتورة البيع'});await waitFor(()=>expect(screen.getByRole('heading',{name:'تفاصيل فاتورة البيع'})).toHaveFocus());expect(screen.getByText('SHIRT')).toBeVisible();click('طباعة الفاتورة A4');await waitFor(()=>expect(printSaleDocument).toHaveBeenCalledWith(invoice,'a4',undefined));click('طباعة إيصال 80mm');click('طباعة مرتجع '+invoice.returns[0]!.id);expect(printSaleDocument).toHaveBeenLastCalledWith(invoice,'80mm',invoice.returns[0]!.id);
  click('تسجيل مرتجع لهذه الفاتورة');click('إغلاق محرر الاختبار');click('تصحيح مرتجع '+invoice.returns[0]!.id);click('حفظ مرتجع الاختبار');await screen.findByText(/تم تسجيل المرتجع/);
});
it('keeps finance read-only, handles absent history and safely reports print/read failures',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));render(<InvoiceDocument saleId={invoice.id}/>);await screen.findByRole('alert');click('إعادة تحميل الفاتورة');await screen.findByText('SHIRT');expect(screen.queryByRole('button',{name:'تسجيل مرتجع لهذه الفاتورة'})).not.toBeInTheDocument();vi.mocked(printSaleDocument).mockRejectedValueOnce(Error('blocked'));click('طباعة الفاتورة A4');await screen.findByText(/اسمح بالنوافذ/);
  cleanup();vi.mocked(readJson).mockResolvedValueOnce({...invoice,status:'VOIDED',returns:[]});render(<InvoiceDocument saleId={invoice.id} canReturn/>);await screen.findByText('لا توجد مرتجعات مسجلة لهذه الفاتورة.');expect(screen.queryByRole('button',{name:'تسجيل مرتجع لهذه الفاتورة'})).not.toBeInTheDocument();
});

it('preserves voided return history and exposes correction only on the posted replacement',async()=>{
  const old=invoice.returns[0]!,replacement={...old,id:'88888888-8888-4888-8888-888888888888',replacesReturnId:old.id};vi.mocked(readJson).mockResolvedValueOnce({...invoice,returns:[{...old,status:'VOIDED'},replacement]});render(<InvoiceDocument saleId={invoice.id} canReturn/>);await screen.findByText(/بديل للمرتجع/);expect(screen.queryByRole('button',{name:'تصحيح مرتجع '+old.id})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'تصحيح مرتجع '+replacement.id})).toBeVisible();
});
