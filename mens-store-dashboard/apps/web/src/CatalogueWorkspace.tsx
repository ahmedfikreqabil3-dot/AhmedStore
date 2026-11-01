import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createProductSchema, updateProductSchema, type Category, type Product, type Warehouse } from '@ahmed-store/contracts';
import { CategoryImportPanel, ProductImportPanel, categoryImportActions, productImportActions } from './App.js';
import { ApiError, displayMoney, readJson, units } from './store-api.js';
import { Icon } from './ui/Icon.js';

type Catalogue = { products: Product[]; categories: Category[]; warehouses: Warehouse[] };
export function stockDisplay(value: string) {
  const [whole, fraction = ''] = value.split('.');
  const significant = fraction.replace(/0+$/, '');
  return significant ? `${whole}.${significant}` : whole;
}

export function InventoryContext({ branch, date }: { branch: string; date: string }) {
  return <div className="inventory-context" role="region" aria-label="نطاق رصيد المخزون"><div className="inventory-context-item"><span className="section-icon"><Icon name="inventory" size={20}/></span><div><span>الفرع المعروض</span><strong>{branch || 'اختر فرعًا لعرض رصيده'}</strong></div></div><div className="inventory-context-item"><span className="section-icon"><Icon name="clock" size={20}/></span><div><span>توقيت الرصيد</span><strong>{date ? <bdi>{date}</bdi> : 'الرصيد الحالي'}</strong><small>{date ? 'حتى نهاية اليوم بتوقيت جهازك' : 'عند آخر تحميل للبيانات'}</small></div></div></div>;
}
const messages: Record<string, string> = {
  VERSION_CONFLICT: 'اتغيّرت بيانات المنتج. أغلق النافذة وحدّث القائمة قبل إعادة التعديل.',
  PRODUCT_NOT_FOUND: 'المنتج لم يعد متاحًا. حدّث القائمة.',
  SKU_EXISTS: 'كود المنتج مستخدم بالفعل.', BARCODE_EXISTS: 'الباركود مستخدم بالفعل.',
  CATEGORY_UNAVAILABLE: 'الفئة غير متاحة. حدّث القائمة واختر فئة أخرى.',
  PRODUCT_CONFLICT: 'الكود أو الباركود مستخدم بالفعل. راجع البيانات.'
};

