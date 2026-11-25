import type { Readable } from 'node:stream';
import { format } from 'fast-csv';
import { parse } from 'csv-parse/sync';
import { cellText, neutraliseFormula, type TableColumn } from './table';

// A byte-order mark makes Excel open the file as UTF-8 instead of guessing.
const UTF8_BOM = '﻿';

/**
 * Streams rows out as CSV (fast-csv). Because it is a stream, it can be piped
 * straight to a response or an upload without holding the whole file in memory.
 *
 * @example
 *   createCsvStream(columns, rows).pipe(res);
 */
export function createCsvStream<T>(
  columns: TableColumn<T>[],
  rows: Iterable<T> | AsyncIterable<T>,
): Readable {
  const stream = format({ headers: columns.map((column) => column.header), writeBOM: true });

  void (async () => {
    try {
      for await (const row of rows) {
        const record = columns.map((column) => neutraliseFormula(cellText(column.value(row))));
        // Respect backpressure rather than buffering every row.
        if (!stream.write(record)) await new Promise((resolve) => stream.once('drain', resolve));
      }
      stream.end();
    } catch (error) {
      stream.destroy(error as Error);
    }
  })();

  return stream;
}

export async function buildCsv<T>(columns: TableColumn<T>[], rows: Iterable<T>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of createCsvStream(columns, rows))
    chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/**
 * Parses CSV text (csv-parse) into objects keyed by the header row. Header
 * names are trimmed and lower-cased so "Email" and " email " both become `email`.
 */
export function parseCsv(input: Buffer | string): Record<string, string>[] {
  const text = (typeof input === 'string' ? input : input.toString('utf8')).replace(UTF8_BOM, '');
  return parse(text, {
    columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}
