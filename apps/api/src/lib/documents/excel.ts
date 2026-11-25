import ExcelJS from 'exceljs';
import { neutraliseFormula, type TableColumn } from './table';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface WorkbookSheet<T> {
  name: string;
  columns: TableColumn<T>[];
  rows: readonly T[];
}

/** Builds a single-sheet workbook with a styled, frozen header row and an auto-filter. */
export function buildWorkbook<T>(sheet: WorkbookSheet<T>, creator = 'BossByte'): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = creator;
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = sheet.columns.map((column, index) => ({
    header: column.header,
    key: String(index),
    width: column.width ?? Math.max(12, column.header.length + 4),
  }));

  for (const row of sheet.rows) {
    worksheet.addRow(
      sheet.columns.map((column) => {
        const value = column.value(row);
        return typeof value === 'string' ? neutraliseFormula(value) : (value ?? null);
      }),
    );
  }

  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  header.alignment = { vertical: 'middle' };
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  return workbook;
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Shorthand for the common case: rows in, .xlsx bytes out. */
export function buildXlsx<T>(sheet: WorkbookSheet<T>): Promise<Buffer> {
  return workbookToBuffer(buildWorkbook(sheet));
}

/** Reads the first sheet of an .xlsx file into objects keyed by the header row. */
export async function parseXlsx(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell((cell, column) => {
    headers[column] = cell.text.trim();
  });

  const records: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header) record[header] = row.getCell(column).text.trim();
    });
    records.push(record);
  });
  return records;
}
