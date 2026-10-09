import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App, ProductTable } from './App.js';

afterEach(cleanup);

describe('App', () => {
  it('renders the Arabic product-management shell and an empty state', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'أحمد ستور' })).toBeInTheDocument();
    expect(screen.getByText('إدارة المنتجات والمخزون')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('لا توجد منتجات');
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
});
