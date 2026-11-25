# Exports and downloads

There are four ways a file gets from BossByte to someone's device. The dashboard has a working
example of each.

| Approach                                                          | Use it when                                          | Example      |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| [Build it in the browser](#build-a-file-in-the-browser)           | The rows are already on screen                       | Users page   |
| [Download a report from the API](#download-a-report-from-the-api) | The file needs every row, or server-side formatting  | Reports page |
| [Queue an export](#queued-exports)                                | Building the file takes longer than a request should | Reports page |
| [Open a signed link](#files-in-storage)                           | The file already exists in object storage            | Files page   |

## Build a file in the browser

`src/lib/exports.ts` turns any array of rows into a PDF or an Excel workbook, without a request
to the API. You describe the table once and use it for both formats.

```tsx
import { exportTableToPdf, exportTableToXlsx, type ExportColumn } from '@/lib/exports';

const EXPORT_COLUMNS: ExportColumn<User>[] = [
  { header: 'Name', value: (user) => user.name, width: 2 },
  { header: 'Email', value: (user) => user.email, width: 2.5 },
  { header: 'Role', value: (user) => ROLE_LABELS[user.role] },
  { header: 'Active', value: (user) => user.isActive },
  {
    header: 'Last sign-in',
    value: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt) : null),
    width: 1.5,
  },
  { header: 'Joined', value: (user) => new Date(user.createdAt), width: 1.5 },
];
```

A column has three parts:

| Field    | Type                                                                | Notes                                        |
| -------- | ------------------------------------------------------------------- | -------------------------------------------- |
| `header` | `string`                                                            | The column heading                           |
| `value`  | `(row) => string \| number \| boolean \| Date \| null \| undefined` | The cell. Return the real type, not a string |
| `width`  | `number`                                                            | Relative width. The default is 1             |

Then call one of the two functions with a file name (no extension) and the table:

```tsx
const exportPage = useMutation({
  mutationFn: (format: 'pdf' | 'xlsx') => {
    const table = {
      title: 'Users',
      subtitle: `Page ${meta?.page ?? 1} of ${meta?.totalPages ?? 1} · exported ${formatDate(new Date())}`,
      columns: EXPORT_COLUMNS,
      rows,
    };
    return format === 'pdf' ? exportTableToPdf('users', table) : exportTableToXlsx('users', table);
  },
  onError: () => toast({ title: 'The export could not be created', tone: 'danger' }),
});
```

```tsx
<Button
  variant="outline"
  disabled={rows.length === 0 || exportPage.isPending}
  loading={exportPage.isPending && exportPage.variables === 'pdf'}
  onClick={() => exportPage.mutate('pdf')}
>
  Export PDF
</Button>
```

Wrapping the call in a mutation gives the button its loading state. `exportPage.variables` is
the format that was asked for, so only the pressed button spins while both are disabled.

### What you get

|                | PDF (`exportTableToPdf`)                        | Excel (`exportTableToXlsx`)                  |
| -------------- | ----------------------------------------------- | -------------------------------------------- |
| Library        | jsPDF                                           | exceljs                                      |
| Layout         | Landscape A4. Title, optional subtitle, table   | One sheet, named after the title             |
| Header row     | Brand colour, repeated on every page            | Bold and frozen                              |
| Long text      | Wraps inside its cell                           | Left to Excel                                |
| Numbers, dates | Text. A date prints as `2026-11-23`             | Stay numbers and dates, so they sort and sum |
| Booleans       | `Yes` or `No`                                   | `TRUE` or `FALSE`                            |
| `null`         | An empty cell                                   | An empty cell                                |
| `subtitle`     | Printed under the title                         | Not used                                     |
| Extras         | Striped rows, `Page 1 of 3` at the bottom right | —                                            |

Return the real type from `value` and let each format decide how to show it. A date returned as
a formatted string cannot be sorted in Excel. To print a boolean as words in both formats,
return the words: `value: (user) => (user.isActive ? 'Active' : 'Deactivated')`.

In the PDF, columns share the page width in proportion to `width`. In the workbook, `width`
multiplies a base width taken from the header's length.

Excel sheet names cannot contain `\ / ? * [ ] :` or be longer than 31 characters. The title is
cleaned and cut to fit.

### What to know before you use it

- **It exports the rows you give it.** The users page passes the rows of the current page, and
  says so in the subtitle. For every row that matches, use a server report.
- **The libraries load when the button is pressed.** `jspdf` and `exceljs` are imported inside
  the functions, so neither is in the main bundle. The first export waits for that download.
- **The PDF uses jsPDF's built-in Helvetica.** It covers Latin text. Other scripts need a font
  embedded in the document, which this helper does not do.
- **The API's formula guard is not applied here.** The helper writes each string as a text
  cell, and it has no CSV output. If you add CSV, add the guard too. See
  [The formula guard](/api/documents#the-formula-guard).

### The lower-level functions

`buildTablePdf(table)` and `buildTableXlsx(table)` return a `Blob` and save nothing. Use them to
upload a generated file instead of saving it, or in tests. `src/lib/exports.test.ts` reads the
workbook back and checks the cell types.

## Download a report from the API

The API builds five reports on demand. See [The reports API](/api/documents#the-reports-api).
They need the `Authorization` header, and a plain `<a href>` cannot send one. So the dashboard
fetches the file with `api.download` and saves it from memory
(`src/features/reports/api.ts`):

```ts
export async function downloadReport(report: ServerReport): Promise<void> {
  const { blob, fileName } = await api.download(report.path);
  saveBlob(blob, fileName ?? report.fileName);
}
```

`api.download` goes through the same client as every other request, so an expired access token
is renewed first and a failure is an `ApiError`. `fileName` comes from the response's
`Content-Disposition` header, which is where the API puts the date: `users-2026-11-23.xlsx`.
The fallback is used only when the header is missing.

The reports page runs it in a mutation, and marks the row that is loading:

```tsx
const download = useMutation({
  mutationFn: downloadReport,
  onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
});

<Button
  variant="outline"
  size="sm"
  aria-label={`Download ${report.label}`}
  disabled={download.isPending}
  loading={download.isPending && download.variables.path === report.path}
  onClick={() => download.mutate(report)}
>
  Download
</Button>;
```

To add a report, add the route on the API and one entry to `SERVER_REPORTS`:

```ts
{
  path: '/reports/users.pdf',
  label: 'Users (PDF)',
  description: 'A paginated table, ready to print.',
  fileName: 'users.pdf',
},
```

The whole file is held in memory before it is saved. That is fine for reports of this size. For
a large file, build it in the background and hand out a link, as below.

### `saveBlob`

`saveBlob(blob, fileName)` from `@/lib/download` saves any `Blob` under a name. It creates an
object URL, clicks a temporary link with the `download` attribute, and revokes the URL a second
later. Revoking it at once can cancel the download in Safari.

## Queued exports

When a file takes a while to build, the API hands the work to the worker and answers at once.
The dashboard then checks on the job until it is done. The server side is in
[The export job, end to end](/api/jobs#the-export-job-end-to-end).

**1. Queue the job.** `POST /reports/exports` answers with the job in its first state:

```ts
const queue = useMutation({
  mutationFn: reportsApi.queueExport,
  // The response is the job's first status, so polling starts from it.
  onSuccess: (job) => queryClient.setQueryData(exportJobQueryOptions(job.id).queryKey, job),
});
```

Writing the response into the cache means the status shows at once, without waiting for the
first poll.

**2. Poll until it has finished.** The query refetches every 1.5 seconds and stops by itself
when the status is `completed` or `failed`:

```ts
export function exportJobQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: ['reports', 'exports', jobId],
    queryFn: ({ signal }) => api.get<ExportJob>(`/reports/exports/${jobId}`, { signal }),
    refetchInterval: (query) => (isExportFinished(query.state.data) ? false : POLL_INTERVAL_MS),
    staleTime: Infinity,
  });
}
```

**3. Show the status, then the link.** A job is `queued`, `active`, `completed` or `failed`.
When it is complete, the response carries a signed `url`:

```tsx
function ExportJobStatus({ jobId }: { jobId: string }) {
  const job = useQuery(exportJobQueryOptions(jobId));

  if (job.isError) {
    return <QueryError error={job.error} title="The export could not be checked" />;
  }
  if (!job.data) return <Spinner label="Checking the export" />;

  const { status, url, fileName } = job.data;
  return (
    <p role="status" className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
      <Badge tone={JOB_STATUS[status].tone}>{JOB_STATUS[status].label}</Badge>
      {(status === 'queued' || status === 'active') && 'The worker is building your file.'}
      {status === 'failed' && 'The worker could not build this file. Queue it again.'}
      {status === 'completed' && url && <a href={url}>Download {fileName ?? 'the export'}</a>}
    </p>
  );
}
```

`role="status"` makes a screen reader announce the change from "Building" to "Ready" without
moving focus.

Things to keep in mind:

- **The worker has to be running.** `npm run dev` starts it. Without it the job stays `queued`.
- **The link is a plain `<a href>`.** A signed URL carries its own authorisation, so the browser
  can fetch it directly.
- **The link expires.** The `url` in the response is valid for 5 minutes. The query stops
  polling once the job has finished, so a page left open has a stale link. The worker also
  emails the requester a link that lasts 24 hours.
- **Polling stops when the component unmounts.** Leaving the reports page does not cancel the
  job, only the checking. The job id is kept in the mutation's state, so it is gone after
  navigation. If people need to come back to an export, store the job id somewhere durable, or
  rely on the email.

The same three steps fit any background job you add that has a result: one endpoint to start
it, one to read its status, and a query with `refetchInterval`.

## Files in storage

A file that already exists in object storage is downloaded straight from the store. The API only
signs a short-lived URL. See [Signed URLs](/api/storage#signed-urls).

```tsx
const download = useMutation({
  mutationFn: async (file: StoredFile) => startDownload((await filesApi.getUrl(file.id)).url),
  onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
});
```

`startDownload(url)` from `@/lib/download` clicks a temporary link to the URL. Two details
matter:

- **Ask for the URL when the user clicks**, not when the list loads. It is valid for 5 minutes.
- **The response has to say `Content-Disposition: attachment`.** The API's signed links do. For
  a URL that does not, the browser would open the file in place of the app.

Nothing passes through the dashboard's memory, so this is the approach for large files.

## Which role sees what

The export buttons follow the same permissions as the API routes behind them:

| On the page                           | Permission                    |
| ------------------------------------- | ----------------------------- |
| Export PDF, Export Excel (users page) | `users:read`, the page itself |
| Download a report, Queue an export    | `reports:export`              |
| Check a user import                   | `users:write`                 |
| Download a file (files page)          | `files:read`, the page itself |

A role with `reports:read` but not `reports:export` sees the reports page with a notice in
place of the two export cards:

```tsx
<>
  {can('reports:export') ? (
    <div className="grid gap-6 lg:grid-cols-2">
      <ServerDownloads />
      <QueuedExport />
    </div>
  ) : (
    <Alert tone="info">Your role can read reports but not export them.</Alert>
  )}
</>
```

## Checking a file before import

The reports page also sends a file the other way. **Check a user import** uploads a CSV or
Excel file to `POST /reports/users/import/preview` and shows what an import would do. Nothing is
saved.

```ts
previewUserImport(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.upload<UserImportPreview>('/reports/users/import/preview', form);
},
```

The response has `total`, a `valid` list of rows ready to import, and an `invalid` list with a
row number and the problems found in it. The page shows two counts and a table for each list.
See [Import preview](/api/documents#import-preview) for the file format.

The card is wrapped in `<RequirePermission permission="users:write" fallback={null}>`, so roles
that could not import users do not see it. The form follows the file-input pattern in
[Forms](/frontend/forms#file-inputs).
