import type { SalesExportQuery } from '@ahmed-store/contracts';
import ExcelJS from 'exceljs';

export type SalesExportLine = { saleId: string; occurredAt: Date; customerName: string; warehouseName: string; productName: string; sku: string; quantity: string; unitPrice: string; discount: string; lineTotal: string; invoiceTotal: string; status: 'POSTED' | 'VOIDED' };

function cell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export function salesExportCsv(lines: SalesExportLine[]) {
  const header = ['invoice_id', 'occurred_at', 'customer', 'warehouse', 'product', 'sku', 'quantity', 'unit_price', 'discount', 'line_total', 'invoice_total', 'status'];
  const rows = lines.map((line) => [line.saleId, line.occurredAt.toISOString(), line.customerName, line.warehouseName, line.productName, line.sku, line.quantity, line.unitPrice, line.discount, line.lineTotal, line.invoiceTotal, line.status].map(cell).join(','));
  return `\uFEFF${header.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}

export async function salesExportXlsx(lines: SalesExportLine[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ahmed Store';
  const worksheet = workbook.addWorksheet('Sales history', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = [
    { header: 'Invoice ID', key: 'saleId', width: 38 }, { header: 'Occurred at', key: 'occurredAt', width: 24 }, { header: 'Customer', key: 'customerName', width: 24 }, { header: 'Branch', key: 'warehouseName', width: 20 },
    { header: 'Product', key: 'productName', width: 28 }, { header: 'SKU', key: 'sku', width: 16 }, { header: 'Quantity', key: 'quantity', width: 14 }, { header: 'Unit price', key: 'unitPrice', width: 14 },
    { header: 'Discount', key: 'discount', width: 14 }, { header: 'Line total', key: 'lineTotal', width: 14 }, { header: 'Invoice total', key: 'invoiceTotal', width: 16 }, { header: 'Status', key: 'status', width: 12 }
  ];
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A70' } };
  for (const line of lines) worksheet.addRow({ ...line, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discount: Number(line.discount), lineTotal: Number(line.lineTotal), invoiceTotal: Number(line.invoiceTotal) });
  for (const column of ['G', 'H', 'I', 'J', 'K']) worksheet.getColumn(column).numFmt = '#,##0.0000';
  worksheet.getColumn('B').numFmt = 'yyyy-mm-dd hh:mm';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export interface SalesExportRepository {
  list(organizationId: string, query: SalesExportQuery): Promise<SalesExportLine[]>;
  audit(organizationId: string, actorUserId: string): Promise<void>;
}

export function createSalesExportService(repository: SalesExportRepository) {
  return {
    async exportCsv(organizationId: string, actorUserId: string, query: SalesExportQuery) { const lines = await repository.list(organizationId, query); await repository.audit(organizationId, actorUserId); return salesExportCsv(lines); },
    async exportXlsx(organizationId: string, actorUserId: string, query: SalesExportQuery) { const lines = await repository.list(organizationId, query); const workbook = await salesExportXlsx(lines); await repository.audit(organizationId, actorUserId); return workbook; }
  };
}
