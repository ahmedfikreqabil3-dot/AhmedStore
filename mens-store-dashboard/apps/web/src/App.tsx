import { useEffect, useState } from 'react';

export type ProductTableRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  salePrice: string;
  stock: string;
  warehouse: string;
};

export function ProductTable({ products }: { products: ProductTableRow[] }) {
  if (products.length === 0) return <p role="status">لا توجد منتجات مطابقة للفلتر الحالي.</p>;

  return (
    <table>
      <caption>جدول المنتجات</caption>
      <thead>
        <tr>
          <th scope="col">المنتج</th>
          <th scope="col">SKU</th>
          <th scope="col">الباركود</th>
          <th scope="col">الفئة</th>
          <th scope="col">سعر البيع</th>
          <th scope="col">المخزون</th>
          <th scope="col">المستودع</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id}>
            <td>{product.name}</td>
            <td>{product.sku}</td>
            <td>{product.barcode ?? '—'}</td>
            <td>{product.category ?? 'غير مصنفة'}</td>
            <td>{product.salePrice}</td>
            <td>{product.stock}</td>
            <td>{product.warehouse}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ProductCatalogue({ products, pageSize = 10 }: { products: ProductTableRow[]; pageSize?: number }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const categories = [...new Set(products.flatMap((product) => product.category ? [product.category] : []))].sort();
  const filtered = products.filter((product) => (!category || product.category === category) && (!query || `${product.name} ${product.sku} ${product.barcode ?? ''}`.toLowerCase().includes(query.toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function updateQuery(value: string) { setQuery(value); setPage(0); }
  function updateCategory(value: string) { setCategory(value); setPage(0); }
  return <section aria-labelledby="catalogue-title"><h2 id="catalogue-title">كتالوج المنتجات</h2><label>بحث<input aria-label="بحث المنتجات" value={query} onChange={(event) => updateQuery(event.target.value)} /></label><label>الفئة<select aria-label="تصفية الفئة" value={category} onChange={(event) => updateCategory(event.target.value)}><option value="">كل الفئات</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><ProductTable products={visible} />{filtered.length > pageSize && <nav aria-label="ترقيم صفحات المنتجات"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>السابق</button><span>صفحة {currentPage + 1} من {pages}</span><button type="button" onClick={() => setPage((value) => Math.min(pages - 1, value + 1))} disabled={currentPage === pages - 1}>التالي</button></nav>}</section>;
}

export function SalePaymentDialog({ open, onConfirm, onSucceeded }: { open: boolean; onConfirm: () => Promise<void>; onSucceeded: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;
  async function confirm() {
    setSubmitting(true); setError(null);
    try { await onConfirm(); onSucceeded(); } catch { setError('تعذر إتمام الفاتورة. تحقق من الاتصال والبيانات ثم أعد المحاولة.'); } finally { setSubmitting(false); }
  }
  return <section role="dialog" aria-modal="true" aria-labelledby="payment-title"><h2 id="payment-title">تأكيد الدفع</h2><p>لن تُغلق نافذة الدفع إلا بعد حفظ الفاتورة بنجاح.</p>{error && <p role="alert">{error}</p>}<button type="button" onClick={confirm} disabled={submitting}>{submitting ? 'جارٍ الحفظ…' : 'تأكيد الدفع'}</button></section>;
}

export type SalesHistoryRow = { id: string; customer: string; total: string };

export type SalesHistoryPage = { sales: SalesHistoryRow[]; total: number };
export type LoadSalesHistory = () => Promise<SalesHistoryPage>;

export async function loadSalesHistory(): Promise<SalesHistoryPage> {
  const response = await fetch('/api/v1/sales?limit=50&offset=0', { credentials: 'include' });
  if (!response.ok) throw Error(`SALES_HISTORY_${response.status}`);
  const body = await response.json() as { sales: Array<{ id: string; customerName: string; total: string }>; total: number };
  return { sales: body.sales.map((sale) => ({ id: sale.id, customer: sale.customerName, total: sale.total })), total: body.total };
}

export async function downloadSalesHistoryXlsx() {
  const response = await fetch('/api/v1/reports/sales/export.xlsx', { credentials: 'include' });
  if (!response.ok) throw Error(`SALES_EXPORT_${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl; link.download = 'sales-history.xlsx'; link.click();
  URL.revokeObjectURL(objectUrl);
}

export type CategoryImportPreview = { valid: boolean; rows: Array<{ row: number; name: string }>; errors: Array<{ row: number; message: string }> };
export type CategoryImportActions = { downloadTemplate: () => Promise<void>; preview: (file: File) => Promise<CategoryImportPreview>; import: (file: File) => Promise<number> };

async function downloadWorkbook(url: string, filename: string) { const response = await fetch(url, { credentials: 'include' }); if (!response.ok) throw Error(`CATEGORY_IMPORT_${response.status}`); const objectUrl = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = objectUrl; link.download = filename; link.click(); URL.revokeObjectURL(objectUrl); }
export const categoryImportActions: CategoryImportActions = {
  downloadTemplate: () => downloadWorkbook('/api/v1/categories/import-template.xlsx', 'category-import-template.xlsx'),
  async preview(file) { const response = await fetch('/api/v1/categories/import.xlsx/preview', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: file }); if (!response.ok) throw Error(`CATEGORY_PREVIEW_${response.status}`); return response.json() as Promise<CategoryImportPreview>; },
  async import(file) { const response = await fetch('/api/v1/categories/import.xlsx', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: file }); if (!response.ok) throw Error(`CATEGORY_IMPORT_${response.status}`); return (await response.json() as { imported: number }).imported; }
};

export function CategoryImportPanel({ actions }: { actions: CategoryImportActions }) {
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<CategoryImportPreview | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function download() { setBusy(true); setMessage(null); try { await actions.downloadTemplate(); } catch { setMessage('تعذر تنزيل النموذج.'); } finally { setBusy(false); } }
  function choose(selected: File | null) { setFile(selected); setPreview(null); setMessage(null); }
  async function validate() { const selectedFile = file!; setBusy(true); setMessage(null); try { const result = await actions.preview(selectedFile); setPreview(result); } catch { setMessage('تعذر فحص ملف Excel.'); } finally { setBusy(false); } }
  async function apply() { const selectedFile = file!; setBusy(true); setMessage(null); try { const imported = await actions.import(selectedFile); setMessage(`تم استيراد ${imported} فئة بنجاح.`); setFile(null); setPreview(null); } catch { setMessage('تعذر استيراد الفئات. لم يتم حفظ أي تغيير.'); } finally { setBusy(false); } }
  return <section aria-labelledby="category-import-title"><h2 id="category-import-title">استيراد الفئات من Excel</h2><button type="button" onClick={download} disabled={busy}>تنزيل النموذج</button><label>ملف Excel<input aria-label="ملف Excel للفئات" type="file" accept=".xlsx" disabled={busy} onChange={(event) => choose(event.currentTarget.files?.[0] ?? null)} /></label><button type="button" onClick={validate} disabled={!file || busy}>فحص الملف</button>{preview && <p role={preview.valid ? 'status' : 'alert'}>{preview.valid ? `${preview.rows.length} صف جاهز للاستيراد.` : preview.errors.map((error) => `صف ${error.row}: ${error.message}`).join('، ')}</p>}<button type="button" onClick={apply} disabled={!preview?.valid || busy}>استيراد الفئات</button>{message && <p role="alert">{message}</p>}</section>;
}

export function SalesHistoryExport({ onExport }: { onExport: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false); const [error, setError] = useState<string | null>(null);
  async function exportFile() { setExporting(true); setError(null); try { await onExport(); } catch { setError('تعذر تصدير ملف Excel. تحقق من الصلاحيات والاتصال ثم أعد المحاولة.'); } finally { setExporting(false); } }
  return <section aria-label="تصدير سجل المبيعات"><button type="button" onClick={exportFile} disabled={exporting}>{exporting ? 'جارٍ تجهيز ملف Excel…' : 'تصدير Excel'}</button>{error && <p role="alert">{error}</p>}</section>;
}

export function SalesHistory({ sales }: { sales: SalesHistoryRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (selectedId && !sales.some((sale) => sale.id === selectedId)) setSelectedId(null); }, [sales, selectedId]);
  const selected = sales.find((sale) => sale.id === selectedId);
  return <section aria-labelledby="sales-history-title"><h2 id="sales-history-title">سجل المبيعات</h2><ul>{sales.map((sale) => <li key={sale.id}>{sale.customer} — {sale.total} <button type="button" onClick={() => setSelectedId(sale.id)}>عرض التفاصيل</button></li>)}</ul>{selected ? <article aria-label="تفاصيل الفاتورة"><h3>تفاصيل الفاتورة</h3><p>{selected.customer}: {selected.total}</p></article> : <p role="status">اختر فاتورة لعرض تفاصيلها.</p>}</section>;
}

export function PurchaseBarcodeEntry({ products, onAdd }: { products: Array<{ id: string; barcode: string | null; name: string }>; onAdd: (product: { id: string; barcode: string | null; name: string }) => void }) {
  const [barcode, setBarcode] = useState(''); const [error, setError] = useState<string | null>(null);
  function submit() { const product = products.find((candidate) => candidate.barcode === barcode.trim()); if (!product) { setError('الباركود غير معروف.'); return; } onAdd(product); setBarcode(''); setError(null); }
  return <section aria-labelledby="purchase-scan-title"><h2 id="purchase-scan-title">مسح باركود المشتريات</h2><label>الباركود<input aria-label="باركود المشتريات" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} /></label><button type="button" onClick={submit}>إضافة المنتج</button>{error && <p role="alert">{error}</p>}</section>;
}

export function App({ postSale = async () => undefined, loadSales = loadSalesHistory, exportSales = downloadSalesHistoryXlsx, categoryImport = categoryImportActions }: { postSale?: () => Promise<void>; loadSales?: LoadSalesHistory; exportSales?: () => Promise<void>; categoryImport?: CategoryImportActions }) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [sales, setSales] = useState<SalesHistoryRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSalesLoading(true); setSalesError(null);
    void loadSales().then((page) => { if (active) setSales(page.sales); }).catch(() => { if (active) setSalesError('تعذر تحميل سجل المبيعات. سجّل الدخول ثم أعد المحاولة.'); }).finally(() => { if (active) setSalesLoading(false); });
    return () => { active = false; };
  }, [loadSales]);
  return (
    <main dir="rtl" lang="ar">
      <h1>أحمد ستور</h1>
      <p>إدارة المنتجات والمخزون</p>
      <button type="button" onClick={() => setPaymentOpen(true)}>فتح الدفع</button>
      <SalePaymentDialog open={paymentOpen} onConfirm={postSale} onSucceeded={() => setPaymentOpen(false)} />
      <ProductCatalogue products={[]} />
      <CategoryImportPanel actions={categoryImport} />
      {salesLoading ? <p role="status">جارٍ تحميل سجل المبيعات…</p> : salesError ? <p role="alert">{salesError}</p> : <><SalesHistory sales={sales} /><SalesHistoryExport onExport={exportSales} /></>}
      <PurchaseBarcodeEntry products={[{ id: 'preview-product', barcode: 'PREVIEW-1', name: 'منتج تجريبي' }]} onAdd={() => undefined} />
    </main>
  );
}
