import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';
import { processReport } from '../../src/jobs/processors/report';
import { closeQueues, emailQueue, reportQueue } from '../../src/jobs/queues';
import { buildXlsx, parseCsv, parseXlsx } from '../../src/lib/documents';
import { updateUser } from '../../src/modules/users/users.service';
import { app, createTestUser, PASSWORD, storage } from './helpers';

const get = (path: string, authorization: string) =>
  request(app).get(`/api/v1/reports${path}`).set('Authorization', authorization);

const today = new Date().toISOString().slice(0, 10);

describe('dashboard statistics', () => {
  it('counts users by status, role and month', async () => {
    const viewer = await createTestUser();
    await createTestUser({ role: 'admin' });
    const inactive = await createTestUser();
    await updateUser(inactive.id, { isActive: false });

    const { body } = await get('/stats', viewer.authorization).expect(200);

    expect(body.totals).toEqual({ users: 3, activeUsers: 2, files: 0, storageBytes: 0 });
    expect(body.usersByRole).toEqual([
      { role: 'admin', count: 1 },
      { role: 'manager', count: 0 },
      { role: 'staff', count: 0 },
      { role: 'viewer', count: 2 },
    ]);
    // Six months, oldest first, ending with this one.
    expect(body.signupsByMonth).toHaveLength(6);
    expect(body.signupsByMonth.at(-1)).toEqual({ month: today.slice(0, 7), count: 3 });
    expect(
      body.signupsByMonth.slice(0, 5).every((entry: { count: number }) => entry.count === 0),
    ).toBe(true);
  });

  it('is cached, and refreshed when a user is created through the API', async () => {
    const admin = await createTestUser({ role: 'admin' });
    expect((await get('/stats', admin.authorization)).body.totals.users).toBe(1);

    // Behind the API's back: the cached figure stands.
    await createTestUser();
    expect((await get('/stats', admin.authorization)).body.totals.users).toBe(1);

    await request(app)
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send({ name: 'New Person', email: 'new@example.com', password: PASSWORD })
      .expect(201);
    expect((await get('/stats', admin.authorization)).body.totals.users).toBe(3);
  });

  it('lists recent activity with the name of who did it', async () => {
    const admin = await createTestUser({ role: 'admin', name: 'Ada Admin' });
    await get('/users.csv', admin.authorization).expect(200);

    const { body } = await get('/stats', admin.authorization).expect(200);
    expect(body.recentActivity[0]).toMatchObject({
      action: 'report.exported',
      userName: 'Ada Admin',
    });
  });
});

describe('exports built on demand', () => {
  it('downloads the users as CSV, with decrypted phone numbers', async () => {
    const manager = await createTestUser({
      role: 'manager',
      name: 'Miguel Manager',
      phone: '+63 917 555 0102',
    });
    await createTestUser({ name: '=HYPERLINK("http://evil.example")' });

    const response = await get('/users.csv', manager.authorization).expect(200);

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toContain(`filename="users-${today}.csv"`);
    expect(response.headers['cache-control']).toBe('no-store');

    const records = parseCsv(response.text);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      name: 'Miguel Manager',
      email: manager.email,
      role: 'Manager',
      active: 'Yes',
    });
    // Decrypted for the export. The leading quote is the formula guard: a
    // spreadsheet would otherwise try to evaluate anything starting with "+".
    expect(records[0]!.phone).toBe("'+63 917 555 0102");
    // A name that would run as a formula in a spreadsheet is defused the same way.
    expect(records[1]!.name).toBe(`'=HYPERLINK("http://evil.example")`);

    const { rows } = await pool.query(
      "SELECT user_id, metadata FROM audit_logs WHERE action = 'report.exported'",
    );
    expect(rows).toEqual([
      { user_id: manager.id, metadata: { report: 'users', format: 'csv', rows: 2 } },
    ]);
  });

  it('downloads the users as a spreadsheet', async () => {
    const manager = await createTestUser({ role: 'manager' });

    const response = await get('/users.xlsx', manager.authorization)
      .responseType('blob')
      .expect(200);
    const records = await parseXlsx(response.body as Buffer);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ Email: manager.email, Role: 'Manager' });
  });

  it('downloads PDFs and a zip of everything', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const download = async (path: string) =>
      (await get(path, manager.authorization).responseType('blob').expect(200)).body as Buffer;

    expect((await download('/users.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await download('/summary.pdf')).subarray(0, 5).toString()).toBe('%PDF-');

    const bundle = await download('/bundle.zip');
    expect(bundle.subarray(0, 2).toString()).toBe('PK');
    for (const name of [
      `users-${today}.xlsx`,
      `users-${today}.csv`,
      `users-${today}.pdf`,
      `summary-${today}.pdf`,
    ]) {
      expect(bundle.includes(name), name).toBe(true);
    }
  });

  it('is closed to roles that may read reports but not export them', async () => {
    const staff = await createTestUser({ role: 'staff' });
    await get('/stats', staff.authorization).expect(200);
    await get('/users.csv', staff.authorization).expect(403);
    await get('/bundle.zip', staff.authorization).expect(403);
  });
});

