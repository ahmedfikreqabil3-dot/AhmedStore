import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LivePOS } from './LivePOS.js';
import { ApiError, postSale, saleOptions, type SaleOptions } from './store-api.js';
vi.mock('./store-api.js', async (original) => ({ ...await original<typeof import('./store-api.js')>(), saleOptions: vi.fn(), postSale: vi.fn() }));
const id = 'a62886aa-d435-4145-a551-37b675a86f84';
const options: SaleOptions = { products: [{ id, name: 'قميص', sku: 'SH-1', barcode: '123', salePrice: '0.1000' }, { id: 'b62886aa-d435-4145-a551-37b675a86f84', name: 'بنطلون', sku: 'TR-1', barcode: null, salePrice: '1.0000' }], customers: [{ id, name: 'العميل' }], warehouses: [{ id, name: 'الفرع' }] };
const storageKey = 'ahmed-store.pending-sale.org.user';
beforeEach(() => {
  vi.mocked(saleOptions).mockResolvedValue(options); vi.mocked(postSale).mockResolvedValue({ id: 'posted-sale', total: '0.1000' });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); vi.restoreAllMocks(); });
async function ready() { render(<LivePOS userId="user" organizationId="org"/>); await screen.findByLabelText('فرع البيع'); }
function scan(value = '123') { fireEvent.change(screen.getByLabelText('ابحث عن منتج أو امسح الباركود'), { target: { value } }); fireEvent.keyDown(screen.getByLabelText('ابحث عن منتج أو امسح الباركود'), { key: 'Enter' }); }
function selections() { fireEvent.change(screen.getByLabelText('فرع البيع'), { target: { value: id } }); fireEvent.change(screen.getByLabelText('عميل البيع'), { target: { value: id } }); }
function review() { fireEvent.click(screen.getByRole('button', { name: 'مراجعة وإتمام البيع' })); }

