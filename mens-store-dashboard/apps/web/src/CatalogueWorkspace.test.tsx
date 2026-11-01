import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@ahmed-store/contracts';
import { CatalogueWorkspace, ProductEditor, stockDisplay } from './CatalogueWorkspace.js';
import { ApiError, readJson } from './store-api.js';
import { categoryImportActions, productImportActions } from './App.js';
vi.mock('./store-api.js', async (original) => ({ ...await original<typeof import('./store-api.js')>(), readJson: vi.fn() }));
vi.mock('./App.js', () => ({
  categoryImportActions: { import: vi.fn(async () => 1) }, productImportActions: { import: vi.fn(async () => 2) },
  CategoryImportPanel: ({ actions }: { actions: { import: (file: File) => Promise<number> } }) => <button onClick={() => void actions.import(new File([], 'categories.xlsx'))}>استيراد الفئات التجريبي</button>,
  ProductImportPanel: ({ actions }: { actions: { import: (file: File) => Promise<number> } }) => <button onClick={() => void actions.import(new File([], 'products.xlsx'))}>استيراد المنتجات التجريبي</button>
}));
const id = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const category = { id, organizationId: id, name: 'قمصان', archivedAt: null };
const product: Product = { id, organizationId: id, name: 'قميص أزرق', sku: 'SH-1', barcode: '123', categoryId: id, salePrice: '19.9500', costPrice: '10.0000', active: true, version: 1 };
let products: Product[];
beforeEach(() => {
  products = [product, { ...product, id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', name: 'بنطلون', categoryId: null, barcode: null, active: false }];
  vi.mocked(readJson).mockImplementation(async (path) => {
    if (path === '/products') return { products };
    if (path === '/categories') return { categories: [category] };
    if (path === '/warehouses') return { warehouses: [{ id, name: 'الرئيسي', active: true }, { id: 'other', name: 'القديم', active: false }] };
    return { quantity: '3.0000' };
  });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
async function ready(view: 'products' | 'inventory' = 'products') { render(<CatalogueWorkspace view={view}/>); await screen.findByText('قميص أزرق'); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function fill() { change('اسم المنتج', 'منتج جديد'); change('كود المنتج SKU', 'new-1'); change('سعر البيع', '20.1234'); change('سعر التكلفة', '9'); }
function save() { fireEvent.submit(screen.getByRole('button', { name: 'حفظ المنتج' }).closest('form')!); }
it('keeps quantity precision without showing redundant zeros, including signed and integer balances', () => {
  for (const [raw, shown] of [['0.0000', '0'], ['1200', '1200'], ['3.5000', '3.5'], ['0.0001', '0.0001'], ['-2.2500', '-2.25']]) expect(stockDisplay(raw)).toBe(shown);
});
it('identifies the branch and date for inventory without presenting sale prices as stock information', async () => {
  await ready('inventory');
  const context = screen.getByRole('region', { name: 'نطاق رصيد المخزون' });
  expect(within(context).getByText('اختر فرعًا لعرض رصيده')).toBeVisible();
  expect(within(context).getByText('الرصيد الحالي')).toBeVisible();
  expect(screen.queryByRole('columnheader', { name: 'سعر البيع (ج.م)' })).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'حالة المنتج' })).toBeVisible();
  change('الفرع', id); await screen.findAllByText('3');
  expect(within(context).getByText('الرئيسي')).toBeVisible();
  change('حتى نهاية يوم', '2026-10-01'); expect(within(context).getByText('2026-10-01')).toBeVisible();
  expect(within(context).getByText('حتى نهاية اليوم بتوقيت جهازك')).toBeVisible();
  change('حتى نهاية يوم', ''); expect(within(context).getByText('الرصيد الحالي')).toBeVisible();
});
it('discards a slow stock response from the previous branch after the displayed branch changes', async () => {
  await ready('inventory');
  const original = vi.mocked(readJson).getMockImplementation()!;
  const pending: Array<(value: { quantity: string }) => void> = [];
  vi.mocked(readJson).mockImplementation((path, options) => path.includes('/inventory/stock?') && path.includes(`branchId=${id}`) ? new Promise((done) => { pending.push(done); }) : original(path, options));
  change('الفرع', id); await waitFor(() => expect(pending).toHaveLength(2));
  change('الفرع', 'other'); await screen.findAllByText('3');
  await act(async () => pending.forEach((resolve) => resolve({ quantity: '99.0000' })));
  expect(screen.queryByText('99')).not.toBeInTheDocument();
});
it('rounds displayed prices to two places while keeping all original decimals in the editor and save command', async () => {
  products = [{ ...product, salePrice: '19.9550' }];
  await ready(); expect(screen.getByText('19.96')).toBeVisible();
  expect(screen.getByRole('columnheader', { name: 'سعر البيع (ج.م)' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'جدول المنتجات وأرصدة الفروع' })).toHaveAttribute('tabindex', '0');
  fireEvent.click(screen.getByLabelText('تعديل قميص أزرق'));
  expect(screen.getByLabelText('اسم المنتج')).toHaveFocus();
  expect(screen.getByLabelText('سعر البيع')).toHaveValue('19.9550'); save();
  await screen.findByText('تم حفظ بيانات المنتج بنجاح.');
  expect(readJson).toHaveBeenCalledWith(`/products/${id}`, expect.objectContaining({ body: expect.stringContaining('"salePrice":"19.9550"') }));
});
it('searches names, SKU and barcode, filters categories, and paginates without requesting unselected stock', async () => {
  products = Array.from({ length: 12 }, (_, index) => ({ ...product, id: `product-${index}`, name: `قميص ${index}` }));
  render(<CatalogueWorkspace view="products"/>); await screen.findByText('قميص 0');
  expect(vi.mocked(readJson).mock.calls.some(([path]) => path.includes('/inventory/stock'))).toBe(false);
  fireEvent.click(screen.getByText('التالي')); expect(screen.getByText('قميص 10')).toBeVisible();
  fireEvent.click(screen.getByText('السابق')); expect(screen.getByText('قميص 0')).toBeVisible();
  change('بحث المنتجات', 'not-found'); expect(screen.getByText('لا توجد منتجات مطابقة للبحث والفئة.')).toBeVisible();
  change('بحث المنتجات', '123'); expect(screen.getByText('قميص 0')).toBeVisible();
  change('بحث المنتجات', 'sh-1'); change('الفئة', id); expect(screen.getByText('قميص 0')).toBeVisible();
});
it('loads branch balances and historical local end of day, hides old values when switching, and retries failures', async () => {
  await ready('inventory'); change('الفرع', id); await screen.findAllByText('3');
  change('حتى نهاية يوم', '2026-10-01'); await waitFor(() => expect(vi.mocked(readJson).mock.calls.some(([path]) => path.includes(encodeURIComponent(new Date('2026-10-01T23:59:59.999').toISOString())))).toBe(true));
  vi.mocked(readJson).mockImplementation(async () => { throw Error('offline'); });
  change('الفرع', 'other'); expect(screen.queryByText('3')).not.toBeInTheDocument(); await screen.findAllByText('تعذر تحميل الرصيد');
  fireEvent.click(screen.getByText('تحديث البيانات')); await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحديث البيانات');
});
it('handles initial failure and ignores late catalogue/stock results after unmount or branch change', async () => {
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline')); const failed = render(<CatalogueWorkspace view="products"/>); await screen.findByRole('alert'); failed.unmount();
  let done!: (value: unknown) => void;
  vi.mocked(readJson).mockImplementation(() => new Promise((resolve) => { done = resolve; }));
  const pending = render(<CatalogueWorkspace view="products"/>); pending.unmount(); await act(async () => done({ warehouses: [] }));
  vi.mocked(readJson).mockRejectedValue(Error('offline')); const failure = render(<CatalogueWorkspace view="inventory"/>); failure.unmount(); await act(async () => undefined);
});
it('refreshes after imports and product creation, opens existing records, and cancels without mutation', async () => {
  await ready(); fireEvent.click(screen.getByText('استيراد المنتجات التجريبي')); await waitFor(() => expect(productImportActions.import).toHaveBeenCalled());
  fireEvent.click(screen.getByText('استيراد الفئات التجريبي')); await waitFor(() => expect(categoryImportActions.import).toHaveBeenCalled());
  fireEvent.click(screen.getByText('إضافة منتج')); fill(); save(); await screen.findByText('تم حفظ بيانات المنتج بنجاح.');
  expect(readJson).toHaveBeenCalledWith('/products', expect.objectContaining({ method: 'POST', body: expect.stringContaining('NEW-1') }));
  fireEvent.click(screen.getByLabelText('تعديل قميص أزرق')); expect(screen.getByLabelText('اسم المنتج')).toHaveValue(product.name);
  fireEvent.click(screen.getByText('إلغاء')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('validates exact decimal input and preserves edits on every business or connection failure', async () => {
  const saved = vi.fn(); render(<ProductEditor product={product} categories={[category]} onClose={vi.fn()} onSaved={saved}/>);
  change('سعر البيع', '-1'); save(); expect(screen.getByRole('alert')).toHaveTextContent('راجع الاسم');
  fill(); change('الباركود', '456'); change('الفئة', id);
  for (const code of ['VERSION_CONFLICT', 'PRODUCT_NOT_FOUND', 'SKU_EXISTS', 'BARCODE_EXISTS', 'CATEGORY_UNAVAILABLE', 'PRODUCT_CONFLICT', 'UNKNOWN']) {
    vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409, code)); save(); await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المنتج' })).toBeEnabled()); expect(screen.getByRole('alert')).toBeVisible(); expect(screen.getByLabelText('اسم المنتج')).toHaveValue('منتج جديد');
  }
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline')); save(); await screen.findByText('تعذر الاتصال. راجع القائمة قبل إعادة المحاولة.');
  vi.mocked(readJson).mockResolvedValueOnce({}); save(); await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(readJson).toHaveBeenLastCalledWith(`/products/${id}`, expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"version":1') }));
});
it('allows closing or Escape when idle but preserves a pending save', async () => {
  const close = vi.fn(); render(<ProductEditor product={{ ...product, barcode: null, categoryId: null }} categories={[]} onClose={close} onSaved={vi.fn()}/>);
  fireEvent.click(screen.getByLabelText('إغلاق نموذج المنتج')); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })); expect(close).toHaveBeenCalledTimes(2);
  vi.mocked(readJson).mockReturnValueOnce(new Promise(() => {})); save();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })); expect(close).toHaveBeenCalledTimes(2); expect(screen.getByText('جارٍ الحفظ…')).toBeDisabled();
});

