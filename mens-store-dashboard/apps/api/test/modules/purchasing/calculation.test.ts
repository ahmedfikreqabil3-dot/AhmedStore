import { describe, expect, it } from 'vitest';
import { calculatePurchase } from '../../../src/modules/purchasing/calculation.js';

describe('purchase calculation', () => {
  it('calculates exact four-decimal purchase totals without floating point arithmetic', () => {
    expect(calculatePurchase([
      { productId: 'product-1', quantity: '2.5000', unitCost: '10.1250' },
      { productId: 'product-2', barcode: 'BC-2', quantity: '1.0000', unitCost: '0.1000' }
    ])).toEqual({ subtotal: '25.4125', total: '25.4125', lines: [
      { productId: 'product-1', quantity: '2.5000', unitCost: '10.1250', total: '25.3125' },
      { productId: 'product-2', barcode: 'BC-2', quantity: '1.0000', unitCost: '0.1000', total: '0.1000' }
    ] });
  });
});
