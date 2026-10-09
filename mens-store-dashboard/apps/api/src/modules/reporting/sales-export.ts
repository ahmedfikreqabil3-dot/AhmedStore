import type { SalesExportQuery } from '@ahmed-store/contracts';

export type SalesExportLine = { saleId: string; occurredAt: Date; customerName: string; warehouseName: string; productName: string; sku: string; quantity: string; unitPrice: string; discount: string; lineTotal: string; invoiceTotal: string; status: 'POSTED' | 'VOIDED' };

function cell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export function salesExportCsv(lines: SalesExportLine[]) {
  const header = ['invoice_id', 'occurred_at', 'customer', 'warehouse', 'product', 'sku', 'quantity', 'unit_price', 'discount', 'line_total', 'invoice_total', 'status'];
  const rows = lines.map((line) => [line.saleId, line.occurredAt.toISOString(), line.customerName, line.warehouseName, line.productName, line.sku, line.quantity, line.unitPrice, line.discount, line.lineTotal, line.invoiceTotal, line.status].map(cell).join(','));
  return `\uFEFF${header.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}

export interface SalesExportRepository {
  list(organizationId: string, query: SalesExportQuery): Promise<SalesExportLine[]>;
  audit(organizationId: string, actorUserId: string): Promise<void>;
}

export function createSalesExportService(repository: SalesExportRepository) {
  return { async exportCsv(organizationId: string, actorUserId: string, query: SalesExportQuery) { const lines = await repository.list(organizationId, query); await repository.audit(organizationId, actorUserId); return salesExportCsv(lines); } };
}
