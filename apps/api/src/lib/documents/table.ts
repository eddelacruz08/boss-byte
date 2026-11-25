/**
 * One description of a table, shared by every exporter: the same columns can
 * be rendered as a spreadsheet, a CSV file or a PDF.
 */
export interface TableColumn<T> {
  header: string;
  /** The cell value for a row. Dates are formatted by each exporter. */
  value: (row: T) => string | number | boolean | Date | null | undefined;
  /** Spreadsheet column width, in characters. */
  width?: number;
}

export type CellValue = ReturnType<TableColumn<unknown>['value']>;

/** Plain-text form of a cell, for formats that have no native types. */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Spreadsheet applications run cells starting with =, +, - or @ as formulas,
 * which turns exported user input into an attack on whoever opens the file.
 * Prefixing a quote makes them plain text.
 */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
