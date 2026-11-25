import {
  createUserSchema,
  idParamSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '@bossbyte/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { invalidate } from '../../lib/redis';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { revokeAllSessions } from '../auth/sessions';
import { STATS_CACHE_KEY } from '../reports/reports.service';
import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  toUserDto,
  updateUser,
} from './users.service';

export const usersRouter: Router = Router();

usersRouter.use(authenticate);

usersRouter.get('/', authorize('users:read'), async (req, res) => {
  res.json(await listUsers(parseQuery(listUsersQuerySchema, req)));
});

usersRouter.get('/:id', authorize('users:read'), async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  res.json(toUserDto(await getUserById(id)));
});

usersRouter.post('/', authorize('users:write'), async (req, res) => {
  const user = await createUser(parseBody(createUserSchema, req));
  await audit({ action: 'user.created', metadata: { targetId: user.id, role: user.role }, req });
  await invalidate(STATS_CACHE_KEY);
  res.status(201).json(toUserDto(user));
});

usersRouter.patch('/:id', authorize('users:write'), async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  const input = parseBody(updateUserSchema, req);

  // Guards against an admin locking themselves out of the system.
  if (id === currentUser(req).userId && (input.role !== undefined || input.isActive === false)) {
    throw badRequest(
      'You cannot change your own role or deactivate yourself',
      'cannot_modify_self',
    );
  }

  const user = await updateUser(id, input);
  // A demoted or deactivated user must not be able to mint new access tokens.
  if (input.role !== undefined || input.isActive === false) await revokeAllSessions(id);

  await audit({
    action: 'user.updated',
    // Field names only: values may be personal data that is encrypted at rest.
    metadata: { targetId: id, fields: Object.keys(input) },
    req,
  });
  await invalidate(STATS_CACHE_KEY);
  res.json(toUserDto(user));
});

usersRouter.delete('/:id', authorize('users:delete'), async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  if (id === currentUser(req).userId) {
    throw badRequest('You cannot delete your own account', 'cannot_modify_self');
  }

  await deleteUser(id);
  await audit({ action: 'user.deleted', metadata: { targetId: id }, req });
  await invalidate(STATS_CACHE_KEY);
  res.status(204).end();
});