describe('real POS commands', () => {
  it('identifies the selected branch in checkout and payment review without changing a recovered command', async () => {
    await ready();
    expect(within(screen.getByRole('complementary')).getByText('لم يتم اختيار فرع')).toBeVisible();
    selections(); scan(); review();
    expect(within(screen.getByRole('dialog')).getByText('الفرع')).toBeVisible();
    expect(within(screen.getByRole('complementary')).getByText('الفرع', { selector: 'strong' })).toBeVisible();
    expect(postSale).not.toHaveBeenCalled(); cleanup();
    const input = { customerId: id, warehouseId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', occurredAt: new Date().toISOString(), lines: [{ productId: id, quantity: '1', unitPrice: '0.1000', discount: '0' }], payments: [{ method: 'CASH', amount: '0.1' }] };
    sessionStorage.setItem(storageKey, JSON.stringify({ key: 'original-key', input }));
    await ready();
    expect(within(screen.getByRole('complementary')).getByText('فرع الفاتورة المحفوظة غير متاح في القائمة الحالية')).toBeVisible();
    expect(screen.getByLabelText('فرع البيع')).toBeDisabled();
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).input.warehouseId).toBe(input.warehouseId);
    expect(postSale).not.toHaveBeenCalled();
  });
  it('explains branch-specific insufficient stock, preserves the draft, and allows correction', async () => {
    vi.mocked(postSale).mockRejectedValueOnce(new ApiError(409, 'INSUFFICIENT_STOCK'));
    await ready(); selections(); scan(); review(); fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' }));
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('الكمية المطلوبة غير متاحة في الفرع المحدد'));
    expect(screen.getByLabelText('كمية قميص')).toHaveValue(1);
    expect(screen.getByLabelText('فرع البيع')).toBeEnabled();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByText(/تم تسجيل الفاتورة/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'رجوع للفاتورة' }));
    expect(screen.getByRole('button', { name: 'مراجعة وإتمام البيع' })).toBeEnabled();
  });
  it('posts exact amounts and clears the draft only after the server confirms success', async () => {
    await ready(); expect(screen.getByRole('button', { name: 'مراجعة وإتمام البيع' })).toBeDisabled();
    selections(); scan(); review(); fireEvent.click(screen.getByRole('button', { name: 'رجوع للفاتورة' })); review(); fireEvent.click(screen.getByLabelText('إغلاق الدفع')); review();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' }));
    await screen.findByText(/تم تسجيل الفاتورة posted-sale/);
    expect(postSale).toHaveBeenCalledWith(expect.objectContaining({ customerId: id, warehouseId: id, lines: [{ productId: id, quantity: '1', unitPrice: '0.1000', discount: '0.0000' }], payments: [{ method: 'CASH', amount: '0.1000' }] }), expect.any(String));
    expect(sessionStorage.getItem(storageKey)).toBeNull(); expect(screen.getByText('ابدأ بأول صنف')).toBeVisible();
  });
  it('keeps the exact command through an uncertain failure, refresh, and successful retry', async () => {
    vi.mocked(postSale).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce({ id: 'replayed-sale', total: '0.1000' });
    await ready(); selections(); scan(); review(); fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' }));
    await waitFor(() => expect(screen.getByLabelText('فرع البيع')).toBeDisabled());
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('تعذر تأكيد نتيجة الحفظ'));
    const first = vi.mocked(postSale).mock.calls[0]; cleanup();
    await ready(); expect(screen.getByText(/توجد محاولة تسجيل فاتورة/)).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'التحقق وإعادة المحاولة' })); fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' }));
    await screen.findByText(/تم تسجيل الفاتورة replayed-sale/); expect(vi.mocked(postSale).mock.calls[1][1]).toEqual(first[1]);
    expect(vi.mocked(postSale).mock.calls[1][0]).toEqual(first[0]);
  });
  it('allows correcting a definitively rejected command without claiming success', async () => {
    vi.mocked(postSale).mockRejectedValue(new ApiError(409)); await ready(); selections(); scan(); review(); fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' }));
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('رفض الخادم'));
    expect(screen.queryByText(/تم تسجيل الفاتورة/)).not.toBeInTheDocument(); expect(screen.getByLabelText('فرع البيع')).toBeEnabled(); expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
  it('edits a draft, validates discounts and split payments, and allocates the invoice discount exactly', async () => {
    await ready(); selections(); scan(); scan('sh-1'); fireEvent.change(screen.getByLabelText('كمية قميص'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('كمية قميص'), { target: { value: '0' } }); expect(screen.getByLabelText('كمية قميص')).toHaveValue(3);
    scan('TR-1'); scan('sh-1'); fireEvent.change(screen.getByLabelText('كمية قميص'), { target: { value: '3' } }); fireEvent.change(screen.getByLabelText('خصم الفاتورة'), { target: { value: '0.4' } });
    fireEvent.change(screen.getByLabelText('مبلغ الدفعة 1'), { target: { value: '0.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'تقسيم السداد / إضافة دفعة' }));
    fireEvent.change(screen.getByLabelText('مبلغ الدفعة 2'), { target: { value: '0.5' } }); fireEvent.change(screen.getByLabelText('طريقة الدفعة 2'), { target: { value: 'INSTAPAY' } });
    review(); fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' })); await screen.findByText(/تم تسجيل الفاتورة/);
    expect(postSale).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ quantity: '3', discount: '0.3000' }), expect.objectContaining({ discount: '0.1000' })], payments: [{ method: 'CASH', amount: '0.4' }, { method: 'INSTAPAY', amount: '0.5' }] }), expect.any(String));
  });
  it('handles absent and unmatched barcodes, product selection, deletion and invalid allocations', async () => {
    await ready(); selections(); scan('missing'); expect(screen.getByRole('alert')).toHaveTextContent('الباركود غير موجود'); expect(screen.getByText('لا توجد منتجات مطابقة. جرّب كلمة أخرى.')).toBeVisible();
    fireEvent.keyDown(screen.getByLabelText('ابحث عن منتج أو امسح الباركود'), { key: 'a' });
    fireEvent.change(screen.getByLabelText('ابحث عن منتج أو امسح الباركود'), { target: { value: 'قميص' } }); fireEvent.click(screen.getByRole('button', { name: /قميص SH-1/ }));
    fireEvent.change(screen.getByLabelText('خصم الفاتورة'), { target: { value: '-1' } }); expect(screen.getByText(/أدخل خصمًا صحيحًا/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('خصم الفاتورة'), { target: { value: '0' } }); fireEvent.change(screen.getByLabelText('مبلغ الدفعة 1'), { target: { value: '0.05' } }); expect(screen.getByText('مجموع الدفعات يجب أن يساوي الإجمالي تمامًا.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('مبلغ الدفعة 1'), { target: { value: 'bad' } }); expect(screen.getByRole('button', { name: 'مراجعة وإتمام البيع' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('طريقة الدفعة 1'), { target: { value: 'CREDIT' } });
    fireEvent.click(screen.getByRole('button', { name: 'تقسيم السداد / إضافة دفعة' })); fireEvent.click(screen.getByLabelText('حذف الدفعة 2'));
    fireEvent.click(screen.getByLabelText('حذف قميص')); expect(screen.getByText('ابدأ بأول صنف')).toBeVisible();
  });
  it('shows loading errors with retry and ignores responses after unmount', async () => {
    vi.mocked(saleOptions).mockRejectedValueOnce(new ApiError(403)); await readyError(); expect(screen.getByRole('alert')).toHaveTextContent('صلاحيات حسابك');
    fireEvent.click(screen.getByRole('button', { name: 'إعادة تحميل بيانات البيع' })); await screen.findByLabelText('فرع البيع'); cleanup();
    vi.mocked(saleOptions).mockRejectedValueOnce(Error('offline')); render(<LivePOS userId="user" organizationId="org"/>); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل'); cleanup();
    let resolve!: (value: SaleOptions) => void; vi.mocked(saleOptions).mockReturnValue(new Promise((done) => { resolve = done; })); const view = render(<LivePOS userId="user" organizationId="org"/>); view.unmount(); await act(async () => resolve(options));
    let reject!: (reason: unknown) => void; vi.mocked(saleOptions).mockReturnValue(new Promise((_, fail) => { reject = fail; })); const failed = render(<LivePOS userId="user" organizationId="org"/>); failed.unmount(); await act(async () => reject(Error('offline')));
  });
  it('blocks closing the dialog during posting and blocks duplicate confirmation', async () => {
    let done!: (result: { id: string; total: string }) => void; vi.mocked(postSale).mockReturnValue(new Promise((resolve) => { done = resolve; })); await ready();
    const emptyEvent = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(emptyEvent); expect(emptyEvent.defaultPrevented).toBe(false);
    selections(); scan(); const draftEvent = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(draftEvent); expect(draftEvent.defaultPrevented).toBe(true);
    review(); const modal = screen.getByRole('dialog'); const idleCancel = new Event('cancel', { cancelable: true }); modal.dispatchEvent(idleCancel); expect(idleCancel.defaultPrevented).toBe(false);
    act(() => { const confirm = screen.getByRole('button', { name: 'تأكيد البيع والدفع' }); fireEvent.click(confirm); fireEvent.click(confirm); }); const cancel = new Event('cancel', { cancelable: true }); modal.dispatchEvent(cancel); expect(cancel.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'جارٍ تأكيد الحفظ…' })); expect(postSale).toHaveBeenCalledTimes(1); await act(async () => done({ id: 'one', total: '0.1000' }));
  });
  it('never sends a command when recovery storage is unavailable', async () => {
    await ready(); selections(); scan(); review(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('full'); });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد البيع والدفع' })); await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('تعذر تأكيد'));
    expect(postSale).not.toHaveBeenCalled();
  });
});
async function readyError() { render(<LivePOS userId="user" organizationId="org"/>); await screen.findByRole('alert'); }

it('does not discard an uncertain recovered sale when a later retry is rejected',async()=>{
  const input={customerId:id,warehouseId:id,occurredAt:new Date().toISOString(),lines:[{productId:id,quantity:'1',unitPrice:'0.1000',discount:'0'}],payments:[{method:'CASH',amount:'0.1'}]};
  sessionStorage.setItem(storageKey,JSON.stringify({key:'original-key',input}));vi.mocked(postSale).mockRejectedValueOnce(new ApiError(409,'INSUFFICIENT_STOCK'));
  await ready();fireEvent.click(screen.getByRole('button',{name:'إعادة محاولة نفس الفاتورة'}));fireEvent.click(screen.getByRole('button',{name:'تأكيد البيع والدفع'}));
  await waitFor(()=>expect(screen.getAllByRole('alert')[0]).toHaveTextContent('تعذر تأكيد نتيجة الحفظ'));
  expect(JSON.parse(sessionStorage.getItem(storageKey)!).key).toBe('original-key');expect(screen.getByLabelText('فرع البيع')).toBeDisabled();
});
