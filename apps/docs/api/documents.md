# Documents and exports

`apps/api/src/lib/documents/` builds and reads the file formats a back-office app keeps needing:
CSV, Excel, PDF, QR codes and zip archives. Every helper is a plain function that returns a
`Buffer` or a stream, so the same code runs in a route, in a job and in a unit test.

```ts
import { buildCsv, buildTablePdf, buildXlsx, buildZip } from '../../lib/documents';
```

| Format | Build                                            | Read        | Library             |
| ------ | ------------------------------------------------ | ----------- | ------------------- |
| CSV    | `buildCsv`, `createCsvStream`                    | `parseCsv`  | fast-csv, csv-parse |
| Excel  | `buildXlsx`, `buildWorkbook`, `workbookToBuffer` | `parseXlsx` | ExcelJS             |
| PDF    | `buildTablePdf`, `buildSummaryPdf`               | —           | pdfmake, PDFKit     |
| QR     | `qrCodeDataUrl`, `qrCodePng`                     | —           | qrcode              |
| Zip    | `buildZip`, `createZipStream`                    | —           | archiver            |

## Describe a table once

CSV, Excel and the table PDF all take the same column description:

```ts
export interface TableColumn<T> {
  header: string;
  /** The cell value for a row. Dates are formatted by each exporter. */
  value: (row: T) => string | number | boolean | Date | null | undefined;
  /** Spreadsheet column width, in characters. */
  width?: number;
}
```

Define the columns once and render them three ways. This is the users export
(`src/modules/reports/reports.service.ts`), shortened:

```ts
import type { User } from '@bossbyte/shared';
import type { TableColumn } from '../../lib/documents';

export const USER_EXPORT_COLUMNS: TableColumn<User>[] = [
  { header: 'Name', value: (user) => user.name, width: 28 },
  { header: 'Email', value: (user) => user.email, width: 34 },
  { header: 'Active', value: (user) => user.isActive },
  { header: 'Created', value: (user) => new Date(user.createdAt), width: 22 },
];
```

```ts
const xlsx = await buildXlsx({ name: 'Users', columns: USER_EXPORT_COLUMNS, rows });
const csv = await buildCsv(USER_EXPORT_COLUMNS, rows);
const pdf = await buildTablePdf({ title: 'Users', columns: USER_EXPORT_COLUMNS, rows });
```

Formats without native types (CSV and PDF) convert each value with `cellText`: `null` and
`undefined` become an empty string, a `Date` becomes an ISO 8601 string and a boolean becomes
`Yes` or `No`. Excel keeps numbers, booleans and dates as real cell values.

## The formula guard

::: warning Exported text that starts with = + - or @ gets a leading apostrophe
Spreadsheet applications run a cell beginning with `=`, `+`, `-` or `@` as a formula. A user who
sets their name to `=HYPERLINK("http://evil.example")` would otherwise attack whoever opens your
export. `neutraliseFormula` prefixes such values (and ones starting with a tab or carriage
return) with `'`, which makes them plain text.
:::

It is applied to every cell in CSV output and to every **string** cell in Excel output. It is not
applied to PDFs, which have no formulas.

The side effect you will notice first is on phone numbers in international form:

| Stored value             | In the CSV or XLSX file |
| ------------------------ | ----------------------- |
| `+63 917 555 0102`       | `'+63 917 555 0102`     |
| `0917 555 0102`          | `0917 555 0102`         |
| `-5` (as a string)       | `'-5`                   |
| `-5` (as a number, XLSX) | `-5`                    |

Excel and LibreOffice treat the apostrophe as a "this is text" marker and hide it, so people
reading the file see the number as stored. A program that parses the CSV sees the apostrophe as
part of the value. If your export feeds another system rather than a person:

- return numbers as numbers from `value`, so Excel output is left alone, or
- strip one leading `'` on the consuming side, or
- build that particular file without the guard, and only if a spreadsheet will never open it.

`parseCsv` and `parseXlsx` do not remove the apostrophe when you read a file back in.