describe('import preview', () => {
  const preview = (authorization: string, content: Buffer, name: string) =>
    request(app)
      .post('/api/v1/reports/users/import/preview')
      .set('Authorization', authorization)
      .attach('file', content, name);

  it('validates a CSV row by row without writing anything', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const csv = [
      'Name,Email,Role',
      'Grace Hopper,Grace@Example.com,Manager',
      ',missing-name@example.com,',
      'Bad Email,not-an-email,viewer',
      'Grace Again,grace@example.com,viewer',
      `Already Here,${manager.email},staff`,
      'Katherine Johnson,katherine@example.com,',
      'Bad Role,role@example.com,emperor',
    ].join('\n');

    const { body } = await preview(manager.authorization, Buffer.from(csv), 'users.csv').expect(
      200,
    );

    expect(body.total).toBe(7);
    expect(body.valid).toEqual([
      { row: 2, name: 'Grace Hopper', email: 'grace@example.com', role: 'manager' },
      { row: 7, name: 'Katherine Johnson', email: 'katherine@example.com', role: 'viewer' },
    ]);
    expect(body.invalid.map((entry: { row: number }) => entry.row)).toEqual([3, 4, 5, 6, 8]);
    expect(body.invalid[2].errors).toEqual(['email: Appears more than once in this file']);
    expect(body.invalid[3].errors).toEqual(['email: An account with that email already exists']);

    expect((await pool.query('SELECT 1 FROM users')).rowCount).toBe(1);
  });

  it('reads spreadsheets too', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const rows = [{ name: 'Grace Hopper', email: 'grace@example.com', role: 'staff' }];
    const xlsx = await buildXlsx({
      name: 'Users',
      columns: [
        { header: 'Name', value: (row: (typeof rows)[number]) => row.name },
        { header: 'Email', value: (row) => row.email },
        { header: 'Role', value: (row) => row.role },
      ],
      rows,
    });

    const { body } = await preview(manager.authorization, xlsx, 'users.xlsx').expect(200);
    expect(body.valid).toEqual([{ row: 2, ...rows[0] }]);
  });

  it('rejects other file types, and callers who cannot create users', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const staff = await createTestUser({ role: 'staff' });

    const pdf = await preview(manager.authorization, Buffer.from('%PDF-1.7\n'), 'users.pdf').expect(
      400,
    );
    expect(pdf.body.error.code).toBe('unsupported_import_format');

    await preview(staff.authorization, Buffer.from('name,email\n'), 'users.csv').expect(403);
  });
});

describe('exports built by the worker', () => {
  const requestExport = (authorization: string, format: string) =>
    request(app)
      .post('/api/v1/reports/exports')
      .set('Authorization', authorization)
      .send({ format });

  it('queues a job that only its owner can see', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const admin = await createTestUser({ role: 'admin' });

    const { body: job } = await requestExport(manager.authorization, 'csv').expect(202);
    expect(job).toEqual({ id: expect.any(String), status: 'queued', fileName: null, url: null });

    const mine = await get(`/exports/${job.id}`, manager.authorization).expect(200);
    expect(mine.body.status).toBe('queued');

    const theirs = await get(`/exports/${job.id}`, admin.authorization).expect(404);
    expect(theirs.body.error.code).toBe('export_not_found');
    await get('/exports/999999', manager.authorization).expect(404);
    await get('/exports/not-a-number', manager.authorization).expect(400);
  });

  it('is processed by the worker, stored and announced by email', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const { body: queued } = await requestExport(manager.authorization, 'xlsx').expect(202);

    try {
      // What src/worker.ts does, in this process.
      void reportQueue().process(1, processReport);
      const job = await reportQueue().getJob(queued.id);
      await job!.finished();

      const { body } = await get(`/exports/${queued.id}`, manager.authorization).expect(200);
      const [key] = [...storage.objects.keys()];
      expect(key).toMatch(new RegExp(`^exports/[0-9a-f-]{36}/users-${today}\\.xlsx$`));
      expect(body).toEqual({
        id: queued.id,
        status: 'completed',
        fileName: `users-${today}.xlsx`,
        url: `https://storage.test/${key}?expires=300`,
      });

      const stored = await parseXlsx(await storage.get(key!));
      expect(stored[0]).toMatchObject({ Email: manager.email });

      const [email] = await emailQueue().getJobs(['waiting']);
      expect(email?.data.to).toBe(manager.email);
      expect(email?.data.text).toContain(`https://storage.test/${key}`);
    } finally {
      // Stop consuming, so this worker cannot pick up another test's job.
      await closeQueues();
    }
  });

  it('validates the format', async () => {
    const manager = await createTestUser({ role: 'manager' });
    const { body } = await requestExport(manager.authorization, 'docx').expect(400);
    expect(body.error.code).toBe('validation_error');
  });
});
