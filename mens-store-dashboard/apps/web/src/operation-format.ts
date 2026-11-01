import { displayMoney, units } from './store-api.js';

/** Display only: commands retain the original decimal strings. */
export function operationMoney(value: string) {
  const negative = value.startsWith('-');
  const magnitude = units(negative ? value.slice(1) : value);
  if (magnitude === null) return '—';
  return `${negative && magnitude !== 0n ? '-' : ''}${displayMoney(magnitude)}`;
}
const labels: Record<string, string> = {
  POSTED: 'مسجلة', VOIDED: 'ملغاة', OPEN: 'مفتوحة', CLOSED: 'مغلقة', REVIEWED: 'تمت المراجعة',
  CASH: 'نقدي', CARD: 'بطاقة', WALLET: 'محفظة', INSTAPAY: 'InstaPay', CREDIT: 'آجل'
};
export function operationLabel(value: string) { return labels[value] ?? value; }
