import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App, ProductCatalogue, ProductTable, PurchaseBarcodeEntry, SalesHistory } from './App.js';

afterEach(cleanup);

describe('App', () => {
  it('renders the Arabic product-management shell and an empty state', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'أحمد ستور' })).toBeInTheDocument();
    expect(screen.getByText('إدارة المنتجات والمخزون')).toBeInTheDocument();
    expect(screen.getByText('لا توجد منتجات مطابقة للفلتر الحالي.')).toBeInTheDocument();
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
    render(<App postSale={postSale} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'فتح الدفع' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('supports the default POS posting callback for the shell preview', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'فتح الدفع' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the payment dialog open and explains a failed posting attempt', async () => {
    render(<App postSale={async () => { throw Error('offline'); }} />);
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
    render(<App />);
    const input = screen.getByLabelText('باركود المشتريات');
    fireEvent.change(input, { target: { value: 'PREVIEW-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }));
    expect(input).toHaveValue('');
  });
});
