import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, CategoryImportPanel, HistoricalInventory, LoadedProductCatalogue, LoginPanel, ProductCatalogue, ProductTable, ProductTableRow, PurchaseBarcodeEntry, SalesHistory, SalesHistoryExport, categoryImportActions, downloadSalesHistoryXlsx, loadHistoricalStock, loadInventoryOptions, loadProductCatalogue, loadSalesHistory, loginUser } from './App.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const emptySales = async () => ({ sales: [], total: 0 });

describe('App', () => {
  it('renders the Arabic product-management shell and an empty state', async () => {
    render(<App loadSales={emptySales} />);

    expect(screen.getByRole('heading', { name: 'أحمد ستور' })).toBeInTheDocument();
    expect(screen.getByText('إدارة المنتجات والمخزون')).toBeInTheDocument();
    expect(screen.getByText('جارٍ تحميل كتالوج المنتجات…')).toBeInTheDocument();
    expect(await screen.findByText('اختر فاتورة لعرض تفاصيلها.')).toBeInTheDocument();
  });

  it('logs in through the secure session endpoint and reloads the app session', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, json: async () => url.includes('/auth/login') ? ({ user: { id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' } }) : url.includes('/products') ? ({ products: [] }) : url.includes('/categories') ? ({ categories: [] }) : url.includes('/warehouses') ? ({ warehouses: [] }) : ({ sales: [], total: 0 }) })); vi.stubGlobal('fetch', fetchMock);
    await expect(loginUser('organization-1', 'ahmed@example.com', 'password')).resolves.toMatchObject({ name: 'أحمد', role: 'ADMIN' }); expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    render(<App login={async () => ({ id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' })} loadSales={emptySales} />); fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'password' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' })); expect(await screen.findByText('مرحباً، أحمد')).toBeInTheDocument();
  });

  it('keeps login disabled until complete and explains rejected credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 })); await expect(loginUser('organization-1', 'ahmed@example.com', 'bad')).rejects.toThrow('LOGIN_401');
    render(<LoginPanel login={async () => { throw Error('bad'); }} onSuccess={() => undefined} />); expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeDisabled(); fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'bad' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تسجيل الدخول');
  });

  it('shows separate product details, barcode, category, pricing, and stock columns', () => {
    render(<ProductTable products={[{ id: 'product-1', name: 'قميص أوكسفورد', sku: 'OX-1', barcode: '123456', category: 'قمصان', salePrice: '150.0000', stock: '7.0000', warehouse: 'الرئيسي' }]} />);

    expect(screen.getByRole('table', { name: 'جدول المنتجات' })).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();
    expect(screen.getByText('قمصان')).toBeInTheDocument();
    expect(screen.getByText('7.0000')).toBeInTheDocument();
  });

  it('uses clear fallbacks when a barcode or category is not assigned', () => {
    render(<ProductTable products={[{ id: 'product-2', name: 'منتج جديد', sku: 'NEW-1', barcode: null, category: null, salePrice: '10.0000', stock: '0.0000', warehouse: 'الرئيسي' }]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('غير مصنفة')).toBeInTheDocument();
  });

  it('filters and paginates the product catalogue without losing barcode details', () => {
    const products = [
      { id: '1', name: 'قميص أزرق', sku: 'SH-1', barcode: '100', category: 'قمصان', salePrice: '10.0000', stock: '1.0000', warehouse: 'الرئيسي' },
      { id: '2', name: 'قميص أبيض', sku: 'SH-2', barcode: '101', category: 'قمصان', salePrice: '20.0000', stock: '2.0000', warehouse: 'الرئيسي' },
      { id: '3', name: 'بنطال', sku: 'TR-1', barcode: '200', category: 'بناطيل', salePrice: '30.0000', stock: '3.0000', warehouse: 'الرئيسي' },
      { id: '4', name: 'بدون فئة', sku: 'NO-1', barcode: null, category: null, salePrice: '40.0000', stock: '4.0000', warehouse: 'الرئيسي' }
    ];
    render(<ProductCatalogue products={products} pageSize={2} />);
    expect(screen.getByText('قميص أزرق')).toBeInTheDocument();
    expect(screen.queryByText('بنطال')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('بنطال')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByText('قميص أزرق')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث المنتجات'), { target: { value: '101' } });
    expect(screen.getByText('قميص أبيض')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث المنتجات'), { target: { value: 'غير موجود' } });
    expect(screen.getByText('لا توجد منتجات مطابقة للفلتر الحالي.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث المنتجات'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('تصفية الفئة'), { target: { value: 'بناطيل' } });
    expect(screen.getByText('بنطال')).toBeInTheDocument();
    expect(screen.queryByText('قميص أبيض')).not.toBeInTheDocument();
  });

  it('closes the payment dialog only after a confirmed sale is posted', async () => {
    const postSale = async () => undefined;
    render(<App postSale={postSale} loadSales={emptySales} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'فتح الدفع' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('supports the default POS posting callback for the shell preview', async () => {
    render(<App loadSales={emptySales} />);
    fireEvent.click(screen.getByRole('button', { name: 'فتح الدفع' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the payment dialog open and explains a failed posting attempt', async () => {
    render(<App postSale={async () => { throw Error('offline'); }} loadSales={emptySales} />);
    fireEvent.click(screen.getByRole('button', { name: 'فتح الدفع' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر إتمام الفاتورة');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens sales details only explicitly and clears stale selection after a history refresh', async () => {
    const first = [{ id: 'sale-1', customer: 'محمد علي', total: '100.0000' }];
    const view = render(<SalesHistory sales={first} />);
    expect(screen.queryByLabelText('تفاصيل الفاتورة')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'عرض التفاصيل' }));
    expect(screen.getByLabelText('تفاصيل الفاتورة')).toHaveTextContent('محمد علي');
    view.rerender(<SalesHistory sales={[]} />);
    await waitFor(() => expect(screen.queryByLabelText('تفاصيل الفاتورة')).not.toBeInTheDocument());
    expect(screen.getByText('اختر فاتورة لعرض تفاصيلها.')).toBeInTheDocument();
  });

  it('adds a recognized purchase barcode and rejects an unknown scan', () => {
    const added: string[] = [];
    render(<PurchaseBarcodeEntry products={[{ id: 'product-1', barcode: '123456', name: 'قميص' }]} onAdd={(product) => added.push(product.id)} />);
    const input = screen.getByLabelText('باركود المشتريات');
    fireEvent.change(input, { target: { value: 'unknown' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }));
    expect(screen.getByRole('alert')).toHaveTextContent('الباركود غير معروف');
    expect(added).toEqual([]);
    fireEvent.change(input, { target: { value: ' 123456 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(added).toEqual(['product-1']);
    expect(input).toHaveValue('');
  });

  it('keeps the catalogue shell scanner callback usable', () => {
    render(<App loadSales={emptySales} />);
    const input = screen.getByLabelText('باركود المشتريات');
    fireEvent.change(input, { target: { value: 'PREVIEW-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }));
    expect(input).toHaveValue('');
  });

  it('loads real sales history through the authenticated browser API client', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sales: [{ id: 'sale-1', customerName: 'محمد', total: '100.0000' }], total: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadSalesHistory()).resolves.toEqual({ sales: [{ id: 'sale-1', customer: 'محمد', total: '100.0000' }], total: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sales?limit=50&offset=0', { credentials: 'include' });
  });

  it('shows a clear error when the sales history cannot be loaded', async () => {
    render(<App loadSales={async () => { throw Error('unauthorized'); }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل سجل المبيعات');
  });

  it('rejects an unsuccessful history HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(loadSalesHistory()).rejects.toThrow('SALES_HISTORY_401');
  });

  it('does not update an unmounted sales-history screen after a late response', async () => {
    let resolve!: (value: { sales: []; total: number }) => void;
    const view = render(<App loadSales={() => new Promise((done) => { resolve = done; })} />);
    view.unmount();
    resolve({ sales: [], total: 0 });
    await Promise.resolve();
  });

  it('downloads the native Excel export using the authenticated browser session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['xlsx']) });
    const createObjectUrl = vi.fn().mockReturnValue('blob:history'); const revokeObjectUrl = vi.fn(); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    await downloadSalesHistoryXlsx();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reports/sales/export.xlsx', { credentials: 'include' }); expect(createObjectUrl).toHaveBeenCalled(); expect(click).toHaveBeenCalled(); expect(revokeObjectUrl).toHaveBeenCalledWith('blob:history');
    click.mockRestore();
  });

  it('rejects an unsuccessful Excel export response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(downloadSalesHistoryXlsx()).rejects.toThrow('SALES_EXPORT_403');
  });

  it('prevents duplicate Excel exports and reports export errors', async () => {
    let resolve!: () => void; const deferred = new Promise<void>((done) => { resolve = done; }); const exportFile = vi.fn(() => deferred);
    const view = render(<SalesHistoryExport onExport={exportFile} />);
    fireEvent.click(screen.getByRole('button', { name: 'تصدير Excel' }));
    expect(screen.getByRole('button')).toBeDisabled();
    resolve(); await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    view.rerender(<SalesHistoryExport onExport={async () => { throw Error('forbidden'); }} />);
    fireEvent.click(screen.getByRole('button', { name: 'تصدير Excel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تصدير ملف Excel');
  });

  it('downloads the category template and sends selected files for preview and atomic import', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => url.includes('template') ? Promise.resolve({ ok: true, blob: async () => new Blob(['template']) }) : url.includes('preview') ? Promise.resolve({ ok: true, json: async () => ({ valid: true, rows: [{ row: 2, name: 'قمصان' }], errors: [] }) }) : Promise.resolve({ ok: true, json: async () => ({ imported: 1 }) })); const createObjectUrl = vi.fn().mockReturnValue('blob:template'); const revokeObjectUrl = vi.fn(); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    render(<CategoryImportPanel actions={categoryImportActions} />); fireEvent.click(screen.getByRole('button', { name: 'تنزيل النموذج' })); await waitFor(() => expect(createObjectUrl).toHaveBeenCalled());
    const file = new File(['xlsx'], 'categories.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); fireEvent.change(screen.getByLabelText('ملف Excel للفئات'), { target: { files: [file] } }); fireEvent.click(screen.getByRole('button', { name: 'فحص الملف' })); expect(await screen.findByRole('status')).toHaveTextContent('1 صف جاهز'); fireEvent.click(screen.getByRole('button', { name: 'استيراد الفئات' })); expect(await screen.findByRole('alert')).toHaveTextContent('تم استيراد 1 فئة'); expect(fetchMock).toHaveBeenCalledWith('/api/v1/categories/import.xlsx', expect.objectContaining({ body: file })); click.mockRestore();
  });

  it('shows validation and transport errors and prevents import without a valid preview', async () => {
    const file = new File(['xlsx'], 'categories.xlsx'); const actions = { downloadTemplate: async () => { throw Error('offline'); }, preview: async () => { throw Error('bad'); }, import: async () => { throw Error('bad'); } };
    const view = render(<CategoryImportPanel actions={actions} />); fireEvent.change(screen.getByLabelText('ملف Excel للفئات'), { target: { files: [] } }); expect(screen.getByRole('button', { name: 'فحص الملف' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'تنزيل النموذج' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تنزيل النموذج'); fireEvent.change(screen.getByLabelText('ملف Excel للفئات'), { target: { files: [file] } }); fireEvent.click(screen.getByRole('button', { name: 'فحص الملف' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('تعذر فحص ملف Excel'));
    view.rerender(<CategoryImportPanel actions={{ ...actions, preview: async () => ({ valid: false, rows: [], errors: [{ row: 2, message: 'INVALID_NAME' }] }) }} />); fireEvent.change(screen.getByLabelText('ملف Excel للفئات'), { target: { files: [file] } }); fireEvent.click(screen.getByRole('button', { name: 'فحص الملف' })); expect(await screen.findByRole('alert')).toHaveTextContent('صف 2: INVALID_NAME'); expect(screen.getByRole('button', { name: 'استيراد الفئات' })).toBeDisabled();
    view.rerender(<CategoryImportPanel actions={{ ...actions, preview: async () => ({ valid: true, rows: [{ row: 2, name: 'قمصان' }], errors: [] }) }} />); fireEvent.change(screen.getByLabelText('ملف Excel للفئات'), { target: { files: [file] } }); fireEvent.click(screen.getByRole('button', { name: 'فحص الملف' })); await screen.findByRole('status'); fireEvent.click(screen.getByRole('button', { name: 'استيراد الفئات' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر استيراد الفئات');
  });

  it('rejects failed template, preview, and import API responses', async () => {
    const file = new File(['xlsx'], 'categories.xlsx'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(categoryImportActions.downloadTemplate()).rejects.toThrow('CATEGORY_IMPORT_500'); await expect(categoryImportActions.preview(file)).rejects.toThrow('CATEGORY_PREVIEW_500'); await expect(categoryImportActions.import(file)).rejects.toThrow('CATEGORY_IMPORT_500');
  });

  it('loads inventory options and branch-scoped historical stock from the API', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ products: [{ id: 'product-1', name: 'قميص' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ warehouses: [{ id: 'branch-1', name: 'الرئيسي' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ quantity: '7.0000' }) }); vi.stubGlobal('fetch', fetchMock);
    await expect(loadInventoryOptions()).resolves.toEqual({ products: [{ id: 'product-1', name: 'قميص' }], branches: [{ id: 'branch-1', name: 'الرئيسي' }] }); await expect(loadHistoricalStock('product 1', 'branch/1', '2026-10-09')).resolves.toBe('7.0000'); expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('branchId=branch%2F1'), { credentials: 'include' });
  });

  it('rejects unavailable inventory option and historical-stock responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false, status: 403 })); await expect(loadInventoryOptions()).rejects.toThrow('INVENTORY_OPTIONS_UNAVAILABLE'); await expect(loadInventoryOptions()).rejects.toThrow('INVENTORY_OPTIONS_UNAVAILABLE'); await expect(loadHistoricalStock('product', 'branch', '2026-10-09')).rejects.toThrow('STOCK_403');
  });

  it('filters historical inventory by selected product, branch, and date', async () => {
    const stock = vi.fn().mockResolvedValue('5.0000'); render(<HistoricalInventory loadOptions={async () => ({ products: [{ id: 'product-1', name: 'قميص' }], branches: [{ id: 'branch-1', name: 'الرئيسي' }] })} loadStock={stock} />); await screen.findByRole('button', { name: 'عرض الرصيد' }); fireEvent.change(screen.getByLabelText('منتج المخزون'), { target: { value: 'product-1' } }); fireEvent.change(screen.getByLabelText('فرع المخزون'), { target: { value: 'branch-1' } }); fireEvent.change(screen.getByLabelText('تاريخ المخزون'), { target: { value: '2026-10-09' } }); fireEvent.click(screen.getByRole('button', { name: 'عرض الرصيد' })); expect(await screen.findByText('الرصيد: 5.0000')).toBeInTheDocument(); expect(stock).toHaveBeenCalledWith('product-1', 'branch-1', '2026-10-09');
  });

  it('explains option-loading and stock-loading failures without showing stale balance', async () => {
    const view = render(<HistoricalInventory loadOptions={async () => { throw Error('offline'); }} />); expect(await screen.findByRole('status')).toHaveTextContent('تعذر تحميل المنتجات والفروع'); view.rerender(<HistoricalInventory loadOptions={async () => ({ products: [{ id: 'product-1', name: 'قميص' }], branches: [{ id: 'branch-1', name: 'الرئيسي' }] })} loadStock={async () => { throw Error('offline'); }} />); await screen.findByLabelText('منتج المخزون'); fireEvent.change(screen.getByLabelText('منتج المخزون'), { target: { value: 'product-1' } }); fireEvent.change(screen.getByLabelText('فرع المخزون'), { target: { value: 'branch-1' } }); fireEvent.change(screen.getByLabelText('تاريخ المخزون'), { target: { value: '2026-10-09' } }); fireEvent.click(screen.getByRole('button', { name: 'عرض الرصيد' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل الرصيد التاريخي');
  });

  it('does not update unmounted inventory options after a late load', async () => { let resolve!: (value: { products: []; branches: [] }) => void; const view = render(<HistoricalInventory loadOptions={() => new Promise((done) => { resolve = done; })} />); view.unmount(); resolve({ products: [], branches: [] }); await Promise.resolve(); });

  it('loads products with their Settings category names into the catalogue table', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ products: [{ id: 'product-1', name: 'قميص', sku: 'SH-1', barcode: '123', categoryId: 'category-1', salePrice: '100.0000' }, { id: 'product-2', name: 'بدون فئة', sku: 'NO-1', barcode: null, categoryId: null, salePrice: '10.0000' }, { id: 'product-3', name: 'فئة مؤرشفة', sku: 'OLD-1', barcode: null, categoryId: 'missing-category', salePrice: '20.0000' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ categories: [{ id: 'category-1', name: 'قمصان' }] }) }));
    await expect(loadProductCatalogue()).resolves.toEqual([{ id: 'product-1', name: 'قميص', sku: 'SH-1', barcode: '123', category: 'قمصان', salePrice: '100.0000', stock: '—', warehouse: '—' }, { id: 'product-2', name: 'بدون فئة', sku: 'NO-1', barcode: null, category: null, salePrice: '10.0000', stock: '—', warehouse: '—' }, { id: 'product-3', name: 'فئة مؤرشفة', sku: 'OLD-1', barcode: null, category: 'غير مصنفة', salePrice: '20.0000', stock: '—', warehouse: '—' }]);
  });

  it('rejects unavailable product or category catalogue responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false })); await expect(loadProductCatalogue()).rejects.toThrow('CATALOGUE_UNAVAILABLE'); await expect(loadProductCatalogue()).rejects.toThrow('CATALOGUE_UNAVAILABLE');
  });

  it('renders loaded catalogue records and safely handles failures or late loads', async () => {
    const view = render(<LoadedProductCatalogue loadProducts={async () => [{ id: 'product-1', name: 'قميص', sku: 'SH-1', barcode: '123', category: 'قمصان', salePrice: '100.0000', stock: '—', warehouse: '—' }]} />); expect(await screen.findByText('قميص')).toBeInTheDocument(); view.rerender(<LoadedProductCatalogue loadProducts={async () => { throw Error('offline'); }} />); expect(await screen.findByText('تعذر تحميل كتالوج المنتجات.')).toBeInTheDocument();
    let resolve!: (value: ProductTableRow[]) => void; const late = render(<LoadedProductCatalogue loadProducts={() => new Promise((done) => { resolve = done; })} />); late.unmount(); resolve([]); await Promise.resolve();
  });
});