## CSV

```ts
const buffer = await buildCsv(columns, rows);
```

The output starts with a UTF-8 byte-order mark, so Excel opens it as UTF-8 instead of guessing an
encoding and mangling accented names.

For large exports, stream instead of building a buffer. `createCsvStream` accepts any iterable or
async iterable and respects backpressure, so memory stays flat:

```ts
res.set({ 'Content-Type': 'text/csv; charset=utf-8' });
createCsvStream(columns, rowsFromCursor()).pipe(res);
```

Reading:

```ts
const records = parseCsv(file.buffer);
// [{ name: 'Ada Lovelace', email: 'ada@example.com' }, …]
```

`parseCsv` takes a `Buffer` or a string and returns objects keyed by the header row. Header names
are trimmed and lower-cased, so `Email` and `email` both become `email`. Values are trimmed,
empty lines are skipped and every value is a string.

## Excel

```ts
const buffer = await buildXlsx({ name: 'Users', columns, rows });
```

The sheet gets a bold, coloured header row that stays frozen while scrolling, and an auto-filter.
Column widths come from `width`, or from the header length when you leave it out.

When you need more than one sheet or your own styling, get the ExcelJS workbook and finish it
yourself:

```ts
import { buildWorkbook, workbookToBuffer, XLSX_MIME_TYPE } from '../../lib/documents';

const workbook = buildWorkbook({ name: 'Users', columns, rows });
workbook.addWorksheet('Notes').addRow(['Generated for the quarterly review']);
const buffer = await workbookToBuffer(workbook);

res.type(XLSX_MIME_TYPE).send(buffer);
```

Reading:

```ts
const records = await parseXlsx(file.buffer);
```

`parseXlsx` reads the **first sheet** and returns objects keyed by the header row. Unlike
`parseCsv`, the keys keep the capitalisation used in the file (`Email`, not `email`); lower-case
them yourself if you accept both formats, as `readImportRows` in the reports service does.

## PDF

Two libraries, for two different jobs.

### Tables: `buildTablePdf`

pdfmake is declarative: you describe the document and it handles layout, page breaks and the
header row repeating on every page.

```ts
const buffer = await buildTablePdf({
  title: 'BossByte users',
  subtitle: `${rows.length} user(s) · generated 2026-11-23`,
  columns: USER_EXPORT_COLUMNS,
  rows,
  orientation: 'landscape', // the default; or 'portrait'
});
```

It uses Helvetica, one of the fonts built into every PDF reader, so nothing is embedded. That
also means it only covers Latin text. For other scripts, register a TTF font with pdfmake in
`src/lib/documents/pdf-table.ts`.

### Free-form pages: `buildSummaryPdf`

PDFKit is imperative: you place every element yourself. That suits letters, certificates and
cover pages. `buildSummaryPdf` draws a one-page A4 summary: a title, a grid of metric cards three
across, paragraphs, and optionally a QR code in the footer.

```ts
const buffer = await buildSummaryPdf({
  title: 'BossByte summary',
  subtitle: 'Generated 2026-11-23',
  metrics: [
    { label: 'Users', value: '128' },
    { label: 'Storage used', value: '2.4 MB' },
  ],
  paragraphs: ['New accounts over the last 6 months: …'],
  qrCodeUrl: 'https://app.example.com',
});
```

Metric values are strings: format numbers before you pass them. Use
`src/lib/documents/pdf-document.ts` as the starting point for your own layouts.

## QR codes

```ts
const dataUrl = await qrCodeDataUrl('otpauth://totp/…'); // 'data:image/png;base64,…'
const png = await qrCodePng('https://app.example.com/files/42'); // Buffer
```

Both produce a 240-pixel PNG with error-correction level M. The data URL goes straight into an
`<img src>`; the two-factor setup endpoint returns one for the authenticator app to scan. The
buffer form is for embedding in PDFs or sending as a file.

## Zip archives

```ts
const zip = await buildZip([
  { name: 'users.csv', content: csv },
  { name: 'reports/summary.pdf', content: pdf },
]);
```

