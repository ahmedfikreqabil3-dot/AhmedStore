import type { CreateSaleInput } from '@ahmed-store/contracts';

const scale = 10_000n;

function parseDecimal(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * scale + BigInt(fraction.padEnd(4, '0'));
}

function formatDecimal(value: bigint) {
  return `${value / scale}.${(value % scale).toString().padStart(4, '0')}`;
}

function multiply(left: bigint, right: bigint) {
  const product = left * right;
  const quotient = product / scale;
  const remainder = product % scale;
  return remainder * 2n >= scale ? quotient + 1n : quotient;
}

export type CalculatedSale = {
  subtotal: string;
  discount: string;
  total: string;
  lines: Array<{ productId: string; quantity: string; unitPrice: string; discount: string; total: string }>;
};

export type CalculateSaleResult =
  | { ok: true; sale: CalculatedSale }
  | { ok: false; reason: 'LINE_DISCOUNT_EXCEEDS_SUBTOTAL' | 'PAYMENT_TOTAL_MISMATCH' };

export function calculateSale(input: CreateSaleInput): CalculateSaleResult {
  let subtotal = 0n;
  let discount = 0n;
  const lines = input.lines.map((line) => {
    const lineSubtotal = multiply(parseDecimal(line.quantity), parseDecimal(line.unitPrice));
    const lineDiscount = parseDecimal(line.discount);
    if (lineDiscount > lineSubtotal) return null;
    subtotal += lineSubtotal;
    discount += lineDiscount;
    return { productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, total: formatDecimal(lineSubtotal - lineDiscount) };
  });
  if (lines.some((line) => line === null)) return { ok: false, reason: 'LINE_DISCOUNT_EXCEEDS_SUBTOTAL' };
  const total = subtotal - discount;
  const paid = input.payments.reduce((sum, payment) => sum + parseDecimal(payment.amount), 0n);
  if (paid !== total) return { ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' };
  return { ok: true, sale: { subtotal: formatDecimal(subtotal), discount: formatDecimal(discount), total: formatDecimal(total), lines: lines as CalculatedSale['lines'] } };
}
