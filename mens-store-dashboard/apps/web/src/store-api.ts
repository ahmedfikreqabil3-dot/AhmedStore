import { createSaleSchema, publicUserSchema, type CreateSaleInput, type PublicUser } from '@ahmed-store/contracts';
import { CommandHttpError } from './http-error.js';

export class ApiError extends CommandHttpError {
  constructor(status: number, readonly code = '') { super(`API_${status}`,status); }
}
export async function readJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: 'include' });
  if (!response.ok) {
    let code = '';
    try {
      const body: unknown = await response.json();
      if (body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string') code = body.error;
    } catch { /* A proxy or unavailable service may return HTML instead of JSON. */ }
    throw new ApiError(response.status, code);
  }
  return response.json() as Promise<T>;
}
export async function currentUser(): Promise<PublicUser | null> {
  try { return publicUserSchema.parse((await readJson<{ user: PublicUser }>('/auth/me')).user); }
  catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
}
export async function signIn(organizationId: string, email: string, password: string) {
  return publicUserSchema.parse((await readJson<{ user: PublicUser }>('/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, email, password })
  })).user);
}
export async function signOut() {
  const response = await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status);
}
export type SaleProduct = { id: string; name: string; sku: string; barcode: string | null; salePrice: string };
export type SaleOptions = { products: SaleProduct[]; customers: Array<{ id: string; name: string }>; warehouses: Array<{ id: string; name: string }> };
export async function saleOptions(): Promise<SaleOptions> {
  return readJson<SaleOptions>('/pos/options');
}
export async function postSale(input: CreateSaleInput, key: string): Promise<{ id: string; total: string }> {
  return readJson('/sales', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(input) });
}
const saleRejections = new Map([
  ['CREDIT_LIMIT_EXCEEDED', 'المبلغ الآجل يتجاوز حد ائتمان العميل بعد إضافة رصيده المستحق. قلّل الآجل أو اختر طريقة سداد أخرى.'],
  ['INSUFFICIENT_STOCK', 'الكمية المطلوبة غير متاحة في الفرع المحدد. اختر فرعًا به رصيد أو قلّل الكمية ثم أعد المحاولة.'],
  ['CUSTOMER_UNAVAILABLE', 'العميل المحدد غير متاح أو غير نشط. اختر عميلًا آخر ثم أعد المحاولة.'],
  ['WAREHOUSE_UNAVAILABLE', 'الفرع المحدد غير متاح أو غير نشط. اختر فرعًا آخر ثم أعد المحاولة.'],
  ['PRODUCT_UNAVAILABLE', 'أحد أصناف الفاتورة غير متاح أو غير نشط. احذفه من الفاتورة واختر منتجًا متاحًا.'],
  ['LINE_DISCOUNT_EXCEEDS_SUBTOTAL', 'الخصم يتجاوز قيمة الأصناف. قلّل الخصم ثم أعد المحاولة.'],
  ['PAYMENT_TOTAL_MISMATCH', 'مجموع الدفعات لا يطابق إجمالي الفاتورة. صحّح مبالغ السداد ثم أعد المحاولة.']
]);
export function saleRejectionMessage(error: ApiError) {
  return saleRejections.get(error.code) ?? 'رفض الخادم الفاتورة. راجع المخزون وصلاحية العميل والفرع ومبالغ السداد قبل المحاولة مجددًا.';
}
export function units(value: string): bigint | null {
  if (!/^\d{1,15}(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
export function decimal(value: bigint) { return `${value / 10000n}.${(value % 10000n).toString().padStart(4, '0')}`; }
export function displayMoney(value: bigint) {
  // Round the display to two places; transaction amounts retain four decimals.
  const cents = (value + 50n) / 100n;
  return `${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2, '0')}`;
}
export type SaleAttempt = { key: string; input: CreateSaleInput };
export function loadAttempt(storageKey: string): SaleAttempt | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (!raw || typeof raw !== 'object' || !('key' in raw) || typeof raw.key !== 'string' || !raw.key || !('input' in raw)) return null;
    const input = createSaleSchema.safeParse(raw.input);
    return input.success ? { key: raw.key, input: input.data } : null;
  } catch { return null; }
}
