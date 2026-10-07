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

export function App() {
  return (
    <main dir="rtl" lang="ar">
      <h1>أحمد ستور</h1>
      <p>إدارة المنتجات والمخزون</p>
      <ProductTable products={[]} />
    </main>
  );
}
