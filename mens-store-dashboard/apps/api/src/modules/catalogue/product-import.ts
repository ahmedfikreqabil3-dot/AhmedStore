import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createProductSchema } from '@ahmed-store/contracts';

export type ProductImportRow = { row: number; name: string; sku: string; barcode: string | null; category: string | null; salePrice: string; costPrice: string };
export type ProductImportPreview = { valid: boolean; rows: ProductImportRow[]; errors: Array<{ row: number; message: string }> };
export interface ProductImportRepository {
  findExisting(organizationId: string, skus: string[], barcodes: string[]): Promise<{ skus: string[]; barcodes: string[] }>;
  findCategories(organizationId: string, names: string[]): Promise<Array<{ id: string; name: string }>>;
  createAtomically(organizationId: string, actorUserId: string, products: Array<{ id: string; name: string; sku: string; barcode: string | null; categoryId: string | null; salePrice: string; costPrice: string }>): Promise<void>;
}

export async function productImportTemplate() {
  const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] }); worksheet.columns = [{ header: 'Name', width: 30 }, { header: 'SKU', width: 18 }, { header: 'Barcode', width: 20 }, { header: 'Category', width: 24 }, { header: 'Sale Price', width: 16 }, { header: 'Cost Price', width: 16 }]; worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A70' } }; return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function previewProductImport(file: Buffer): Promise<ProductImportPreview> {
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file as any); const worksheet = workbook.getWorksheet('Products'); const headers = ['Name', 'SKU', 'Barcode', 'Category', 'Sale Price', 'Cost Price'];
    if (!worksheet || headers.some((header, index) => worksheet.getRow(1).getCell(index + 1).text.trim() !== header)) return { valid: false, rows: [], errors: [{ row: 1, message: 'EXPECTED_PRODUCT_COLUMNS' }] };
    const rows: ProductImportRow[] = []; const errors: Array<{ row: number; message: string }> = []; const skus = new Set<string>(); const barcodes = new Set<string>();
    for (let row = 2; row <= worksheet.rowCount; row += 1) { const values = [1, 2, 3, 4, 5, 6].map((column) => worksheet.getRow(row).getCell(column).text.trim()); if (!values.some(Boolean)) continue; const [name, sku, barcodeText, categoryText, salePrice, costPrice] = values; const barcode = barcodeText || null; const category = categoryText || null; const parsed = createProductSchema.safeParse({ name, sku, barcode, categoryId: null, salePrice, costPrice }); if (!parsed.success) { errors.push({ row, message: 'INVALID_PRODUCT' }); continue; } const normalizedSku = parsed.data.sku; if (skus.has(normalizedSku)) { errors.push({ row, message: 'DUPLICATE_SKU_IN_FILE' }); continue; } if (barcode && barcodes.has(barcode)) { errors.push({ row, message: 'DUPLICATE_BARCODE_IN_FILE' }); continue; } skus.add(normalizedSku); if (barcode) barcodes.add(barcode); rows.push({ row, name: parsed.data.name, sku: normalizedSku, barcode, category, salePrice, costPrice }); }
    if (!rows.length && !errors.length) errors.push({ row: 2, message: 'NO_ROWS' }); return { valid: errors.length === 0, rows, errors };
  } catch { return { valid: false, rows: [], errors: [{ row: 1, message: 'INVALID_WORKBOOK' }] }; }
}

export function createProductImportService(repository: ProductImportRepository) { return { template: productImportTemplate, preview: previewProductImport, async import(organizationId: string, actorUserId: string, file: Buffer) { const preview = await previewProductImport(file); if (!preview.valid) return { ok: false as const, preview }; const categories = await repository.findCategories(organizationId, [...new Set(preview.rows.flatMap((row) => row.category ? [row.category] : []))]); const categoryIds = new Map(categories.map((category) => [category.name.toLocaleLowerCase(), category.id])); const missingCategory = preview.rows.filter((row) => row.category && !categoryIds.has(row.category.toLocaleLowerCase())).map((row) => ({ row: row.row, message: 'CATEGORY_UNAVAILABLE' })); const existing = await repository.findExisting(organizationId, preview.rows.map((row) => row.sku), preview.rows.flatMap((row) => row.barcode ? [row.barcode] : [])); const existingSkus = new Set(existing.skus.map((value) => value.toLocaleUpperCase())); const existingBarcodes = new Set(existing.barcodes); const conflicts = preview.rows.flatMap((row) => [existingSkus.has(row.sku) ? { row: row.row, message: 'SKU_EXISTS' } : null, row.barcode && existingBarcodes.has(row.barcode) ? { row: row.row, message: 'BARCODE_EXISTS' } : null].filter((item): item is { row: number; message: string } => item !== null)); const errors = [...missingCategory, ...conflicts]; if (errors.length) return { ok: false as const, preview: { ...preview, valid: false, errors } }; await repository.createAtomically(organizationId, actorUserId, preview.rows.map((row) => ({ id: randomUUID(), name: row.name, sku: row.sku, barcode: row.barcode, categoryId: row.category ? categoryIds.get(row.category.toLocaleLowerCase())! : null, salePrice: row.salePrice, costPrice: row.costPrice }))); return { ok: true as const, imported: preview.rows.length }; } }; }
