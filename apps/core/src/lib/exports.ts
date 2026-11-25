import { saveBlob } from './download';

export type ExportCell = string | number | boolean | Date | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => ExportCell;
  /** Relative width; columns share the available space in proportion. Defaults to 1. */
  width?: number;
}

export interface TableExport<T> {
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: readonly T[];
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** How a cell reads in a PDF, where everything is text. */
export function cellText(value: ExportCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const PDF = {
  margin: 36,
  headerHeight: 22,
  cellPadding: 5,
  lineHeight: 11,
  fontSize: 9,
  brand: [91, 58, 232],
  text: [15, 23, 42],
  muted: [100, 116, 139],
  stripe: [248, 250, 252],
} as const;

/**
 * Renders a table as a landscape A4 PDF in the browser with jsPDF: wrapped
 * cells, a header row repeated on every page and page numbers.
 *
 * jsPDF is imported on first use, so it stays out of the main bundle.
 */
export async function buildTablePdf<T>(table: TableExport<T>): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = pageWidth - PDF.margin * 2;
  const totalWeight = table.columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
  const widths = table.columns.map((column) => ((column.width ?? 1) / totalWeight) * tableWidth);

  let y = PDF.margin;

  function drawHeaderRow() {
    doc.setFillColor(...PDF.brand);
    doc.rect(PDF.margin, y, tableWidth, PDF.headerHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF.fontSize);
    doc.setTextColor(255, 255, 255);
    let x = PDF.margin;
    table.columns.forEach((column, index) => {
      doc.text(column.header, x + PDF.cellPadding, y + 14);
      x += widths[index] ?? 0;
    });
    y += PDF.headerHeight;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.text);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF.text);
  doc.text(table.title, PDF.margin, y + 12);
  y += 24;
  if (table.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF.fontSize);
    doc.setTextColor(...PDF.muted);
    doc.text(table.subtitle, PDF.margin, y + 6);
    y += 18;
  }
  drawHeaderRow();

  table.rows.forEach((row, rowIndex) => {
    const cells = table.columns.map((column, index) => {
      const lines: unknown = doc.splitTextToSize(
        cellText(column.value(row)),
        (widths[index] ?? 0) - PDF.cellPadding * 2,
      );
      return lines as string[];
    });
    const lineCount = Math.max(1, ...cells.map((lines) => lines.length));
    const rowHeight = lineCount * PDF.lineHeight + PDF.cellPadding * 2;

    if (y + rowHeight > pageHeight - PDF.margin) {
      doc.addPage();
      y = PDF.margin;
      drawHeaderRow();
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(...PDF.stripe);
      doc.rect(PDF.margin, y, tableWidth, rowHeight, 'F');
    }

    let x = PDF.margin;
    cells.forEach((lines, index) => {
      doc.text(lines, x + PDF.cellPadding, y + PDF.cellPadding + PDF.fontSize - 1);
      x += widths[index] ?? 0;
    });
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(...PDF.muted);
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PDF.margin, pageHeight - 18, {
      align: 'right',
    });
  }

  return doc.output('blob');
}

/**
 * Builds an Excel workbook in the browser with exceljs: a bold, frozen header
 * row and typed cells (numbers stay numbers, dates stay dates).
 *
 * exceljs is imported on first use, so it stays out of the main bundle.
 */
export async function buildTableXlsx<T>(table: TableExport<T>): Promise<Blob> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.created = new Date();

  // Excel rejects these characters in sheet names, and anything over 31 characters.
  const sheetName = table.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = table.columns.map((column) => ({
    header: column.header,
    width: Math.max(12, column.header.length + 2) * (column.width ?? 1),
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of table.rows) {
    sheet.addRow(table.columns.map((column) => column.value(row) ?? null));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME_TYPE });
}

/**
 * Builds a PDF of the table and saves it as `<fileName>.pdf`.
 *
 * @example
 *   await exportTableToPdf('users', {
 *     title: 'Users',
 *     columns: [
 *       { header: 'Name', value: (user) => user.name, width: 2 },
 *       { header: 'Joined', value: (user) => new Date(user.createdAt) },
 *     ],
 *     rows: users,
 *   });
 */
export async function exportTableToPdf<T>(fileName: string, table: TableExport<T>): Promise<void> {
  saveBlob(await buildTablePdf(table), `${fileName}.pdf`);
}

/**
 * Builds an Excel workbook of the table and saves it as `<fileName>.xlsx`.
 * Takes the same table description as `exportTableToPdf`.
 *
 * @example
 *   await exportTableToXlsx('users', { title: 'Users', columns, rows: users });
 */
export async function exportTableToXlsx<T>(fileName: string, table: TableExport<T>): Promise<void> {
  saveBlob(await buildTableXlsx(table), `${fileName}.xlsx`);
}
