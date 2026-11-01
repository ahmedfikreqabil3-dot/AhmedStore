import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, currentUser, decimal, displayMoney, loadAttempt, postSale, readJson, saleOptions, saleRejectionMessage, signIn, signOut, units } from './store-api.js';

const user = { id: 'a62886aa-d435-4145-a551-37b675a86f84', organizationId: 'ce5435a8-93e0-48d8-87b5-cdb58e45f92a', name: 'أحمد', email: 'admin@example.com', role: 'ADMIN' };
const input = { customerId: user.id, warehouseId: user.id, lines: [{ productId: user.id, quantity: '1', unitPrice: '0.1000', discount: '0' }], payments: [{ method: 'CASH', amount: '0.1000' }], occurredAt: new Date().toISOString() };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear(); });

describe('live store API and precise amounts', () => {
  it.each([null, 'bad gateway', {}, { error: 409 }, { error: 'INSUFFICIENT_STOCK' }])('preserves only a structured error code from %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => body }));
    const error = await readJson('/sales').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '' });
  });
  it.each([
    ['INSUFFICIENT_STOCK', 'الكمية المطلوبة غير متاحة في الفرع المحدد'],
    ['CUSTOMER_UNAVAILABLE', 'العميل المحدد غير متاح'],
    ['WAREHOUSE_UNAVAILABLE', 'الفرع المحدد غير متاح'],
    ['PRODUCT_UNAVAILABLE', 'أحد أصناف الفاتورة غير متاح'],
    ['LINE_DISCOUNT_EXCEEDS_SUBTOTAL', 'الخصم يتجاوز قيمة الأصناف'],
    ['PAYMENT_TOTAL_MISMATCH', 'مجموع الدفعات لا يطابق إجمالي الفاتورة'],
    ['CREDIT_LIMIT_EXCEEDED', 'المبلغ الآجل يتجاوز حد ائتمان العميل']
  ])('explains the actionable sale failure %s', (code, message) => {
    expect(saleRejectionMessage(new ApiError(409, code))).toContain(message);
  });
  it('does not display arbitrary server details or prototype property names as a user error', () => {
    expect(saleRejectionMessage(new ApiError(409, '__proto__'))).toContain('رفض الخادم');
    expect(saleRejectionMessage(new ApiError(409, '<script>private stack</script>'))).not.toContain('private stack');
  });
  it('uses secure-session credentials and preserves exact request input and idempotency key', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'sale', total: '0.1000' }) });
    vi.stubGlobal('fetch', fetcher);
    await readJson('/health');
    await postSale({ ...input, payments: [{ method: 'CASH', amount: '0.1000' }], occurredAt: new Date(input.occurredAt) }, 'same-key');
    expect(fetcher).toHaveBeenCalledWith('/api/v1/sales', expect.objectContaining({ credentials: 'include', headers: expect.objectContaining({ 'idempotency-key': 'same-key' }), body: JSON.stringify(input) }));
  });
  it('restores a validated identity, handles missing sessions, and surfaces availability failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ user }) }).mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: false, status: 503 }));
    expect(await currentUser()).toEqual(user); expect(await currentUser()).toBeNull(); await expect(currentUser()).rejects.toMatchObject({ status: 503 });
  });
  it('logs in, rejects invalid identity payloads and does not clear a failed logout', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ user }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ user: {} }) }).mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetcher);
    expect(await signIn(user.organizationId, user.email, 'password')).toEqual(user);
    await expect(signIn('id', 'mail', 'bad')).rejects.toThrow();
    await expect(signOut()).rejects.toBeInstanceOf(ApiError); await signOut();
    expect(fetcher).toHaveBeenLastCalledWith('/api/v1/auth/logout', { credentials: 'include', method: 'POST' });
  });
  it('loads the dedicated sale-only options endpoint and propagates denied reads', async () => {
    const payload = { products: [{ id: 'a', name: 'Shirt', sku: 'SH-1', barcode: null, salePrice: '10.0000' }], customers: [{ id: 'c', name: 'Customer' }], warehouses: [{ id: 'w', name: 'Branch' }] };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetcher);
    expect(await saleOptions()).toEqual(payload);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/pos/options', { credentials: 'include' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(saleOptions()).rejects.toMatchObject({ status: 403 });
  });
  it('calculates exact decimal units and rounds only the displayed amount', () => {
    expect(units('1')).toBe(10000n); expect(units('0.0001')).toBe(1n); expect(units('12.34')).toBe(123400n);
    for (const value of ['', '-1', '1.23456', '1e3', 'NaN']) expect(units(value)).toBeNull();
    expect(decimal(123456n)).toBe('12.3456'); expect(decimal(0n)).toBe('0.0000');
    expect(displayMoney(12345678n)).toBe('1,234.57'); expect(displayMoney(49n)).toBe('0.00'); expect(displayMoney(50n)).toBe('0.01');
  });
  it('restores only valid pending sale commands and tolerates damaged or unavailable browser storage', () => {
    expect(loadAttempt('pending')).toBeNull();
    for (const raw of ['null', '1', '{}', '{"key":1}', '{"key":""}', '{"key":"x"}', '{"key":"x","input":{}}', 'broken']) { sessionStorage.setItem('pending', raw); expect(loadAttempt('pending')).toBeNull(); }
    sessionStorage.setItem('pending', JSON.stringify({ key: 'same-key', input })); expect(loadAttempt('pending')).toMatchObject({ key: 'same-key', input: { occurredAt: expect.any(Date) } });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('denied'); }); expect(loadAttempt('pending')).toBeNull();
  });
});
