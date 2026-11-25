import { exportRequestSchema } from '@bossbyte/shared';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { buildZip } from '../../lib/documents';
import { attachmentDisposition } from '../../lib/storage/types';
import { upload } from '../../lib/uploads';
import { parseBody, parseParams } from '../../lib/validate';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import {
  buildSummaryReport,
  buildUsersExport,
  getDashboardStats,
  getExportJob,
  previewUserImport,
  requestExport,
  type BuiltDocument,
} from './reports.service';

export const reportsRouter: Router = Router();

reportsRouter.use(authenticate);

function sendDocument(res: Response, document: BuiltDocument): void {
  res
    .status(200)
    .set({
      'Content-Type': document.mimeType,
      'Content-Disposition': attachmentDisposition(document.fileName),
      'Content-Length': String(document.buffer.length),
      // Exports contain personal data; no cache along the way may keep a copy.
      'Cache-Control': 'no-store',
    })
    .end(document.buffer);
}

reportsRouter.get('/stats', authorize('reports:read'), async (_req, res) => {
  res.json(await getDashboardStats());
});

// ─── Downloads, built on demand ─────────────────────────────────────────────

for (const format of ['xlsx', 'csv', 'pdf'] as const) {
  reportsRouter.get(`/users.${format}`, authorize('reports:export'), async (req, res) => {
    const document = await buildUsersExport(format);
    await audit({
      action: 'report.exported',
      metadata: { report: 'users', format, rows: document.rowCount },
      req,
    });
    sendDocument(res, document);
  });
}

reportsRouter.get('/summary.pdf', authorize('reports:export'), async (req, res) => {
  const document = await buildSummaryReport();
  await audit({ action: 'report.exported', metadata: { report: 'summary', format: 'pdf' }, req });
  sendDocument(res, document);
});

/** Every report in one archive. */
reportsRouter.get('/bundle.zip', authorize('reports:export'), async (req, res) => {
  const documents = await Promise.all([
    buildUsersExport('xlsx'),
    buildUsersExport('csv'),
    buildUsersExport('pdf'),
    buildSummaryReport(),
  ]);
  const buffer = await buildZip(
    documents.map((document) => ({ name: document.fileName, content: document.buffer })),
  );
  await audit({ action: 'report.exported', metadata: { report: 'bundle', format: 'zip' }, req });
  sendDocument(res, {
    buffer,
    fileName: `reports-${new Date().toISOString().slice(0, 10)}.zip`,
    mimeType: 'application/zip',
  });
});

// ─── Import ─────────────────────────────────────────────────────────────────

/** multipart/form-data with a .csv or .xlsx file in a field named "file". */
reportsRouter.post(
  '/users/import/preview',
  authorize('users:write'),
  upload.single('file'),
  async (req, res) => {
    res.json(await previewUserImport(req.file));
  },
);

// ─── Exports built by the worker ────────────────────────────────────────────

reportsRouter.post('/exports', authorize('reports:export'), async (req, res) => {
  const { format } = parseBody(exportRequestSchema, req);
  const job = await requestExport(format, currentUser(req).userId);
  await audit({
    action: 'report.exported',
    metadata: { report: 'users', format, jobId: job.id },
    req,
  });
  res.status(202).json(job);
});

const exportParamsSchema = z.object({ id: z.string().regex(/^\d+$/, 'Invalid export id') });

/** Poll this until `status` is "completed", then download from `url`. */
reportsRouter.get('/exports/:id', authorize('reports:export'), async (req, res) => {
  const { id } = parseParams(exportParamsSchema, req);
  res.json(await getExportJob(id, currentUser(req).userId));
});
