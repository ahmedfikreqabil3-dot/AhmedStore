import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, ProductTable } from './App.js';

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
});