export function ProductEditor({ product, categories, onClose, onSaved }: { product: Product | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current!.showModal(); dialog.current!.querySelector<HTMLInputElement>('input')!.focus(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = { name: String(data.get('name')), sku: String(data.get('sku')), barcode: String(data.get('barcode')).trim() || null, categoryId: String(data.get('categoryId')) || null, salePrice: String(data.get('salePrice')), costPrice: String(data.get('costPrice')) };
    const parsed = product ? updateProductSchema.safeParse({ ...fields, version: product.version }) : createProductSchema.safeParse(fields);
    if (!parsed.success) { setError('راجع الاسم والكود والأسعار. استخدم أرقامًا موجبة أو صفرًا، حتى 4 خانات عشرية.'); return; }
    setBusy(true); setError('');
    try {
      await readJson(product ? `/products/${product.id}` : '/products', { method: product ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.data) });
      onSaved();
    } catch (cause) { setError(cause instanceof ApiError ? messages[cause.code] ?? 'تعذر الحفظ. تحقق من الاتصال وراجع القائمة قبل إعادة المحاولة.' : 'تعذر الاتصال. راجع القائمة قبل إعادة المحاولة.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="catalogue-dialog" aria-labelledby="product-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}><form onSubmit={(event) => void save(event)}><header><h2 id="product-editor-title">{product ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2><button type="button" className="icon-button" aria-label="إغلاق نموذج المنتج" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><fieldset disabled={busy} className="catalogue-fields"><label>اسم المنتج<input name="name" defaultValue={product?.name} required minLength={2} maxLength={160} autoFocus/></label><label>كود المنتج SKU<input name="sku" defaultValue={product?.sku} required maxLength={80} dir="ltr"/></label><label>الباركود<input name="barcode" defaultValue={product?.barcode ?? ''} maxLength={120} dir="ltr"/></label><label>الفئة<select name="categoryId" defaultValue={product?.categoryId ?? ''}><option value="">بدون فئة</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>سعر البيع<input name="salePrice" defaultValue={product?.salePrice ?? '0'} inputMode="decimal" required dir="ltr"/></label><label>سعر التكلفة<input name="costPrice" defaultValue={product?.costPrice ?? '0'} inputMode="decimal" required dir="ltr"/></label></fieldset><p className="catalogue-editor-note">الأسعار بالجنيه المصري، وتقبل حتى 4 خانات عشرية للحفاظ على دقة التسعير. الأرصدة تتغيّر من حركات المخزون والفواتير.</p>{error && <p role="alert">{error}</p>}<footer><button className="button primary" disabled={busy} type="submit">{busy ? 'جارٍ الحفظ…' : 'حفظ المنتج'}</button><button className="button secondary" disabled={busy} type="button" onClick={onClose}>إلغاء</button></footer></form></dialog>;
}

export function CatalogueWorkspace({ view }: { view: 'products' | 'inventory' }) {
  const [data, setData] = useState<Catalogue | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<Product | null | undefined>();
  const [notice, setNotice] = useState('');
  const [stock, setStock] = useState<{ key: string; values: Record<string, string>; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true; setError('');
    void Promise.all([readJson<{ products: Product[] }>('/products'), readJson<{ categories: Category[] }>('/categories'), readJson<{ warehouses: Warehouse[] }>('/warehouses')]).then(([products, categories, warehouses]) => {
      if (active) setData({ products: products.products, categories: categories.categories, warehouses: warehouses.warehouses });
    }).catch(() => { if (active) setError('تعذر تحديث البيانات. أعد المحاولة قبل الاعتماد على القائمة.'); });
    return () => { active = false; };
  }, [revision]);
  const filtered = useMemo(() => data?.products.filter((product) => (!categoryId || product.categoryId === categoryId) && `${product.name} ${product.sku} ${product.barcode ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [], [data, query, categoryId]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 10, currentPage * 10 + 10);
  const ids = visible.map((product) => product.id).join(',');
  const stockKey = JSON.stringify([branchId, date, ids, revision]);
  useEffect(() => {
    if (!branchId || !ids) return;
    let active = true;
    const asOf = date ? new Date(`${date}T23:59:59.999`).toISOString() : new Date().toISOString();
    void Promise.all(ids.split(',').map(async (id) => {
      const result = await readJson<{ quantity: string }>(`/inventory/stock?${new URLSearchParams({ productId: id, branchId, asOf })}`);
      return [id, result.quantity] as const;
    })).then((entries) => { if (active) setStock({ key: stockKey, values: Object.fromEntries(entries), failed: false }); }).catch(() => { if (active) setStock({ key: stockKey, values: {}, failed: true }); });
    return () => { active = false; };
  }, [branchId, date, ids, stockKey]);
  const refresh = () => setRevision((value) => value + 1);
  const productImport = { ...productImportActions, async import(file: File) { const count = await productImportActions.import(file); refresh(); return count; } };
  const categoryImport = { ...categoryImportActions, async import(file: File) { const count = await categoryImportActions.import(file); refresh(); return count; } };
  return <div className={`catalogue-workspace ${view === 'inventory' ? 'inventory-workspace' : ''}`}><section className="surface catalogue-panel" aria-label={view === 'products' ? 'كتالوج المنتجات' : 'أرصدة الفروع'}><div className="catalogue-heading"><div className="catalogue-title"><span className="section-icon"><Icon name={view === 'products' ? 'box' : 'inventory'}/></span><div><h2>{view === 'products' ? 'كتالوج المنتجات' : 'أرصدة الفروع'}</h2><p>{view === 'inventory' ? 'تابع رصيد كل صنف في الفرع، حاليًا أو حتى تاريخ سابق.' : 'الأسعار والأرصدة من بيانات مؤسستك.'}</p></div></div><div className="catalogue-actions"><button className="button secondary" onClick={refresh}><Icon name="clock" size={16}/>تحديث البيانات</button>{view === 'products' && <button className="button primary" disabled={!data || !!error} onClick={() => { setNotice(''); setEditor(null); }}><Icon name="plus" size={16}/>إضافة منتج</button>}</div></div>{notice && <p role="status" className="success-banner">{notice}</p>}{error && <p role="alert" className="error-banner">{error}</p>}{!data ? !error && <p role="status">جارٍ تحميل المنتجات والفروع…</p> : <><div className="catalogue-filters"><label className="catalogue-search">بحث المنتجات<input aria-label="بحث المنتجات" placeholder="اسم المنتج، الكود، أو الباركود" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }}/></label><label>الفئة<select aria-label="الفئة" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(0); }}><option value="">كل الفئات</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>الفرع<select aria-label="الفرع" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">اختر فرعًا لعرض الرصيد</option>{data.warehouses.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{!branch.active && ' (غير نشط)'}</option>)}</select></label>{view === 'inventory' && <label>حتى نهاية يوم<input aria-label="حتى نهاية يوم" type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>}</div>{view === 'inventory' && <InventoryContext branch={data.warehouses.find((branch) => branch.id === branchId)?.name ?? ''} date={date}/>}<p className="catalogue-hint">{branchId ? date ? 'رصيد تاريخي حتى نهاية اليوم بتوقيت جهازك.' : 'الرصيد عند آخر تحميل. حدّث البيانات بعد تسجيل أي حركة.' : 'اختر الفرع لعرض رصيده؛ عدم اختيار فرع لا يعني أن الرصيد صفر.'}</p><div className="catalogue-table-wrap" role="region" aria-label="جدول المنتجات وأرصدة الفروع" tabIndex={0}><table><caption className="sr-only">المنتجات وأرصدة الفرع المحدد</caption><thead><tr><th scope="col">المنتج</th><th scope="col">الفئة</th>{view === 'products' && <th scope="col">سعر البيع (ج.م)</th>}<th scope="col">رصيد الفرع</th><th scope="col">حالة المنتج</th>{view === 'products' && <th scope="col">الإجراءات</th>}</tr></thead><tbody>{visible.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small dir="ltr">{product.sku}{product.barcode && ` · ${product.barcode}`}</small></td><td>{data.categories.find((category) => category.id === product.categoryId)?.name ?? 'بدون فئة'}</td>{view === 'products' && <td className="catalogue-price"><bdi>{displayMoney(units(product.salePrice)!)}</bdi></td>}<td className="stock-cell">{!branchId ? 'اختر الفرع' : stock?.key !== stockKey ? 'جارٍ التحميل…' : stock.failed ? 'تعذر تحميل الرصيد' : <bdi>{stockDisplay(stock.values[product.id])}</bdi>}</td><td><span className={`catalogue-badge ${product.active ? '' : 'inactive'}`}>{product.active ? 'نشط' : 'غير نشط'}</span></td>{view === 'products' && <td><button className="button secondary compact" disabled={!!error} aria-label={`تعديل ${product.name}`} onClick={() => { setNotice(''); setEditor(product); }}>تعديل</button></td>}</tr>)}</tbody></table></div>{!visible.length && <p role="status" className="catalogue-empty">لا توجد منتجات مطابقة للبحث والفئة.</p>}<nav className="catalogue-pagination" aria-label="صفحات المنتجات"><span>{filtered.length} منتج · صفحة {currentPage + 1} من {pages}</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</button><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>التالي</button></div></nav></>}</section>{view === 'products' && <details className="surface catalogue-import"><summary><Icon name="download" size={17}/>استيراد المنتجات والفئات من Excel</summary><p>نزّل النموذج وافحص الملف قبل تأكيد الاستيراد. الكميات تُسجّل بحركات مخزون مستقلة.</p><CategoryImportPanel actions={categoryImport}/><ProductImportPanel actions={productImport}/></details>}{editor !== undefined && data && <ProductEditor product={editor} categories={data.categories} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); setNotice('تم حفظ بيانات المنتج بنجاح.'); refresh(); }}/>}</div>;
}




