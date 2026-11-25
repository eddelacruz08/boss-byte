import { randomUUID } from 'node:crypto';
import type { Role } from '@bossbyte/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/modules/auth/tokens';

/**
 * HTTP-level tests of everything that works without PostgreSQL or Redis:
 * routing, the security middleware, validation and error shapes. Anything
 * that needs real services lives in the `*.int.test.ts` files.
 */

const app = createApp();

const bearer = (role: Role) =>
  `Bearer ${signAccessToken({ userId: randomUUID(), role }).accessToken}`;

const SALES = [
  { features: { area: 80 }, value: 146_000 },
  { features: { area: 100 }, value: 170_000 },
  { features: { area: 120 }, value: 194_000 },
  { features: { area: 150 }, value: 230_000 },
  { features: { area: 180 }, value: 266_000 },
];

describe('health', () => {
  it('answers the liveness probe', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });
});

describe('request plumbing', () => {
  it('assigns a request id and echoes a caller-supplied one', async () => {
    const generated = await request(app).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[\w-]{8,}$/);

    const supplied = await request(app).get('/health').set('x-request-id', 'trace-1234');
    expect(supplied.headers['x-request-id']).toBe('trace-1234');
  });

  it('does not let a caller inject an unsafe request id', async () => {
    const response = await request(app).get('/health').set('x-request-id', 'bad id\twith spaces');
    expect(response.headers['x-request-id']).not.toContain(' ');
  });

  it('sets security headers and hides the framework', async () => {
    const { headers } = await request(app).get('/health');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['strict-transport-security']).toBeDefined();
    expect(headers['x-powered-by']).toBeUndefined();
  });

  it('answers unknown routes with a JSON 404', async () => {
    const response = await request(app).get('/api/v1/nope').expect(404);
    expect(response.body.error).toMatchObject({
      code: 'route_not_found',
      requestId: response.headers['x-request-id'],
    });
  });

  it('reports malformed JSON as a 400, not a 500', async () => {
    const response = await request(app)
      .post('/api/v1/valuation/regression')
      .set('Authorization', bearer('admin'))
      .set('Content-Type', 'application/json')
      .send('{"observations": [')
      .expect(400);
    expect(response.body.error.code).toBe('invalid_json');
  });
});

describe('CORS', () => {
  it('allows the dashboard origin, with credentials', async () => {
    const { headers } = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives other origins nothing', async () => {
    const { headers } = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('authentication and authorisation', () => {
  it('rejects a request without a token', async () => {
    const response = await request(app).get('/api/v1/users').expect(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('rejects a token that does not verify', async () => {
    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', 'Bearer not.a.token')
      .expect(401);
    expect(response.body.error.code).toBe('invalid_token');
  });

  it('rejects a role without the permission', async () => {
    const response = await request(app)
      .post('/api/v1/valuation/regression')
      .set('Authorization', bearer('viewer'))
      .send({ observations: SALES })
      .expect(403);
    expect(response.body.error.code).toBe('forbidden');
  });
});

describe('CSRF protection', () => {
  const credentials = { email: 'ada@example.com', password: 'not-checked-here' };

  it('rejects a cookie-authenticated POST without a token', async () => {
    const response = await request(app).post('/api/v1/auth/login').send(credentials).expect(403);
    expect(response.body.error.code).toBe('invalid_csrf_token');
  });

  it('rejects a token issued to a different browser', async () => {
    const first = request.agent(app);
    const second = request.agent(app);
    const { body } = await first.get('/api/v1/auth/csrf-token').expect(200);
    await second.get('/api/v1/auth/csrf-token').expect(200);

    const response = await second
      .post('/api/v1/auth/login')
      .set('x-csrf-token', body.csrfToken)
      .send(credentials)
      .expect(403);
    expect(response.body.error.code).toBe('invalid_csrf_token');
  });

  it('lets a request with a valid token through to validation', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/v1/auth/csrf-token').expect(200);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', body.csrfToken)
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
  });
});

describe('valuation endpoints', () => {
  const post = (path: string, body: object, role: Role = 'staff') =>
    request(app).post(`/api/v1/valuation/${path}`).set('Authorization', bearer(role)).send(body);

  it('fits a regression', async () => {
    const { body } = await post('regression', {
      observations: SALES,
      subject: { area: 110 },
    }).expect(200);
    expect(body.coefficients.area).toBeCloseTo(1_200, 6);
    expect(body.intercept).toBeCloseTo(50_000, 4);
    expect(body.prediction).toBeCloseTo(182_000, 4);
  });

  it('finds comparables', async () => {
    const { body } = await post('comparables', {
      observations: SALES,
      subject: { area: 101 },
      k: 2,
    }).expect(200);
    expect(body.comparables).toHaveLength(2);
    expect(body.comparables[0].index).toBe(1);
  });

  it('runs a ratio study', async () => {
    const { body } = await post('ratio-study', {
      pairs: [
        { assessed: 90, sale: 100 },
        { assessed: 180, sale: 200 },
      ],
    }).expect(200);
    expect(body.medianRatio).toBeCloseTo(0.9, 10);
  });

  it('trains a boosted model', async () => {
    const { body } = await post('boosted', { observations: SALES, subject: { area: 100 } }).expect(
      200,
    );
    expect(body.prediction).toBeGreaterThan(146_000);
    expect(body.prediction).toBeLessThan(266_000);
  });

  it('validates the body', async () => {
    const { body } = await post('regression', { observations: 'nope' }).expect(400);
    expect(body.error.code).toBe('validation_error');
  });

  it('explains a model that cannot be fitted', async () => {
    // Three observations cannot pin down an intercept and two coefficients.
    const observations = SALES.slice(0, 3).map((sale, index) => ({
      ...sale,
      features: { ...sale.features, bedrooms: index + 1 },
    }));
    const { body } = await post('regression', { observations }).expect(400);
    expect(body.error.code).toBe('insufficient_observations');
  });
});

describe('API documentation', () => {
  it('serves an OpenAPI 3.1 document covering the routes', async () => {
    const { body } = await request(app).get('/api/openapi.json').expect(200);

    expect(body.openapi).toBe('3.1.0');
    expect(body.paths['/auth/login'].post).toBeDefined();
    expect(body.paths['/users/{id}'].get).toBeDefined();
    expect(body.paths['/valuation/regression'].post).toBeDefined();
    expect(body.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('only references schemas it defines', async () => {
    const { body, text } = await request(app).get('/api/openapi.json').expect(200);
    const referenced = [...text.matchAll(/"#\/components\/schemas\/([^"]+)"/g)].map(
      (match) => match[1]!,
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const name of new Set(referenced)) {
      expect(body.components.schemas, `missing schema ${name}`).toHaveProperty(name);
    }
  });

  it('serves Swagger UI', async () => {
    const response = await request(app).get('/api/docs/').expect(200);
    expect(response.text).toContain('swagger-ui');
  });
});