`content` can be a `Buffer`, a string or a readable stream, and `name` can contain folders. For
large archives, `createZipStream(entries)` returns a stream to pipe to the response.

## Sending a file from a route

Set the type, a safe `Content-Disposition` and, for anything holding personal data,
`Cache-Control: no-store`:

```ts
import { attachmentDisposition } from '../../lib/storage/types';

res
  .status(200)
  .set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': attachmentDisposition('users-2026-11-23.csv'),
    'Cache-Control': 'no-store',
  })
  .end(buffer);
```

`Content-Disposition` is on the CORS exposed-headers list, so the dashboard's `api.download()`
can read the file name from it.

## The reports API

The reports module puts these helpers to work. All routes need a signed-in user; paths are
relative to `/api/v1/reports`.

| Method and path              | Permission       | Result                                              |
| ---------------------------- | ---------------- | --------------------------------------------------- |
| `GET /stats`                 | `reports:read`   | Dashboard figures, cached in Redis for 60 seconds   |
| `GET /users.xlsx`            | `reports:export` | `users-YYYY-MM-DD.xlsx`                             |
| `GET /users.csv`             | `reports:export` | `users-YYYY-MM-DD.csv`                              |
| `GET /users.pdf`             | `reports:export` | `users-YYYY-MM-DD.pdf` (pdfmake table)              |
| `GET /summary.pdf`           | `reports:export` | `summary-YYYY-MM-DD.pdf` (PDFKit page with QR code) |
| `GET /bundle.zip`            | `reports:export` | `reports-YYYY-MM-DD.zip` holding all four files     |
| `POST /users/import/preview` | `users:write`    | Validation result for an import file                |
| `POST /exports`              | `reports:export` | 202 with a queued export job                        |
| `GET /exports/:id`           | `reports:export` | The job's status, and a download URL when complete  |

```bash
curl -OJ http://localhost:4000/api/v1/reports/users.xlsx \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Every download is recorded in the audit log as `report.exported`.

### Downloads built in the request

The five `GET` downloads build the file while the client waits. That is fine for a few thousand
rows. For more, queue it.

### Downloads built by the worker

`POST /exports` with `{ "format": "xlsx" }` or `{ "format": "csv" }` adds a job to the `reports`
queue and returns at once. The worker builds the file, stores it and emails a link; the client
polls `GET /exports/:id` until `status` is `completed` and then downloads from `url`. The whole
flow is in [Background jobs](/api/jobs#the-export-job-end-to-end).

### Import preview

`POST /users/import/preview` takes `multipart/form-data` with a `.csv` or `.xlsx` file in a field
named `file`, and tells you what an import would do. **It writes nothing.**

```bash
curl http://localhost:4000/api/v1/reports/users/import/preview \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'file=@./people.csv'
```

The file needs `name` and `email` columns. `role` is optional and defaults to `viewer`. Header
capitalisation does not matter.

```json
{
  "total": 3,
  "valid": [{ "row": 2, "name": "Ada Lovelace", "email": "ada@example.com", "role": "staff" }],
  "invalid": [
    { "row": 3, "errors": ["email: Enter a valid email address"] },
    { "row": 4, "errors": ["email: An account with that email already exists"] }
  ]
}
```

Row numbers match what a spreadsheet shows: the header is row 1, so data starts at row 2. A row
is invalid when it fails `userImportRowSchema`, when its email appears twice in the file, or when
an account with that email already exists.

| Code                        | Status | Cause                     |
| --------------------------- | ------ | ------------------------- |
| `file_required`             | 400    | No `file` field           |
| `unsupported_import_format` | 400    | Not a CSV or XLSX file    |
| `import_too_large`          | 400    | More than 5,000 data rows |

The preview is the first half of an import. Creating the accounts is left to you, because how to
set first passwords is a product decision: show the preview, then send the valid rows to
`POST /api/v1/users` one by one, or add a bulk endpoint that invites each person by email.
