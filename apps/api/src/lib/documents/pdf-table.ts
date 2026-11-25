import { createRequire } from 'node:module';
import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { cellText, type TableColumn } from './table';

// The fourteen standard PDF fonts are built into every reader, so nothing
// needs to be embedded or shipped. For other scripts, register a TTF instead.
const require = createRequire(import.meta.url);
pdfMake.addFonts(require('pdfmake/standard-fonts/Helvetica') as typeof pdfMake.fonts);

export interface TableReport<T> {
  title: string;
  subtitle?: string;
  columns: TableColumn<T>[];
  rows: readonly T[];
  orientation?: 'portrait' | 'landscape';
}

const BRAND = '#1d4ed8';

/**
 * Renders a tabular report with pdfmake. pdfmake is declarative — describe
 * the document and it handles layout, page breaks and repeating headers — so
 * it is the right tool for tables. For free-form layouts see ./pdf-document.ts.
 */
export function buildTablePdf<T>(report: TableReport<T>): Promise<Buffer> {
  const heading: Content[] = [{ text: report.title, style: 'title' }];
  if (report.subtitle) heading.push({ text: report.subtitle, style: 'subtitle' });

  const definition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: report.orientation ?? 'landscape',
    pageMargins: [36, 48, 36, 48],
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    info: { title: report.title, creator: 'BossByte' },
    content: [
      ...heading,
      {
        table: {
          headerRows: 1,
          widths: report.columns.map(() => '*'),
          body: [
            report.columns.map((column) => ({ text: column.header, style: 'th' })),
            ...report.rows.map((row) =>
              report.columns.map((column) => cellText(column.value(row))),
            ),
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#e5e7eb',
          fillColor: (rowIndex: number) =>
            rowIndex === 0 ? BRAND : rowIndex % 2 === 0 ? '#f9fafb' : null,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'right',
      margin: [36, 16, 36, 0],
      fontSize: 8,
      color: '#6b7280',
    }),
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 9, color: '#6b7280', margin: [0, 0, 0, 12] },
      th: { bold: true, color: '#ffffff' },
    },
  };

  return pdfMake.createPdf(definition).getBuffer();
}
