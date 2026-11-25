import { idParamSchema, paginationQuerySchema } from '@bossbyte/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { upload } from '../../lib/uploads';
import { parseParams, parseQuery } from '../../lib/validate';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { deleteFile, getFileUrl, listFiles, storeUpload } from './files.service';

export const filesRouter: Router = Router();

filesRouter.use(authenticate);

filesRouter.get('/', authorize('files:read'), async (req, res) => {
  res.json(await listFiles(parseQuery(paginationQuerySchema, req)));
});

/** multipart/form-data with the file in a field named "file". */
filesRouter.post('/', authorize('files:write'), upload.single('file'), async (req, res) => {
  const file = await storeUpload(req.file, currentUser(req).userId);
  await audit({
    action: 'file.uploaded',
    metadata: { fileId: file.id, mimeType: file.mimeType, sizeBytes: file.sizeBytes },
    req,
  });
  res.status(201).json(file);
});

/** Returns a short-lived signed URL; the download itself bypasses the API. */
filesRouter.get('/:id/url', authorize('files:read'), async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  res.json(await getFileUrl(id));
});

filesRouter.delete('/:id', authorize('files:delete'), async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  await deleteFile(id);
  await audit({ action: 'file.deleted', metadata: { fileId: id }, req });
  res.status(204).end();
});
