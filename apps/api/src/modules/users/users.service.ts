import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  User,
  UserList,
} from '@bossbyte/shared';
import { buildPaginationMeta, paginationOffset } from '@bossbyte/shared';
import { and, asc, count, desc, eq, getTableColumns, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { normalizePhone, searchableHash } from '../../db/encryption';
import { passkeys, users, type UserRow } from '../../db/schema';
import { conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../auth/password';

const PHONE_CONTEXT = 'users.phone';

const userColumns = {
  ...getTableColumns(users),
  passkeyCount: sql<number>`(select count(*)::int from ${passkeys} where ${passkeys.userId} = ${users.id})`,
};

export type UserRecord = UserRow & { passkeyCount: number };

/** Maps a database row to the public shape. Hashes and secrets stop here. */
export function toUserDto(row: UserRecord): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    phone: row.phone,
    isActive: row.isActive,
    totpEnabled: row.totpEnabled,
    passkeyCount: row.passkeyCount,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The encrypted phone number and its blind index always change together. */
function phoneColumns(phone: string | null | undefined) {
  if (phone === undefined) return {};
  if (phone === null) return { phone: null, phoneBidx: null };
  return { phone, phoneBidx: searchableHash(normalizePhone(phone), PHONE_CONTEXT) };
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

/** drizzle wraps driver errors, so look through `cause` as well. */
function rethrowDuplicateEmail(error: unknown): never {
  if (isUniqueViolation(error) || isUniqueViolation((error as Error | undefined)?.cause)) {
    throw conflict('An account with that email already exists', 'email_taken');
  }
  throw error;
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, id));
  return row;
}

export async function getUserById(id: string): Promise<UserRecord> {
  const row = await findUserById(id);
  if (!row) throw notFound('User not found', 'user_not_found');
  return row;
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.email, email));
  return row;
}

/** Exact-match lookup on an encrypted column, by way of its blind index. */
export async function findUsersByPhone(phone: string): Promise<UserRecord[]> {
  const hash = searchableHash(normalizePhone(phone), PHONE_CONTEXT);
  return db.select(userColumns).from(users).where(eq(users.phoneBidx, hash));
}

export async function listUsers(query: ListUsersQuery): Promise<UserList> {
  const filters: SQL[] = [];
  if (query.role) filters.push(eq(users.role, query.role));
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const match = or(ilike(users.name, pattern), ilike(users.email, pattern));
    if (match) filters.push(match);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const sortColumn = { name: users.name, email: users.email, createdAt: users.createdAt }[
    query.sortBy
  ];
  const direction = query.sortOrder === 'asc' ? asc : desc;

  const [rows, [totals]] = await Promise.all([
    db
      .select(userColumns)
      .from(users)
      .where(where)
      .orderBy(direction(sortColumn), asc(users.id))
      .limit(query.pageSize)
      .offset(paginationOffset(query.page, query.pageSize)),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return {
    data: rows.map(toUserDto),
    meta: buildPaginationMeta(totals?.total ?? 0, query.page, query.pageSize),
  };
}

export async function createUser(
  input: Omit<CreateUserInput, 'password'> & { password?: string; firebaseUid?: string },
): Promise<UserRecord> {
  try {
    const [row] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: input.password ? await hashPassword(input.password) : null,
        firebaseUid: input.firebaseUid ?? null,
        ...phoneColumns(input.phone),
      })
      .returning();
    return { ...row!, passkeyCount: 0 };
  } catch (error) {
    rethrowDuplicateEmail(error);
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserRecord> {
  const { phone, ...rest } = input;
  const [row] = await db
    .update(users)
    .set({ ...rest, ...phoneColumns(phone), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!row) throw notFound('User not found', 'user_not_found');
  return getUserById(id);
}

export async function deleteUser(id: string): Promise<void> {
  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (deleted.length === 0) throw notFound('User not found', 'user_not_found');
}
