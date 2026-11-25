import {
  formatBytes,
  ROLE_LABELS,
  ROLES,
  userImportRowSchema,
  type DashboardStats,
  type ExportFormat,
  type ExportJob,
  type User,
  type UserImportPreview,
} from '@bossbyte/shared';
import { asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db/client';
import { auditLogs, files, passkeys, users } from '../../db/schema';
import { reportQueue, type ReportJobResult } from '../../jobs/queues';
import {
  buildCsv,
  buildSummaryPdf,
  buildTablePdf,
  buildXlsx,
  parseCsv,
  parseXlsx,
  XLSX_MIME_TYPE,
  type TableColumn,
} from '../../lib/documents';
import { badRequest, notFound } from '../../lib/errors';
import { cached } from '../../lib/redis';
import { getStorage } from '../../lib/storage';
import { detectFileType } from '../../lib/uploads';
import { toUserDto } from '../users/users.service';

// ─── Dashboard statistics ───────────────────────────────────────────────────

export const STATS_CACHE_KEY = 'reports:stats';
const STATS_TTL_SECONDS = 60;
const SIGNUP_MONTHS = 6;
const RECENT_ACTIVITY_LIMIT = 10;

/** "YYYY-MM" for the month `offset` months before `from`, in UTC. */
function monthKey(from: Date, offset: number): string {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - offset, 1));
  return date.toISOString().slice(0, 7);
}

