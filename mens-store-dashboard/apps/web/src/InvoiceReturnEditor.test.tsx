import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {InvoiceReturnEditor,returnAmount} from './InvoiceReturnEditor.js';
import {invoiceFixture as invoice} from './sale-document.fixture.js';
import {ApiError,readJson} from './store-api.js';
import {CommandScope} from './pending-command.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const complete=vi.fn(),close=vi.fn(),id='88888888-8888-4888-8888-888888888888';
const mount=(revision=false)=>render(<CommandScope.Provider value="invoice-test"><InvoiceReturnEditor sale={invoice} original={revision?invoice.returns[0]:undefined} close={close} complete={complete}/></CommandScope.Provider>);
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}}),click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
beforeEach(()=>{sessionStorage.clear();vi.mocked(readJson).mockReset();complete.mockReset();close.mockReset();});afterEach(cleanup);
function prepare(){change('مرتجع قميص أصلي','1');change('رد CASH','10');change('رد CREDIT','9.95');change('سبب مرتجع الفاتورة','مرتجع بحالة جيدة');click('مراجعة المرتجع');}
it('calculates fractional returns using exact half-up rounding',()=>{
  expect(returnAmount(invoice,[{saleLineId:invoice.lines[0]!.id,quantity:'0.25'}])).toBe(49875n);
  expect(returnAmount({...invoice,lines:[{...invoice.lines[0]!,quantity:'1.0000',total:'0.0001'}]},[{saleLineId:invoice.lines[0]!.id,quantity:'0.5'}])).toBe(1n);
});
it('reviews a split refund, retains fields on back and posts one frozen command',async()=>{
  mount();prepare();expect(screen.getByText('19.9500 ج.م')).toBeVisible();click('رجوع لبيانات المرتجع');expect(screen.getByLabelText('مرتجع قميص أصلي')).toHaveValue('1');click('مراجعة المرتجع');vi.mocked(readJson).mockResolvedValue({id});
  await act(async()=>{const button=screen.getByRole('button',{name:'تأكيد تسجيل المرتجع'});button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});expect(readJson).toHaveBeenCalledOnce();expect(complete).toHaveBeenCalledWith(id);expect(JSON.parse(vi.mocked(readJson).mock.calls[0]![1]!.body as string)).toMatchObject({saleId:invoice.id,payments:[{method:'CASH',amount:'10.0000'},{method:'CREDIT',amount:'9.9500'}]});
});
it('reverses/replaces the selected return using its original quantities and a new current-date document',async()=>{
  mount(true);change('مرتجع قميص أصلي','0.25');change('رد CASH','4.9875');click('مراجعة المرتجع');expect(screen.getByText(/يعكس المرتجع السابق/)).toBeVisible();vi.mocked(readJson).mockResolvedValue({id});click('تأكيد تسجيل المرتجع');await screen.findByRole('heading',{name:'مراجعة المرتجع قبل التسجيل'});await act(async()=>{});expect(readJson).toHaveBeenCalledWith(`/returns/${invoice.returns[0]!.id}/revise`,expect.any(Object));
});
it('rejects invalid, excessive and zero quantities and mismatched payment totals',()=>{
  mount();click('مراجعة المرتجع');expect(screen.getByRole('alert')).toHaveTextContent('اختر أصنافًا');change('مرتجع قميص أصلي','bad');click('مراجعة المرتجع');expect(screen.getByRole('alert')).toHaveTextContent('كمية المرتجع');change('مرتجع قميص أصلي','2');click('مراجعة المرتجع');expect(screen.getByRole('alert')).toHaveTextContent('تتجاوز');change('مرتجع قميص أصلي','1');change('رد CASH','bad');click('مراجعة المرتجع');expect(screen.getByRole('alert')).toHaveTextContent('مبالغ رد القيمة');change('رد CASH','1');change('سبب مرتجع الفاتورة','سبب صحيح');click('مراجعة المرتجع');expect(screen.getByRole('alert')).toHaveTextContent('لازم يساوي');change('مرتجع قميص أصلي','0');change('رد CASH','0');click('مراجعة المرتجع');expect(readJson).not.toHaveBeenCalled();
});
it('recovers an uncertain result after remount using the same refund body and key',async()=>{
  const view=mount();prepare();vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));click('تأكيد تسجيل المرتجع');await screen.findByText(/تعذر تأكيد المرتجع/);const original=vi.mocked(readJson).mock.calls[0]![1];view.unmount();mount();vi.mocked(readJson).mockResolvedValueOnce({id});click('إعادة نفس الطلب المحفوظ');await act(async()=>{});expect(vi.mocked(readJson).mock.calls[1]![1]).toEqual(original);expect(complete).toHaveBeenCalledWith(id);
});
it('handles definitive rejections and confirms discard before closing an edited draft',async()=>{
  mount();prepare();vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,'RETURN_QUANTITY_EXCEEDED'));click('تأكيد تسجيل المرتجع');await screen.findByText(/رفض التسجيل/);click('إغلاق نموذج المرتجع');expect(screen.getByText(/تجاهل بيانات المرتجع/)).toBeVisible();click('استكمال المرتجع');expect(close).not.toHaveBeenCalled();click('إغلاق نموذج المرتجع');click('تجاهل وإغلاق المرتجع');expect(close).toHaveBeenCalledOnce();
});

it('closes a clean form and blocks unreadable saved commands',()=>{
  const view=mount();click('إغلاق نموذج المرتجع');expect(close).toHaveBeenCalledOnce();view.unmount();sessionStorage.setItem('ahmed-store.pending.invoice-test.invoice-return.'+invoice.id,'broken');mount();expect(screen.getByText(/تعذر قراءة الطلب المحفوظ/)).toBeVisible();expect(screen.getByLabelText('مرتجع قميص أصلي')).toBeDisabled();
});
