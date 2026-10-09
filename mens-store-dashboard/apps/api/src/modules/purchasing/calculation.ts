import type { PurchaseLineInput } from '@ahmed-store/contracts';

export type CalculatedPurchaseLine = PurchaseLineInput & { productId: string; total: string };
export type CalculatedPurchase = { subtotal: string; total: string; lines: CalculatedPurchaseLine[] };

function units(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

function decimal(value: bigint) {
  return `${value / 10_000n}.${(value % 10_000n).toString().padStart(4, '0')}`;
}

export function calculatePurchase(lines: Array<PurchaseLineInput & { productId: string }>): CalculatedPurchase {
  const calculated = lines.map((line) => ({ ...line, total: decimal(units(line.quantity) * units(line.unitCost) / 10_000n) }));
  const subtotal = decimal(calculated.reduce((total, line) => total + units(line.total), 0n));
  return { subtotal, total: subtotal, lines: calculated };
}
