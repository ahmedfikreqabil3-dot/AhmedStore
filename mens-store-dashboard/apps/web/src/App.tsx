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

export function App({ postSale = async () => undefined }: { postSale?: () => Promise<void> }) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  return (
    <main dir="rtl" lang="ar">
      <h1>أحمد ستور</h1>
      <p>إدارة المنتجات والمخزون</p>
      <button type="button" onClick={() => setPaymentOpen(true)}>فتح الدفع</button>
      <SalePaymentDialog open={paymentOpen} onConfirm={postSale} onSucceeded={() => setPaymentOpen(false)} />
      <ProductTable products={[]} />
    </main>
  );
}
import { useState } from 'react';
