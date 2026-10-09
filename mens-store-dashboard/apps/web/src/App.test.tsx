import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, CategoryImportPanel, HistoricalInventory, LoadedProductCatalogue, LoadedPurchaseBarcodeEntry, LoginPanel, NoInvoiceReturnApproval, NoInvoiceReturnSubmission, ProductCatalogue, ProductTable, ProductTableRow, PurchaseBarcodeEntry, SalesHistory, SalesHistoryExport, SalesHistorySearch, ShiftPanel, ShiftReviewPanel, approveNoInvoiceReturn, categoryImportActions, closeCashShift, createNoInvoiceIdempotencyKey, downloadSalesHistoryXlsx, loadClosedShifts, loadCurrentShift, loadHistoricalStock, loadInventoryOptions, loadNoInvoiceReturnOptions, loadPendingNoInvoiceReturns, loadProductCatalogue, loadPurchaseScanProducts, loadSalesHistory, loadShiftSummary, loginUser, openCashShift, reviewCashShift, submitNoInvoiceReturn } from './App.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const emptySales = async () => ({ sales: [], total: 0 });

describe('App', () => {
  it('renders the Arabic product-management shell without requesting protected data before login', async () => {
    const loadSales = vi.fn(emptySales);
    render(<App loadSales={loadSales} />);

    expect(screen.getByRole('heading', { name: 'أحمد ستور' })).toBeInTheDocument();
    expect(screen.getByText('إدارة المنتجات والمخزون')).toBeInTheDocument();
    expect(screen.getByText('سجّل الدخول للوصول إلى العمليات والبيانات المحمية.')).toBeInTheDocument();
    expect(loadSales).not.toHaveBeenCalled();
  });

  it('logs in through the secure session endpoint and reloads the app session', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, json: async () => url.includes('/auth/login') ? ({ user: { id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' } }) : url.includes('/products') ? ({ products: [] }) : url.includes('/categories') ? ({ categories: [] }) : url.includes('/warehouses') ? ({ warehouses: [] }) : url.includes('/customers') ? ({ customers: [] }) : url.includes('/pending') ? ({ returns: [] }) : url.endsWith('/shifts') ? ({ shifts: [] }) : url.includes('/shifts/current') ? ({ shift: null }) : ({ sales: [], total: 0 }) })); vi.stubGlobal('fetch', fetchMock);
    await expect(loginUser('organization-1', 'ahmed@example.com', 'password')).resolves.toMatchObject({ name: 'أحمد', role: 'ADMIN' }); expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    render(<App login={async () => ({ id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' })} loadSales={emptySales} />); fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'password' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' })); expect(await screen.findByText('مرحباً، أحمد')).toBeInTheDocument();
  });

  it('keeps login disabled until complete and explains rejected credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 })); await expect(loginUser('organization-1', 'ahmed@example.com', 'bad')).rejects.toThrow('LOGIN_401');
    render(<LoginPanel login={async () => { throw Error('bad'); }} onSuccess={() => undefined} />); expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeDisabled(); fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'bad' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تسجيل الدخول');
  });

  it('uses backend-managed current, open, and close cash-shift operations', async () => {
    const open = { id: 'shift-1', status: 'OPEN' as const, expectedCash: null, countedCash: null, cashDifference: null, discrepancyReason: null }; const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ shift: null }) }).mockResolvedValueOnce({ ok: true, json: async () => open }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...open, status: 'CLOSED' as const, countedCash: '10.0000' }) }); vi.stubGlobal('fetch', fetchMock); await expect(loadCurrentShift()).resolves.toBeNull(); await expect(openCashShift()).resolves.toEqual(open); await expect(closeCashShift('shift-1', '10.0000', '')).resolves.toMatchObject({ status: 'CLOSED' }); expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/shifts/shift-1/close', expect.objectContaining({ method: 'POST' }));
  });

  it('opens and closes a shift through the panel and reports errors', async () => {
    const open = { id: 'shift-1', status: 'OPEN' as const, expectedCash: null, countedCash: null, cashDifference: null, discrepancyReason: null }; const close = vi.fn().mockResolvedValue({ ...open, status: 'CLOSED' as const, countedCash: '10.0000' }); render(<ShiftPanel loadShift={async () => null} openShift={async () => open} closeShift={close} />); expect(await screen.findByRole('button', { name: 'فتح وردية' })).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'فتح وردية' })); await screen.findByText('وردية مفتوحة'); fireEvent.change(screen.getByLabelText('النقد الفعلي'), { target: { value: '10.0000' } }); fireEvent.change(screen.getByLabelText('سبب فرق النقد'), { target: { value: 'فرق بسيط' } }); fireEvent.click(screen.getByRole('button', { name: 'إغلاق الوردية' })); await waitFor(() => expect(close).toHaveBeenCalledWith('shift-1', '10.0000', 'فرق بسيط'));
    render(<ShiftPanel loadShift={async () => { throw Error('offline'); }} />); expect(await screen.findByText('تعذر تحميل الوردية الحالية.')).toBeInTheDocument();
  });

  it('rejects failed shift operations and reports a failed action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce({ ok: false, status: 400 })); await expect(loadCurrentShift()).rejects.toThrow('SHIFT_401'); await expect(openCashShift()).rejects.toThrow('SHIFT_OPEN_409'); await expect(closeCashShift('shift-1', '10.0000', 'فرق')).rejects.toThrow('SHIFT_CLOSE_400');
    render(<ShiftPanel loadShift={async () => null} openShift={async () => { throw Error('offline'); }} />); fireEvent.click(await screen.findByRole('button', { name: 'فتح وردية' })); expect(await screen.findByText('تعذر حفظ الوردية.')).toBeInTheDocument();
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

  it('keeps the catalogue shell scanner callback usable after login', async () => {
    render(<App login={async () => ({ id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' })} loadSales={emptySales} loadPurchaseProducts={async () => [{ id: 'product-1', barcode: 'PREVIEW-1', name: 'منتج حقيقي' }]} />);
    fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'password' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    const input = await screen.findByLabelText('باركود المشتريات');
    fireEvent.change(input, { target: { value: 'PREVIEW-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }));
    expect(input).toHaveValue('');
  });

  it('loads the real authenticated purchase catalogue for barcode scanning and handles unavailable catalogues', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [{ id: 'product-1', barcode: '123', name: 'قميص' }] }) }); vi.stubGlobal('fetch', fetchMock); await expect(loadPurchaseScanProducts()).resolves.toEqual([{ id: 'product-1', barcode: '123', name: 'قميص' }]); expect(fetchMock).toHaveBeenCalledWith('/api/v1/products', { credentials: 'include' }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 })); await expect(loadPurchaseScanProducts()).rejects.toThrow('PURCHASE_PRODUCTS_403');
    const added: string[] = []; const onAdd = (product: { id: string }) => added.push(product.id); const view = render(<LoadedPurchaseBarcodeEntry loadProducts={async () => [{ id: 'product-1', barcode: '123', name: 'قميص' }]} onAdd={onAdd} />); const input = await screen.findByLabelText('باركود المشتريات'); fireEvent.change(input, { target: { value: '123' } }); fireEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' })); expect(added).toEqual(['product-1']); view.rerender(<LoadedPurchaseBarcodeEntry loadProducts={async () => { throw Error('offline'); }} onAdd={onAdd} />); expect(await screen.findByText('تعذر تحميل كتالوج المسح للمشتريات.')).toBeInTheDocument();
  });

  it('loads real sales history through the authenticated browser API client', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sales: [{ id: 'sale-1', customerName: 'محمد', total: '100.0000' }], total: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadSalesHistory()).resolves.toEqual({ sales: [{ id: 'sale-1', customer: 'محمد', total: '100.0000' }], total: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sales?limit=50&offset=0', { credentials: 'include' });
    await expect(loadSalesHistory({ from: '2026-10-01', to: '2026-10-09', limit: 10, offset: 20 })).resolves.toMatchObject({ total: 1 }); expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/sales?limit=10&offset=20&from=2026-10-01&to=2026-10-09', { credentials: 'include' });
  });

  it('shows a clear error when the authenticated sales history cannot be loaded', async () => {
    render(<App login={async () => ({ id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' })} loadSales={async () => { throw Error('unauthorized'); }} />);
    fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'password' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل سجل المبيعات');
  });

  it('rejects an unsuccessful history HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(loadSalesHistory()).rejects.toThrow('SALES_HISTORY_401');
  });

  it('does not update an unmounted authenticated sales-history screen after a late response', async () => {
    let resolve!: (value: { sales: []; total: number }) => void;
    const view = render(<App login={async () => ({ id: 'user-1', name: 'أحمد', email: 'ahmed@example.com', role: 'ADMIN' })} loadSales={() => new Promise((done) => { resolve = done; })} />);
    fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: 'organization-1' } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: 'ahmed@example.com' } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'password' } }); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
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

  it('loads return options, submits a manager-valued no-invoice return, and exposes API failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ customers: [{ id: 'customer-1', name: 'محمد' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ products: [{ id: 'product-1', name: 'قميص', salePrice: '10.0000' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ warehouses: [{ id: 'branch-1', name: 'الرئيسي' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'return-1', total: '10.0000' }) }); vi.stubGlobal('fetch', fetchMock);
    await expect(loadNoInvoiceReturnOptions()).resolves.toEqual({ customers: [{ id: 'customer-1', name: 'محمد' }], products: [{ id: 'product-1', name: 'قميص', salePrice: '10.0000' }], branches: [{ id: 'branch-1', name: 'الرئيسي' }] }); await expect(submitNoInvoiceReturn({ customerId: 'customer-1', warehouseId: 'branch-1', productId: 'product-1', quantity: '1.0000', unitPrice: '10.0000', paymentMethod: 'CASH', paymentAmount: '10.0000', reason: 'عيب واضح', itemCondition: 'صالح' }, 'return-key')).resolves.toEqual({ id: 'return-1', total: '10.0000' }); expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/returns/no-invoice', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'idempotency-key': 'return-key' }) }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, status: 409 })); await expect(loadNoInvoiceReturnOptions()).rejects.toThrow('NO_INVOICE_OPTIONS_UNAVAILABLE'); await expect(submitNoInvoiceReturn({ customerId: 'customer', warehouseId: 'branch', productId: 'product', quantity: '1', unitPrice: '1', paymentMethod: 'CASH', paymentAmount: '1', reason: 'سبب', itemCondition: 'صالح' }, 'key')).rejects.toThrow('NO_INVOICE_RETURN_409');
  });

  it('submits a complete no-invoice return form and explains option or submission errors', async () => {
    expect(createNoInvoiceIdempotencyKey()).toMatch(/-/); const submitted = vi.fn().mockResolvedValue({ id: 'return-1', total: '10.0000' }); const options = { customers: [{ id: 'customer-1', name: 'محمد' }], products: [{ id: 'product-1', name: 'قميص', salePrice: '10.0000' }], branches: [{ id: 'branch-1', name: 'الرئيسي' }] };
    const view = render(<NoInvoiceReturnSubmission loadOptions={async () => options} submitReturn={submitted} createKey={() => 'key-1'} />); await screen.findByLabelText('عميل المرتجع'); fireEvent.change(screen.getByLabelText('عميل المرتجع'), { target: { value: 'customer-1' } }); fireEvent.change(screen.getByLabelText('فرع المرتجع'), { target: { value: 'branch-1' } }); fireEvent.change(screen.getByLabelText('منتج المرتجع'), { target: { value: '' } }); fireEvent.change(screen.getByLabelText('منتج المرتجع'), { target: { value: 'product-1' } }); expect(screen.getByLabelText('سعر وحدة المرتجع')).toHaveValue('10.0000'); fireEvent.change(screen.getByLabelText('سعر وحدة المرتجع'), { target: { value: '9.0000' } }); fireEvent.change(screen.getByLabelText('سعر وحدة المرتجع'), { target: { value: '10.0000' } }); fireEvent.change(screen.getByLabelText('كمية المرتجع'), { target: { value: '1.0000' } }); fireEvent.change(screen.getByLabelText('طريقة استرداد المرتجع'), { target: { value: 'CARD' } }); fireEvent.change(screen.getByLabelText('مبلغ استرداد المرتجع'), { target: { value: '10.0000' } }); fireEvent.change(screen.getByLabelText('سبب المرتجع بدون فاتورة'), { target: { value: 'عيب واضح' } }); fireEvent.change(screen.getByLabelText('حالة منتج المرتجع'), { target: { value: 'صالح' } }); fireEvent.click(screen.getByRole('button', { name: 'إرسال للموافقة المالية' })); expect(await screen.findByRole('status')).toHaveTextContent('تم إرسال طلب المرتجع return-1'); expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'CARD' }), 'key-1');
    view.rerender(<NoInvoiceReturnSubmission loadOptions={async () => { throw Error('offline'); }} />); expect(await screen.findByRole('status')).toHaveTextContent('تعذر تحميل بيانات طلب المرتجع');
    view.rerender(<NoInvoiceReturnSubmission loadOptions={async () => options} submitReturn={async () => { throw Error('offline'); }} />); await screen.findByLabelText('عميل المرتجع'); fireEvent.change(screen.getByLabelText('عميل المرتجع'), { target: { value: 'customer-1' } }); fireEvent.change(screen.getByLabelText('فرع المرتجع'), { target: { value: 'branch-1' } }); fireEvent.change(screen.getByLabelText('منتج المرتجع'), { target: { value: 'product-1' } }); fireEvent.change(screen.getByLabelText('كمية المرتجع'), { target: { value: '1' } }); fireEvent.change(screen.getByLabelText('مبلغ استرداد المرتجع'), { target: { value: '10' } }); fireEvent.change(screen.getByLabelText('سبب المرتجع بدون فاتورة'), { target: { value: 'سبب' } }); fireEvent.change(screen.getByLabelText('حالة منتج المرتجع'), { target: { value: 'صالح' } }); fireEvent.click(screen.getByRole('button', { name: 'إرسال للموافقة المالية' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر إرسال طلب المرتجع');
  });

  it('lists and approves finance pending returns and handles approval or loading failures', async () => {
    const pending = [{ id: 'return-1', customerId: 'customer-1', warehouseId: 'branch-1', reason: 'عيب واضح', total: '10.0000', status: 'PENDING_APPROVAL' as const, occurredAt: '2026-10-09T00:00:00.000Z' }]; const approve = vi.fn().mockResolvedValue({ id: 'return-1', total: '10.0000' }); const view = render(<NoInvoiceReturnApproval loadPending={async () => pending} approve={approve} />); fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المرتجع' })); expect(await screen.findByText('تمت الموافقة على المرتجع return-1.')).toBeInTheDocument(); expect(approve).toHaveBeenCalledWith('return-1'); expect(screen.getByText('لا توجد طلبات معلقة.')).toBeInTheDocument();
    view.rerender(<NoInvoiceReturnApproval loadPending={async () => { throw Error('offline'); }} />); expect(await screen.findByText('تعذر تحميل طلبات المرتجعات المعلقة.')).toBeInTheDocument(); view.rerender(<NoInvoiceReturnApproval loadPending={async () => pending} approve={async () => { throw Error('offline'); }} />); fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المرتجع' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر اعتماد المرتجع');
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ returns: pending }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'return-1', total: '10.0000' }) }); vi.stubGlobal('fetch', fetchMock); await expect(loadPendingNoInvoiceReturns()).resolves.toEqual(pending); await expect(approveNoInvoiceReturn('return-1')).resolves.toEqual({ id: 'return-1', total: '10.0000' }); vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({ ok: false, status: 409 })); await expect(loadPendingNoInvoiceReturns()).rejects.toThrow('NO_INVOICE_PENDING_403'); await expect(approveNoInvoiceReturn('return-1')).rejects.toThrow('NO_INVOICE_APPROVE_409');
  });

  it('loads ledger-derived closed-shift data and marks a shift reviewed through the API', async () => {
    const closed = { id: 'shift-1', status: 'CLOSED' as const, expectedCash: '20.0000', countedCash: '20.0000', cashDifference: '0.0000', discrepancyReason: null, openedAt: '2026-10-09T08:00:00.000Z', closedAt: '2026-10-09T16:00:00.000Z' }; const summary = { shift: closed, totals: { receipts: '30.0000', refunds: '10.0000', net: '20.0000', methods: [{ method: 'CASH', receipts: '30.0000', refunds: '10.0000', net: '20.0000' }] } }; const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ shifts: [closed] }) }).mockResolvedValueOnce({ ok: true, json: async () => summary }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...closed, status: 'REVIEWED' }) }); vi.stubGlobal('fetch', fetchMock); await expect(loadClosedShifts()).resolves.toEqual([closed]); await expect(loadShiftSummary('shift-1')).resolves.toEqual(summary); await expect(reviewCashShift('shift-1')).resolves.toMatchObject({ status: 'REVIEWED' }); expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/shifts/shift-1/review', expect.objectContaining({ method: 'POST' })); vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: false, status: 409 })); await expect(loadClosedShifts()).rejects.toThrow('SHIFT_LIST_403'); await expect(loadShiftSummary('shift-1')).rejects.toThrow('SHIFT_SUMMARY_404'); await expect(reviewCashShift('shift-1')).rejects.toThrow('SHIFT_REVIEW_409');
  });

  it('lets Finance inspect ledger totals and review only closed shifts while reporting failures', async () => {
    const closed = { id: 'shift-1', status: 'CLOSED' as const, expectedCash: '20.0000', countedCash: '20.0000', cashDifference: '0.0000', discrepancyReason: null, openedAt: '2026-10-09T08:00:00.000Z', closedAt: '2026-10-09T16:00:00.000Z' }; const reviewed = { ...closed, id: 'shift-2', status: 'REVIEWED' as const }; const summary = { shift: closed, totals: { receipts: '30.0000', refunds: '10.0000', net: '20.0000', methods: [{ method: 'CASH', receipts: '30.0000', refunds: '10.0000', net: '20.0000' }] } }; const review = vi.fn().mockResolvedValue({ ...closed, status: 'REVIEWED' as const }); const view = render(<ShiftReviewPanel loadShifts={async () => [closed, reviewed]} loadSummary={async () => summary} reviewShift={review} />); fireEvent.click((await screen.findAllByRole('button', { name: 'عرض إجمالي الدفتر' }))[0]); expect(await screen.findByLabelText('إجمالي الوردية')).toHaveTextContent('الصافي: 20.0000'); fireEvent.click(screen.getByRole('button', { name: 'مراجعة الوردية' })); expect(await screen.findByText('تمت مراجعة الوردية shift-1.')).toBeInTheDocument(); expect(review).toHaveBeenCalledWith('shift-1'); expect(screen.queryByRole('button', { name: 'مراجعة الوردية' })).not.toBeInTheDocument();
    view.rerender(<ShiftReviewPanel loadShifts={async () => []} />); expect(await screen.findByText('لا توجد ورديات مغلقة للمراجعة.')).toBeInTheDocument(); view.rerender(<ShiftReviewPanel loadShifts={async () => { throw Error('offline'); }} />); expect(await screen.findByText('تعذر تحميل الورديات المغلقة.')).toBeInTheDocument(); view.rerender(<ShiftReviewPanel loadShifts={async () => [closed]} loadSummary={async () => { throw Error('offline'); }} reviewShift={async () => { throw Error('offline'); }} />); fireEvent.click(await screen.findByRole('button', { name: 'عرض إجمالي الدفتر' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل إجمالي الوردية'); fireEvent.click(screen.getByRole('button', { name: 'مراجعة الوردية' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر مراجعة الوردية');
  });

  it('filters and pages authenticated sales history without automatically selecting an invoice', async () => {
    const load = vi.fn(async (filters) => ({ sales: filters?.offset ? [] : [{ id: 'sale-1', customer: 'محمد', total: '10.0000' }], total: 51 })); const view = render(<SalesHistorySearch loadSales={load} exportSales={async () => undefined} />); expect(await screen.findByRole('button', { name: 'عرض التفاصيل' })).toBeInTheDocument(); expect(screen.queryByLabelText('تفاصيل الفاتورة')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'تطبيق فلتر المبيعات' })); await waitFor(() => expect(load).toHaveBeenLastCalledWith({ from: undefined, to: undefined, limit: 50, offset: 0 })); fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' })); await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }))); expect(screen.getByRole('button', { name: 'الصفحة السابقة' })).toBeEnabled(); fireEvent.click(screen.getByRole('button', { name: 'الصفحة السابقة' })); await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))); fireEvent.change(screen.getByLabelText('من تاريخ المبيعات'), { target: { value: '2026-10-01' } }); fireEvent.change(screen.getByLabelText('إلى تاريخ المبيعات'), { target: { value: '2026-10-09' } }); fireEvent.click(screen.getByRole('button', { name: 'تطبيق فلتر المبيعات' })); await waitFor(() => expect(load).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-09', limit: 50, offset: 0 }));
    view.rerender(<SalesHistorySearch loadSales={async () => { throw Error('offline'); }} exportSales={async () => undefined} />); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل سجل المبيعات');
  });
});
