import type { DashboardStats, ExportFormat, ExportJob, UserImportPreview } from '@bossbyte/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';

export const statsQueryOptions = queryOptions({
  queryKey: ['reports', 'stats'],
  queryFn: ({ signal }) => api.get<DashboardStats>('/reports/stats', { signal }),
});

export interface ServerReport {
  path: string;
  label: string;
  description: string;
  /** Used when the response does not name the file. */
  fileName: string;
}

/** Reports the API renders on demand, each with a different server-side library. */
export const SERVER_REPORTS: readonly ServerReport[] = [
  {
    path: '/reports/users.xlsx',
    label: 'Users (Excel)',
    description: 'Every user as a formatted workbook.',
    fileName: 'users.xlsx',
  },
  {
    path: '/reports/users.csv',
    label: 'Users (CSV)',
    description: 'Plain rows for spreadsheets and scripts.',
    fileName: 'users.csv',
  },
  {
    path: '/reports/users.pdf',
    label: 'Users (PDF)',
    description: 'A paginated table, ready to print.',
    fileName: 'users.pdf',
  },
  {
    path: '/reports/summary.pdf',
    label: 'Summary (PDF)',
    description: 'One page of headline figures with a QR code.',
    fileName: 'summary.pdf',
  },
  {
    path: '/reports/bundle.zip',
    label: 'Everything (ZIP)',
    description: 'All of the above in one archive.',
    fileName: 'reports.zip',
  },
];

/**
 * Downloads a report. The endpoints need the Bearer header, which a plain
 * link cannot send, so the file is fetched as a blob and then saved.
 */
export async function downloadReport(report: ServerReport): Promise<void> {
  const { blob, fileName } = await api.download(report.path);
  saveBlob(blob, fileName ?? report.fileName);
}

export const reportsApi = {
  /** Hands the export to the background worker and returns the queued job. */
  queueExport: (format: ExportFormat) => api.post<ExportJob>('/reports/exports', { format }),
  /** Validates a CSV of users without writing anything. */
  previewUserImport(file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.upload<UserImportPreview>('/reports/users/import/preview', form);
  },
};

const POLL_INTERVAL_MS = 1_500;

export function isExportFinished(job: ExportJob | undefined): boolean {
  return job?.status === 'completed' || job?.status === 'failed';
}

/** Polls a queued export until the worker has finished with it. */
export function exportJobQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: ['reports', 'exports', jobId],
    queryFn: ({ signal }) => api.get<ExportJob>(`/reports/exports/${jobId}`, { signal }),
    refetchInterval: (query) => (isExportFinished(query.state.data) ? false : POLL_INTERVAL_MS),
    staleTime: Infinity,
  });
}