async function loadDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (SIGNUP_MONTHS - 1), 1),
  );
  const month = sql<string>`to_char(date_trunc('month', ${users.createdAt} at time zone 'UTC'), 'YYYY-MM')`;

  const [[userTotals], [fileTotals], roleRows, signupRows, activityRows] = await Promise.all([
    db
      .select({
        users: count(),
        activeUsers: sql<number>`(count(*) filter (where ${users.isActive}))::int`,
      })
      .from(users),
    db
      .select({
        files: count(),
        // A sum of integers comes back as a bigint string; float8 is exact far beyond any real bucket.
        storageBytes: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::float8`,
      })
      .from(files),
    db.select({ role: users.role, count: count() }).from(users).groupBy(users.role),
    db
      .select({ month, count: count() })
      .from(users)
      .where(gte(users.createdAt, since))
      .groupBy(month),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        userName: users.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(RECENT_ACTIVITY_LIMIT),
  ]);

  const countByRole = new Map(roleRows.map((row) => [row.role, row.count]));
  const countByMonth = new Map(signupRows.map((row) => [row.month, row.count]));

  return {
    totals: {
      users: userTotals?.users ?? 0,
      activeUsers: userTotals?.activeUsers ?? 0,
      files: fileTotals?.files ?? 0,
      storageBytes: fileTotals?.storageBytes ?? 0,
    },
    // Every role and every month is present, so charts do not have to fill gaps.
    usersByRole: ROLES.map((role) => ({ role, count: countByRole.get(role) ?? 0 })),
    signupsByMonth: Array.from({ length: SIGNUP_MONTHS }, (_, index) => {
      const key = monthKey(now, SIGNUP_MONTHS - 1 - index);
      return { month: key, count: countByMonth.get(key) ?? 0 };
    }),
    recentActivity: activityRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Aggregates are cached briefly: the overview page is the most visited and the least urgent. */
export function getDashboardStats(): Promise<DashboardStats> {
  return cached(STATS_CACHE_KEY, STATS_TTL_SECONDS, loadDashboardStats);
}

// ─── User export ────────────────────────────────────────────────────────────

/** One column definition drives the spreadsheet, the CSV file and the PDF alike. */
export const USER_EXPORT_COLUMNS: TableColumn<User>[] = [
  { header: 'Name', value: (user) => user.name, width: 28 },
  { header: 'Email', value: (user) => user.email, width: 34 },
  { header: 'Role', value: (user) => ROLE_LABELS[user.role], width: 16 },
  { header: 'Phone', value: (user) => user.phone, width: 18 },
  { header: 'Active', value: (user) => user.isActive, width: 10 },
  { header: 'Two-factor', value: (user) => user.totpEnabled, width: 12 },
  {
    header: 'Last sign-in',
    value: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt) : null),
    width: 22,
  },
  { header: 'Created', value: (user) => new Date(user.createdAt), width: 22 },
];

/**
 * Every user, oldest first. Phone numbers are decrypted on the way out, which
 * is why exports sit behind the `reports:export` permission.
 *
 * This loads the whole table, which is fine for thousands of rows. For a
 * table that can grow without bound, page through it with a keyset query and
 * feed `createCsvStream` from an async generator instead.
 */
export async function loadUsersForExport(): Promise<User[]> {
  const rows = await db
    .select({
      user: users,
      passkeyCount: sql<number>`(select count(*)::int from ${passkeys} where ${passkeys.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id));
  return rows.map((row) => toUserDto({ ...row.user, passkeyCount: row.passkeyCount }));
}

export interface BuiltDocument {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

const dateStamp = (date = new Date()) => date.toISOString().slice(0, 10);

export async function buildUsersExport(
  format: ExportFormat | 'pdf',
): Promise<BuiltDocument & { rowCount: number }> {
  const rows = await loadUsersForExport();
  const fileName = `users-${dateStamp()}.${format}`;

  switch (format) {
    case 'xlsx':
      return {
        buffer: await buildXlsx({ name: 'Users', columns: USER_EXPORT_COLUMNS, rows }),
        fileName,
        mimeType: XLSX_MIME_TYPE,
        rowCount: rows.length,
      };
    case 'csv':
      return {
        buffer: await buildCsv(USER_EXPORT_COLUMNS, rows),
        fileName,
        mimeType: 'text/csv; charset=utf-8',
        rowCount: rows.length,
      };
    case 'pdf':
      return {
        buffer: await buildTablePdf({
          title: `${env.APP_NAME} users`,
          subtitle: `${rows.length} user(s) · generated ${dateStamp()}`,
          columns: USER_EXPORT_COLUMNS,
          rows,
        }),
        fileName,
        mimeType: 'application/pdf',
        rowCount: rows.length,
      };
  }
}

/** A one-page overview drawn with PDFKit, with a QR code linking back to the dashboard. */
export async function buildSummaryReport(): Promise<BuiltDocument> {
  const stats = await getDashboardStats();
  const buffer = await buildSummaryPdf({
    title: `${env.APP_NAME} summary`,
    subtitle: `Generated ${dateStamp()}`,
    metrics: [
      { label: 'Users', value: String(stats.totals.users) },
      { label: 'Active users', value: String(stats.totals.activeUsers) },
      { label: 'Files', value: String(stats.totals.files) },
      { label: 'Storage used', value: formatBytes(stats.totals.storageBytes) },
      ...stats.usersByRole.map((entry) => ({
        label: ROLE_LABELS[entry.role],
        value: String(entry.count),
      })),
    ],
    paragraphs: [
      `New accounts over the last ${SIGNUP_MONTHS} months: ` +
        stats.signupsByMonth.map((entry) => `${entry.month} (${entry.count})`).join(', ') +
        '.',
    ],
    qrCodeUrl: env.APP_URL,
  });
  return { buffer, fileName: `summary-${dateStamp()}.pdf`, mimeType: 'application/pdf' };
}

// ─── User import ────────────────────────────────────────────────────────────

const MAX_IMPORT_ROWS = 5_000;

async function readImportRows(file: { buffer: Buffer; originalname: string }) {
  const { mimeType } = await detectFileType(file.buffer, file.originalname);
  if (mimeType === 'text/csv') return parseCsv(file.buffer);
  if (mimeType === XLSX_MIME_TYPE) {
    // Match parseCsv, which lower-cases header names.
    return (await parseXlsx(file.buffer)).map((record) =>
      Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value])),
    );
  }
  throw badRequest('Upload a .csv or .xlsx file', 'unsupported_import_format');
}

/**
 * Validates an import file — columns `name`, `email` and optionally `role` —
 * and reports, row by row, what would be imported. Nothing is written: the
 * caller reviews the preview and then creates the valid rows.
 */
export async function previewUserImport(
  file: { buffer: Buffer; originalname: string } | undefined,
): Promise<UserImportPreview> {
  if (!file) throw badRequest('Attach a file in the "file" field', 'file_required');

  const records = await readImportRows(file);
  if (records.length > MAX_IMPORT_ROWS) {
    throw badRequest(`An import can hold at most ${MAX_IMPORT_ROWS} rows`, 'import_too_large');
  }

  const preview: UserImportPreview = { total: records.length, valid: [], invalid: [] };
  const seen = new Set<string>();

  records.forEach((record, index) => {
    // Row 1 is the header, so the first data row is row 2 — the number a spreadsheet shows.
    const row = index + 2;
    const parsed = userImportRowSchema.safeParse({
      name: record.name,
      email: record.email,
      role: record.role?.toLowerCase() || undefined,
    });

    if (!parsed.success) {
      preview.invalid.push({
        row,
        errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
    } else if (seen.has(parsed.data.email)) {
      preview.invalid.push({ row, errors: ['email: Appears more than once in this file'] });
    } else {
      seen.add(parsed.data.email);
      preview.valid.push({ ...parsed.data, row });
    }
  });

  if (preview.valid.length === 0) return preview;

  const existing = await db
    .select({ email: users.email })
    .from(users)
    .where(
      inArray(
        users.email,
        preview.valid.map((entry) => entry.email),
      ),
    );
  const taken = new Set(existing.map((entry) => entry.email));

  const valid = preview.valid.filter((entry) => !taken.has(entry.email));
  const invalid = [
    ...preview.invalid,
    ...preview.valid
      .filter((entry) => taken.has(entry.email))
      .map((entry) => ({
        row: entry.row,
        errors: ['email: An account with that email already exists'],
      })),
  ].sort((a, b) => a.row - b.row);

  return { total: preview.total, valid, invalid };
}

// ─── Background exports ─────────────────────────────────────────────────────

const EXPORT_URL_TTL_SECONDS = 300;

/** Hands the export to the worker process and returns immediately. */
export async function requestExport(format: ExportFormat, requestedBy: string): Promise<ExportJob> {
  const job = await reportQueue().add({ type: 'users-export', format, requestedBy });
  return { id: String(job.id), status: 'queued', fileName: null, url: null };
}

export async function getExportJob(id: string, requestedBy: string): Promise<ExportJob> {
  const job = await reportQueue().getJob(id);
  // Someone else's job is reported exactly like a missing one.
  if (!job || job.data.requestedBy !== requestedBy) {
    throw notFound('Export not found', 'export_not_found');
  }

  const state = await job.getState();
  if (state === 'completed') {
    const result = job.returnvalue as ReportJobResult;
    return {
      id,
      status: 'completed',
      fileName: result.fileName,
      url: await getStorage().signedUrl(result.storageKey, {
        expiresIn: EXPORT_URL_TTL_SECONDS,
        downloadName: result.fileName,
      }),
    };
  }

  const status = state === 'active' || state === 'failed' ? state : 'queued';
  return { id, status, fileName: null, url: null };
}
