import type { CreateInvoiceReturnInput } from '@ahmed-store/contracts';
import type { ReturnableSale } from './return-service.js';

const scale = 10_000n;

function toUnits(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * scale + BigInt(fraction.padEnd(4, '0'));
}

function format(value: bigint) {
  return `${value / scale}.${(value % scale).toString().padStart(4, '0')}`;
}

function divideHalfUp(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  return numerator % denominator * 2n >= denominator ? quotient + 1n : quotient;
}

export type CalculatedReturn = { total: string; lines: Array<{ saleLineId: string; productId: string; quantity: string; unitPrice: string; total: string }> };

export function calculateInvoiceReturn(sale: ReturnableSale, input: CreateInvoiceReturnInput): CalculatedReturn {
  let total = 0n;
  const lines = input.lines.map((inputLine) => {
    const saleLine = sale.lines.find((line) => line.id === inputLine.saleLineId)!;
    const lineTotal = divideHalfUp(toUnits(saleLine.total) * toUnits(inputLine.quantity), toUnits(saleLine.quantity));
    total += lineTotal;
    return { saleLineId: saleLine.id, productId: saleLine.productId, quantity: inputLine.quantity, unitPrice: saleLine.unitPrice, total: format(lineTotal) };
  });
  return { total: format(total), lines };
}
