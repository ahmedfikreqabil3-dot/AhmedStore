import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createCategorySchema } from '@ahmed-store/contracts';

export type CategoryImportPreview = { valid: boolean; rows: Array<{ row: number; name: string }>; errors: Array<{ row: number; message: string }> };
export interface CategoryImportRepository {
  findNames(organizationId: string, names: string[]): Promise<string[]>;
  createAtomically(organizationId: string, actorUserId: string, categories: Array<{ id: string; name: string }>): Promise<void>;
}

export async function categoryImportTemplate() {
  const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('Categories', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = [{ header: 'Name', key: 'name', width: 40 }]; worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A70' } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function previewCategoryImport(file: Buffer): Promise<CategoryImportPreview> {
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file as any); const worksheet = workbook.getWorksheet('Categories');
    if (!worksheet || worksheet.getRow(1).getCell(1).text.trim() !== 'Name') return { valid: false, rows: [], errors: [{ row: 1, message: 'EXPECTED_NAME_COLUMN' }] };
    const rows: Array<{ row: number; name: string }> = []; const errors: Array<{ row: number; message: string }> = []; const seen = new Set<string>();
    for (let row = 2; row <= worksheet.rowCount; row += 1) {
      const name = worksheet.getRow(row).getCell(1).text.trim(); if (!name) continue;
      if (!createCategorySchema.safeParse({ name }).success) errors.push({ row, message: 'INVALID_NAME' }); else if (seen.has(name.toLocaleLowerCase())) errors.push({ row, message: 'DUPLICATE_IN_FILE' }); else { seen.add(name.toLocaleLowerCase()); rows.push({ row, name }); }
    }
    if (!rows.length) errors.push({ row: 2, message: 'NO_ROWS' });
    return { valid: errors.length === 0, rows, errors };
  } catch { return { valid: false, rows: [], errors: [{ row: 1, message: 'INVALID_WORKBOOK' }] }; }
}

export function createCategoryImportService(repository: CategoryImportRepository) {
  return {
    template: categoryImportTemplate,
    preview: previewCategoryImport,
    async import(organizationId: string, actorUserId: string, file: Buffer) {
      const preview = await previewCategoryImport(file); if (!preview.valid) return { ok: false as const, preview };
      const existing = new Set((await repository.findNames(organizationId, preview.rows.map((row) => row.name))).map((name) => name.toLocaleLowerCase()));
      const errors = preview.rows.filter((row) => existing.has(row.name.toLocaleLowerCase())).map((row) => ({ row: row.row, message: 'CATEGORY_EXISTS' }));
      if (errors.length) return { ok: false as const, preview: { ...preview, valid: false, errors } };
      await repository.createAtomically(organizationId, actorUserId, preview.rows.map((row) => ({ id: randomUUID(), name: row.name })));
      return { ok: true as const, imported: preview.rows.length };
    }
  };
}
