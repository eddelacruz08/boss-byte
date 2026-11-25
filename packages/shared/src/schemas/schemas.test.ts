import { describe, expect, it } from 'vitest';
import {
  listUsersQuerySchema,
  loginResponseSchema,
  loginSchema,
  passwordSchema,
  updateUserSchema,
} from './index';

describe('auth schemas', () => {
  it('normalises the email on login', () => {
    const parsed = loginSchema.parse({ email: '  Ada@Example.COM ', password: 'x' });
    expect(parsed.email).toBe('ada@example.com');
  });

  it('enforces the password policy', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase1234').success).toBe(false);
    expect(passwordSchema.safeParse('Correct-Horse-9-Battery').success).toBe(true);
  });

  it('discriminates the two login outcomes', () => {
    expect(loginResponseSchema.parse({ mfaRequired: true, mfaToken: 't' })).toEqual({
      mfaRequired: true,
      mfaToken: 't',
    });
    expect(loginResponseSchema.safeParse({ mfaRequired: false }).success).toBe(false);
  });
});

describe('user schemas', () => {
  it('coerces and defaults list queries', () => {
    expect(listUsersQuerySchema.parse({ page: '2' })).toEqual({
      page: 2,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(listUsersQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('rejects empty updates', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: 'manager' }).success).toBe(true);
  });
});
