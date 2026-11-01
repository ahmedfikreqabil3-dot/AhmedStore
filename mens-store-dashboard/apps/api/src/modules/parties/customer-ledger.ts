import { Prisma } from '@prisma/client';

export function ledgerUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return (negative ? -1n : 1n) * (BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, '0')));
}
export function ledgerDecimal(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, '0')}`;
}
export function creditUnits(payments: ReadonlyArray<{ method: string; amount: string | Prisma.Decimal }>): bigint {
  return payments.reduce((sum, payment) => payment.method === 'CREDIT'
    ? sum + ledgerUnits(typeof payment.amount === 'string' ? payment.amount : payment.amount.toFixed(4))
    : sum, 0n);
}
export async function customerDebt(tx: Prisma.TransactionClient, organizationId: string, customerId: string): Promise<bigint> {
  const balance = await tx.customerLedgerEntry.aggregate({ where: { organizationId, customerId }, _sum: { amount: true } });
  return ledgerUnits(balance._sum.amount?.toFixed(4) ?? '0');
}
type Movement = { organizationId: string; customerId: string; actorUserId: string; sourceId: string; occurredAt: Date; type: 'SALE_CREDIT' | 'RETURN_CREDIT' | 'RETURN_REVERSAL' };
export async function recordCustomerCredit(tx: Prisma.TransactionClient, movement: Movement, payments: Parameters<typeof creditUnits>[0]) {
  const amount = creditUnits(payments);
  if (amount === 0n) return;
  await tx.customerLedgerEntry.create({ data: {
    ...movement, amount: ledgerDecimal(movement.type === 'RETURN_CREDIT' ? -amount : amount),
    sourceType: movement.type === 'SALE_CREDIT' ? 'Sale' : 'SalesReturn'
  } });
}
