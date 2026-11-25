import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  buildSummaryPdf,
  buildTablePdf,
  buildXlsx,
  buildZip,
  cellText,
  neutraliseFormula,
  parseCsv,
  parseXlsx,
  qrCodeDataUrl,
  qrCodePng,
  type TableColumn,
} from './index';

interface Person {
  name: string;
  email: string;
  active: boolean;
  joined: Date;
}

const COLUMNS: TableColumn<Person>[] = [
  { header: 'Name', value: (person) => person.name },
  { header: 'Email', value: (person) => person.email },
  { header: 'Active', value: (person) => person.active },
  { header: 'Joined', value: (person) => person.joined },
];

const PEOPLE: Person[] = [
  {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    active: true,
    joined: new Date('2026-01-15T08:00:00Z'),
  },
  {
    name: 'José "Pepe" Rizal, Jr.',
    email: 'jose@example.com',
    active: false,
    joined: new Date('2026-02-01T00:00:00Z'),
  },
];

const startsWith = (buffer: Buffer, signature: string) =>
  buffer.subarray(0, signature.length).toString('latin1') === signature;

describe('table helpers', () => {
  it('renders cells as text', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(true)).toBe('Yes');
    expect(cellText(false)).toBe('No');
    expect(cellText(42)).toBe('42');
    expect(cellText(new Date('2026-01-15T08:00:00Z'))).toBe('2026-01-15T08:00:00.000Z');
  });

  it('defuses values a spreadsheet would run as a formula', () => {
    expect(neutraliseFormula('=HYPERLINK("http://evil.example")')).toBe(
      `'=HYPERLINK("http://evil.example")`,
    );
    expect(neutraliseFormula('+1')).toBe(`'+1`);
    expect(neutraliseFormula('-1')).toBe(`'-1`);
    expect(neutraliseFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutraliseFormula('plain text')).toBe('plain text');
  });
});

describe('CSV', () => {
  it('writes a header row, quotes what needs quoting and starts with a BOM', async () => {
    const csv = (await buildCsv(COLUMNS, PEOPLE)).toString('utf8');
    const lines = csv.replace('﻿', '').split('\n');

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('Name,Email,Active,Joined');
    expect(lines[1]).toBe('Ada Lovelace,ada@example.com,Yes,2026-01-15T08:00:00.000Z');
    expect(lines[2]).toContain('"José ""Pepe"" Rizal, Jr."');
  });

  it('round-trips through the parser', async () => {
    const records = parseCsv(await buildCsv(COLUMNS, PEOPLE));
    expect(records).toEqual([
      {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        active: 'Yes',
        joined: '2026-01-15T08:00:00.000Z',
      },
      {
        name: 'José "Pepe" Rizal, Jr.',
        email: 'jose@example.com',
        active: 'No',
        joined: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('normalises headers and skips blank lines', () => {
    expect(parseCsv(' Name , EMAIL \nAda, ada@example.com \n\n')).toEqual([
      { name: 'Ada', email: 'ada@example.com' },
    ]);
  });

  it('neutralises formulas on the way out', async () => {
    const csv = await buildCsv(
      [{ header: 'Note', value: (row: { note: string }) => row.note }],
      [{ note: '=1+1' }],
    );
    expect(csv.toString('utf8')).toContain(`'=1+1`);
  });
});

describe('XLSX', () => {
  it('builds a workbook that reads back', async () => {
    const buffer = await buildXlsx({ name: 'People', columns: COLUMNS, rows: PEOPLE });
    // .xlsx is a zip archive.
    expect(startsWith(buffer, 'PK')).toBe(true);

    const records = await parseXlsx(buffer);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ Name: 'Ada Lovelace', Email: 'ada@example.com' });
    expect(records[1]!.Name).toBe('José "Pepe" Rizal, Jr.');
  });

  it('neutralises formulas on the way out', async () => {
    const buffer = await buildXlsx({
      name: 'Notes',
      columns: [{ header: 'Note', value: (row: { note: string }) => row.note }],
      rows: [{ note: '=cmd|"/c calc"!A1' }],
    });
    const [record] = await parseXlsx(buffer);
    expect(record!.Note).toBe(`'=cmd|"/c calc"!A1`);
  });
});

describe('PDF', () => {
  it('renders a table report with pdfmake', async () => {
    const buffer = await buildTablePdf({
      title: 'People',
      subtitle: 'Test',
      columns: COLUMNS,
      rows: PEOPLE,
    });
    expect(startsWith(buffer, '%PDF-')).toBe(true);
    expect(buffer.length).toBeGreaterThan(1_000);
  });

  it('renders a summary with PDFKit, with and without a QR code', async () => {
    const summary = {
      title: 'Summary',
      metrics: [{ label: 'Users', value: '4' }],
      paragraphs: ['Hello.'],
    };
    const plain = await buildSummaryPdf(summary);
    const withQrCode = await buildSummaryPdf({
      ...summary,
      qrCodeUrl: 'https://example.com/report',
    });

    expect(startsWith(plain, '%PDF-')).toBe(true);
    expect(startsWith(withQrCode, '%PDF-')).toBe(true);
    expect(withQrCode.length).toBeGreaterThan(plain.length);
  });
});

describe('zip', () => {
  it('archives buffers and strings', async () => {
    const buffer = await buildZip([
      { name: 'hello.txt', content: 'hello' },
      { name: 'nested/data.bin', content: Buffer.from([1, 2, 3]) },
    ]);
    expect(startsWith(buffer, 'PK')).toBe(true);
    // File names are stored uncompressed in the central directory.
    expect(buffer.includes('hello.txt')).toBe(true);
    expect(buffer.includes('nested/data.bin')).toBe(true);
  });
});

describe('QR codes', () => {
  it('renders a data URL and a PNG', async () => {
    expect(await qrCodeDataUrl('otpauth://totp/test')).toMatch(/^data:image\/png;base64,/);
    expect(startsWith(await qrCodePng('https://example.com'), '\x89PNG')).toBe(true);
  });
});
