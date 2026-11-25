import { describe, expect, it } from 'vitest';
import { buildTablePdf, buildTableXlsx, cellText, type TableExport } from './exports';

interface Person {
  name: string;
  age: number;
  active: boolean;
  joined: Date;
}

const table: TableExport<Person> = {
  title: 'Users: active/all',
  subtitle: 'Page 1',
  columns: [
    { header: 'Name', value: (person) => person.name, width: 2 },
    { header: 'Age', value: (person) => person.age },
    { header: 'Active', value: (person) => person.active },
    { header: 'Joined', value: (person) => person.joined },
  ],
  rows: [
    { name: 'Ada Lovelace', age: 36, active: true, joined: new Date('2026-01-05T00:00:00Z') },
    { name: 'Grace Hopper', age: 85, active: false, joined: new Date('2026-02-10T00:00:00Z') },
  ],
};

describe('cellText', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [true, 'Yes'],
    [false, 'No'],
    [0, '0'],
    [1250.5, '1250.5'],
    ['Ada', 'Ada'],
  ])('renders %s as "%s"', (value, text) => {
    expect(cellText(value)).toBe(text);
  });

  it('renders a date as its ISO day', () => {
    expect(cellText(new Date('2026-01-05T10:30:00Z'))).toBe('2026-01-05');
  });
});

describe('buildTableXlsx', () => {
  it('writes a workbook with a header row and typed cells', async () => {
    const blob = await buildTableXlsx(table);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.worksheets[0];

    // Excel does not allow ":" or "/" in a sheet name.
    expect(sheet?.name).toBe('Users  active all');
    expect(sheet?.getRow(1).values).toEqual([undefined, 'Name', 'Age', 'Active', 'Joined']);
    expect(sheet?.getRow(1).font.bold).toBe(true);
    expect(sheet?.getCell('A2').value).toBe('Ada Lovelace');
    expect(sheet?.getCell('B2').value).toBe(36);
    expect(sheet?.getCell('C3').value).toBe(false);
    expect(sheet?.getCell('D2').value).toEqual(new Date('2026-01-05T00:00:00Z'));
    expect(sheet?.rowCount).toBe(3);
  });
});

describe('buildTablePdf', () => {
  it('writes a PDF, adding pages as the rows need them', async () => {
    const longTable: TableExport<Person> = {
      ...table,
      rows: Array.from({ length: 80 }, () => table.rows).flat(),
    };

    const blob = await buildTablePdf(longTable);
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
