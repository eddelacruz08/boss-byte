import {
  ROLE_LABELS,
  type ExportFormat,
  type ExportJob,
  type UserImportPreview,
} from '@bossbyte/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  RichTextEditor,
  Select,
  Spinner,
  useToast,
  type BadgeProps,
} from '@bossbyte/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import Markdown from 'react-markdown';
import { FileInput } from '@/components/FileInput';
import { PageHeader } from '@/components/PageHeader';
import { QueryError } from '@/components/QueryError';
import { RequirePermission } from '@/components/RequirePermission';
import {
  downloadReport,
  exportJobQueryOptions,
  reportsApi,
  SERVER_REPORTS,
} from '@/features/reports/api';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';

export const Route = createFileRoute('/_authenticated/reports')({ component: ReportsPage });

const HELP = `
**Downloads** are built by the API the moment you ask: Excel with *exceljs*, PDF with
*pdfkit*, CSV as a stream and the ZIP with *archiver*.

**Queued exports** suit files that take a while. The request returns straight away, a
background worker builds the file, and this page checks on it until the link is ready.

**Import checks** read a file and report what would happen. Nothing is saved.

Need a column that is not here? The report builders live in
\`apps/api/src/modules/reports\`.
`;

const formatOptions: { value: ExportFormat; label: string }[] = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV (.csv)' },
];

const JOB_STATUS: Record<ExportJob['status'], { label: string; tone: BadgeProps['tone'] }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  active: { label: 'Building', tone: 'info' },
  completed: { label: 'Ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

const linkClasses =
  'rounded-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

function ServerDownloads() {
  const { toast } = useToast();
  const download = useMutation({
    mutationFn: downloadReport,
    onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
  });

  return (
    <Card title="Download a report" description="Rendered by the API when you ask for it.">
      <ul className="divide-y divide-slate-100">
        {SERVER_REPORTS.map((report) => (
          <li
            key={report.path}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-col">
              <p className="text-sm font-medium text-slate-950">{report.label}</p>
              <p className="text-sm text-slate-600">{report.description}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Download ${report.label}`}
              disabled={download.isPending}
              loading={download.isPending && download.variables.path === report.path}
              onClick={() => download.mutate(report)}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

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
      {status === 'completed' && url && (
        <a href={url} className={linkClasses}>
          Download {fileName ?? 'the export'}
        </a>
      )}
    </p>
  );
}

function QueuedExport() {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const queue = useMutation({
    mutationFn: reportsApi.queueExport,
    // The response is the job's first status, so polling starts from it.
    onSuccess: (job) => queryClient.setQueryData(exportJobQueryOptions(job.id).queryKey, job),
  });

  return (
    <Card title="Queue an export" description="Built in the background by a worker.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            className="w-full sm:w-48"
            label="Format"
            options={formatOptions}
            value={format}
            onChange={setFormat}
          />
          <Button loading={queue.isPending} onClick={() => queue.mutate(format)}>
            Queue export
          </Button>
        </div>
        {queue.isError && <Alert tone="danger">{errorMessage(queue.error)}</Alert>}
        {queue.data && <ExportJobStatus jobId={queue.data.id} />}
      </div>
    </Card>
  );
}

function ImportPreview({ preview }: { preview: UserImportPreview }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        {preview.total} {preview.total === 1 ? 'row' : 'rows'} read:
        <Badge tone="success">{preview.valid.length} ready to import</Badge>
        <Badge tone={preview.invalid.length > 0 ? 'danger' : 'neutral'}>
          {preview.invalid.length} with problems
        </Badge>
      </p>
      {preview.invalid.length > 0 && (
        <DataTable
          caption="Rows with problems"
          columns={[
            { key: 'row', header: 'Row', cell: (row) => row.row, className: 'tabular-nums' },
            { key: 'errors', header: 'Problem', cell: (row) => row.errors.join(' ') },
          ]}
          rows={preview.invalid}
          rowKey={(row) => String(row.row)}
        />
      )}
      {preview.valid.length > 0 && (
        <DataTable
          caption="Rows ready to import"
          columns={[
            { key: 'row', header: 'Row', cell: (row) => row.row, className: 'tabular-nums' },
            { key: 'name', header: 'Name', cell: (row) => row.name },
            { key: 'email', header: 'Email', cell: (row) => row.email },
            { key: 'role', header: 'Role', cell: (row) => ROLE_LABELS[row.role] },
          ]}
          rows={preview.valid}
          rowKey={(row) => String(row.row)}
        />
      )}
    </div>
  );
}

function ImportCheck() {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: reportsApi.previewUserImport,
    onError: (error) => setProblem(errorMessage(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    setProblem(file ? null : 'Choose a file to check.');
    if (file) check.mutate(file);
    else input.current?.focus();
  }

  return (
    <Card
      title="Check a user import"
      description="Validates every row and shows what would be imported. Nothing is saved."
    >
      <div className="flex flex-col gap-5">
        <form noValidate onSubmit={submit} className="flex flex-wrap items-start gap-4">
          <FormField
            label="User list"
            htmlFor={inputId}
            hint="A CSV or Excel file with name, email and role columns."
            error={problem ?? undefined}
            className="min-w-0 flex-1 basis-72"
          >
            <FileInput
              ref={input}
              id={inputId}
              accept=".csv,.xlsx"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${inputId}-error` : `${inputId}-hint`}
              onChange={() => setProblem(null)}
            />
          </FormField>
          {/* Lines the button up with the input rather than with the field's label. */}
          <div className="pt-6.5">
            <Button type="submit" variant="outline" loading={check.isPending}>
              Check file
            </Button>
          </div>
        </form>
        {check.data && !check.isPending && <ImportPreview preview={check.data} />}
      </div>
    </Card>
  );
}

function Notes() {
  const [notes, setNotes] = useState(
    '<p>Write the <strong>context</strong> behind this month’s figures here.</p>',
  );
  // The editor's output is still user input: it is cleaned before it is rendered as HTML.
  const preview = useMemo(() => sanitizeHtml(notes), [notes]);

  return (
    <Card title="Notes" description="A rich text editor, with its output sanitised for display.">
      <div className="grid gap-6 lg:grid-cols-2">
        <RichTextEditor label="Notes" value={notes} onChange={setNotes} />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-slate-800">Preview</p>
          <div
            className="bb-prose min-h-24 rounded-lg border border-slate-200 bg-slate-50 p-4"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </div>
    </Card>
  );
}

function ReportsPage() {
  const { can } = useAuth();

  return (
    <RequirePermission permission="reports:read" pageTitle="Reports">
      <PageHeader
        title="Reports"
        description="Export what is in the system, and check what you are about to bring in."
      />

      {can('reports:export') ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ServerDownloads />
          <QueuedExport />
        </div>
      ) : (
        <Alert tone="info">Your role can read reports but not export them.</Alert>
      )}

      <RequirePermission permission="users:write" fallback={null}>
        <ImportCheck />
      </RequirePermission>

      <Notes />

      <Card title="How reports work">
        <div className="bb-prose max-w-prose">
          <Markdown>{HELP}</Markdown>
        </div>
      </Card>
    </RequirePermission>
  );
}
