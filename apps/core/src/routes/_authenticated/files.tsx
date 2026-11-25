import { formatBytes, type StoredFile } from '@bossbyte/shared';
import {
  Button,
  Card,
  cn,
  ConfirmDialog,
  DataTable,
  formatDateTime,
  FormField,
  Pagination,
  useToast,
  type DataTableColumn,
} from '@bossbyte/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useId, useRef, useState, type FormEvent } from 'react';
import { FileInput } from '@/components/FileInput';
import { PageHeader } from '@/components/PageHeader';
import { QueryError } from '@/components/QueryError';
import { RequirePermission } from '@/components/RequirePermission';
import { filesApi, filesQueryOptions, useDeleteFile, useUploadFile } from '@/features/files/api';
import { UPLOAD_ACCEPT, UPLOAD_HINT, validateUpload } from '@/features/files/validate-upload';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { startDownload } from '@/lib/download';

export const Route = createFileRoute('/_authenticated/files')({ component: FilesPage });

const PAGE_SIZE = 10;

const TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/webp': 'WebP image',
  'application/pdf': 'PDF',
  'text/csv': 'CSV',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel workbook',
};

function UploadForm() {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const upload = useUploadFile();
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    const invalid = file ? validateUpload(file) : 'Choose a file to upload.';
    setProblem(invalid);
    if (!file || invalid) {
      input.current?.focus();
      return;
    }
    upload.mutate(file, {
      onSuccess: (stored) => {
        toast({ title: `${stored.originalName} was uploaded`, tone: 'success' });
        if (input.current) input.current.value = '';
      },
      // The API has the final say on type and size; its message says which one failed.
      onError: (error) => setProblem(errorMessage(error)),
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-wrap items-start gap-4">
      <FormField
        label="File"
        htmlFor={inputId}
        hint={UPLOAD_HINT}
        error={problem ?? undefined}
        className="min-w-0 flex-1 basis-72"
      >
        <FileInput
          ref={input}
          id={inputId}
          accept={UPLOAD_ACCEPT}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${inputId}-error` : `${inputId}-hint`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setProblem(file ? validateUpload(file) : null);
          }}
        />
      </FormField>
      {/* Lines the button up with the input rather than with the field's label. */}
      <div className="pt-6.5">
        <Button type="submit" loading={upload.isPending}>
          Upload
        </Button>
      </div>
    </form>
  );
}

function FilesPage() {
  return (
    <RequirePermission permission="files:read" pageTitle="Files">
      <FilesList />
    </RequirePermission>
  );
}

function FilesList() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const files = useQuery(filesQueryOptions(page, PAGE_SIZE));
  const deleteFile = useDeleteFile();
  // `file` outlives `open` so the dialog keeps its text while it animates out.
  const [removal, setRemoval] = useState<{ open: boolean; file?: StoredFile }>({ open: false });

  const rows = files.data?.data ?? [];
  const meta = files.data?.meta;

  const download = useMutation({
    mutationFn: async (file: StoredFile) => startDownload((await filesApi.getUrl(file.id)).url),
    onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
  });

  function confirmRemoval() {
    const target = removal.file;
    if (!target) return;
    deleteFile.mutate(target.id, {
      onSuccess: () => {
        toast({ title: `${target.originalName} was deleted`, tone: 'info' });
        if (rows.length === 1 && page > 1) setPage(page - 1);
      },
      onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
      onSettled: () => setRemoval((current) => ({ ...current, open: false })),
    });
  }

  const columns: DataTableColumn<StoredFile>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (file) => (
        <span className="flex flex-col">
          <span className="font-medium break-all text-slate-950">{file.originalName}</span>
          {file.width && file.height && (
            <span className="text-xs text-slate-600">
              {file.width} × {file.height} px
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (file) => TYPE_LABELS[file.mimeType] ?? file.mimeType,
      className: 'whitespace-nowrap',
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      cell: (file) => formatBytes(file.sizeBytes),
      className: 'whitespace-nowrap tabular-nums',
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      cell: (file) => formatDateTime(file.createdAt),
      className: 'whitespace-nowrap',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (file) => (
        <span className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Download ${file.originalName}`}
            loading={download.isPending && download.variables.id === file.id}
            onClick={() => download.mutate(file)}
          >
            Download
          </Button>
          {can('files:delete') && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${file.originalName}`}
              onClick={() => setRemoval({ open: true, file })}
            >
              Delete
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Files"
        description="Uploads are checked, stored privately and served through short-lived signed links."
      />

      {can('files:write') && (
        <Card title="Upload a file" description="Images are converted to WebP on the way in.">
          <UploadForm />
        </Card>
      )}

      {files.isError ? (
        <QueryError error={files.error} onRetry={() => void files.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Files"
            columns={columns}
            rows={rows}
            rowKey={(file) => file.id}
            loading={files.isPending}
            emptyMessage="No files have been uploaded yet."
            className={cn(files.isPlaceholderData && 'opacity-60')}
          />
          {meta && meta.totalPages > 1 && (
            <Pagination
              className="self-end"
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={removal.open}
        onClose={() => setRemoval((current) => ({ ...current, open: false }))}
        onConfirm={confirmRemoval}
        title="Delete this file?"
        message={`${removal.file?.originalName ?? 'This file'} will be removed from storage. This cannot be undone.`}
        confirmLabel="Delete file"
        tone="danger"
        loading={deleteFile.isPending}
      />
    </>
  );
}
