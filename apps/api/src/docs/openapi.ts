import {
  apiErrorSchema,
  authTokensSchema,
  boostedRequestSchema,
  boostedResultSchema,
  changePasswordSchema,
  comparablesRequestSchema,
  comparablesResultSchema,
  createUserSchema,
  csrfTokenSchema,
  dashboardStatsSchema,
  exportJobSchema,
  exportRequestSchema,
  fileListSchema,
  fileSchema,
  fileUrlSchema,
  firebaseLoginSchema,
  listUsersQuerySchema,
  loginResponseSchema,
  loginSchema,
  mfaVerifySchema,
  paginationQuerySchema,
  passkeyLoginVerifySchema,
  passkeyRegisterVerifySchema,
  passkeySchema,
  ratioStudyRequestSchema,
  ratioStudyResultSchema,
  registerSchema,
  regressionRequestSchema,
  regressionResultSchema,
  totpDisableSchema,
  totpEnableSchema,
  totpSetupResponseSchema,
  updateProfileSchema,
  updateUserSchema,
  userImportPreviewSchema,
  userListSchema,
  userSchema,
  type Permission,
} from '@bossbyte/shared';
import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { env } from '../config/env';

/**
 * The OpenAPI 3.1 description of the API, generated from the same Zod schemas
 * that validate requests — so the documented shapes cannot drift from the
 * enforced ones. Served as JSON at /api/openapi.json and rendered by Swagger
 * UI at /api/docs.
 *
 * To document a new endpoint: add its schemas to `schemas` (if new) and one
 * entry to `routes`.
 */

type JsonObject = Record<string, unknown>;

// OpenAPI 3.1 uses JSON Schema 2020-12, which is what Zod emits by default.
function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonObject {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
  });
  return jsonSchema;
}

/** Request bodies are documented as the client sends them; responses as the API returns them. */
const requestSchemas = {
  Register: registerSchema,
  Login: loginSchema,
  MfaVerify: mfaVerifySchema,
  FirebaseLogin: firebaseLoginSchema,
  PasskeyLoginVerify: passkeyLoginVerifySchema,
  PasskeyRegisterVerify: passkeyRegisterVerifySchema,
  ChangePassword: changePasswordSchema,
  TotpEnable: totpEnableSchema,
  TotpDisable: totpDisableSchema,
  UpdateProfile: updateProfileSchema,
  CreateUser: createUserSchema,
  UpdateUser: updateUserSchema,
  ExportRequest: exportRequestSchema,
  RegressionRequest: regressionRequestSchema,
  ComparablesRequest: comparablesRequestSchema,
  RatioStudyRequest: ratioStudyRequestSchema,
  BoostedRequest: boostedRequestSchema,
} satisfies Record<string, z.ZodType>;

const responseSchemas = {
  Error: apiErrorSchema,
  CsrfToken: csrfTokenSchema,
  AuthTokens: authTokensSchema,
  LoginResponse: loginResponseSchema,
  TotpSetup: totpSetupResponseSchema,
  Passkey: passkeySchema,
  User: userSchema,
  UserList: userListSchema,
  File: fileSchema,
  FileList: fileListSchema,
  FileUrl: fileUrlSchema,
  DashboardStats: dashboardStatsSchema,
  ExportJob: exportJobSchema,
  UserImportPreview: userImportPreviewSchema,
  RegressionResult: regressionResultSchema,
  ComparablesResult: comparablesResultSchema,
  RatioStudyResult: ratioStudyResultSchema,
  BoostedResult: boostedResultSchema,
} satisfies Record<string, z.ZodType>;

type RequestSchemaName = keyof typeof requestSchemas;
type ResponseSchemaName = keyof typeof responseSchemas;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

interface RouteDoc {
  method: 'get' | 'post' | 'patch' | 'delete';
  /** Relative to /api/v1, in OpenAPI form: `/users/{id}`. */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Routes are authenticated unless marked public. */
  public?: boolean;
  permission?: Permission;
  query?: z.ZodType;
  body?: RequestSchemaName | 'file';
  /** The success response. Defaults to 200. */
  status?: 200 | 201 | 202 | 204;
  response?: ResponseSchemaName | { arrayOf: ResponseSchemaName } | { binary: string } | 'object';
  /** Extra error statuses this route is known for, beyond the common ones. */
  errors?: number[];
}

const COOKIE_NOTE =
  'Sets the refresh token in an httpOnly cookie. Requires the `x-csrf-token` header.';

const routes: RouteDoc[] = [
  // ─── Auth ──────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/auth/csrf-token',
    tag: 'Auth',
    summary: 'Get a CSRF token',
    description:
      'Send the returned token in the `x-csrf-token` header of every state-changing request ' +
      'that is not authenticated with a bearer token (sign-in, refresh, sign-out).',
    public: true,
    response: 'CsrfToken',
  },
  {
    method: 'post',
    path: '/auth/register',
    tag: 'Auth',
    summary: 'Create an account',
    description: `New accounts get the "viewer" role. ${COOKIE_NOTE}`,
    public: true,
    body: 'Register',
    status: 201,
    response: 'AuthTokens',
    errors: [409],
  },
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Sign in with email and password',
    description:
      'Returns tokens, or — when the account has two-factor authentication — an `mfaToken` ' +
      `to exchange at /auth/mfa/verify. ${COOKIE_NOTE}`,
    public: true,
    body: 'Login',
    response: 'LoginResponse',
  },
  {
    method: 'post',
    path: '/auth/mfa/verify',
    tag: 'Auth',
    summary: 'Complete sign-in with a TOTP code',
    description: COOKIE_NOTE,
    public: true,
    body: 'MfaVerify',
    response: 'AuthTokens',
  },
  {
    method: 'post',
    path: '/auth/firebase',
    tag: 'Auth',
    summary: 'Sign in with a Firebase ID token',
    description: `Returns 501 when Firebase is not configured. ${COOKIE_NOTE}`,
    public: true,
    body: 'FirebaseLogin',
    response: 'LoginResponse',
    errors: [501],
  },
  {
    method: 'post',
    path: '/auth/passkeys/login/options',
    tag: 'Passkeys',
    summary: 'Start a passkey sign-in',
    description: 'Returns a `challengeId` and WebAuthn request options for the browser.',
    public: true,
    response: 'object',
  },
  {
    method: 'post',
    path: '/auth/passkeys/login/verify',
    tag: 'Passkeys',
    summary: 'Finish a passkey sign-in',
    description: COOKIE_NOTE,
    public: true,
    body: 'PasskeyLoginVerify',
    response: 'AuthTokens',
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tag: 'Auth',
    summary: 'Exchange the refresh cookie for a new access token',
    description:
      'Rotates the refresh token. Presenting an already-used token revokes the whole session family.',
    public: true,
    response: 'AuthTokens',
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Auth',
    summary: 'Sign out',
    public: true,
    status: 204,
  },
  {
    method: 'get',
    path: '/auth/me',
    tag: 'Auth',
    summary: 'Get the signed-in user',
    response: 'User',
  },
  {
    method: 'patch',
    path: '/auth/me',
    tag: 'Auth',
    summary: 'Update your own profile',
    body: 'UpdateProfile',
    response: 'User',
  },
  {
    method: 'post',
    path: '/auth/change-password',
    tag: 'Auth',
    summary: 'Change your password',
    description: 'Signs the account out of every session.',
    body: 'ChangePassword',
    status: 204,
  },
  {
    method: 'post',
    path: '/auth/totp/setup',
    tag: 'Two-factor',
    summary: 'Start TOTP enrolment',
    description:
      'Returns the secret and a QR code. Two-factor is not active until /auth/totp/enable.',
    response: 'TotpSetup',
  },
  {
    method: 'post',
    path: '/auth/totp/enable',
    tag: 'Two-factor',
    summary: 'Confirm TOTP enrolment with a code',
    body: 'TotpEnable',
    status: 204,
  },
  {
    method: 'post',
    path: '/auth/totp/disable',
    tag: 'Two-factor',
    summary: 'Turn off two-factor authentication',
    body: 'TotpDisable',
    status: 204,
  },
  {
    method: 'get',
    path: '/auth/passkeys',
    tag: 'Passkeys',
    summary: 'List your passkeys',
    response: { arrayOf: 'Passkey' },
  },
  {
    method: 'post',
    path: '/auth/passkeys/register/options',
    tag: 'Passkeys',
    summary: 'Start registering a passkey',
    description: 'Returns WebAuthn creation options for the browser.',
    response: 'object',
  },
  {
    method: 'post',
    path: '/auth/passkeys/register/verify',
    tag: 'Passkeys',
    summary: 'Finish registering a passkey',
    body: 'PasskeyRegisterVerify',
    status: 201,
    response: 'Passkey',
  },
  {
    method: 'delete',
    path: '/auth/passkeys/{id}',
    tag: 'Passkeys',
    summary: 'Remove a passkey',
    status: 204,
    errors: [404],
  },

  // ─── Users ─────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/users',
    tag: 'Users',
    summary: 'List users',
    permission: 'users:read',
    query: listUsersQuerySchema,
    response: 'UserList',
  },
  {
    method: 'post',
    path: '/users',
    tag: 'Users',
    summary: 'Create a user',
    permission: 'users:write',
    body: 'CreateUser',
    status: 201,
    response: 'User',
    errors: [409],
  },
  {
    method: 'get',
    path: '/users/{id}',
    tag: 'Users',
    summary: 'Get a user',
    permission: 'users:read',
    response: 'User',
    errors: [404],
  },
  {
    method: 'patch',
    path: '/users/{id}',
    tag: 'Users',
    summary: 'Update a user',
    description: 'Changing a role or deactivating an account revokes that user’s sessions.',
    permission: 'users:write',
    body: 'UpdateUser',
    response: 'User',
    errors: [404],
  },
  {
    method: 'delete',
    path: '/users/{id}',
    tag: 'Users',
    summary: 'Delete a user',
    permission: 'users:delete',
    status: 204,
    errors: [404],
  },

  // ─── Files ─────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/files',
    tag: 'Files',
    summary: 'List files',
    permission: 'files:read',
    query: paginationQuerySchema,
    response: 'FileList',
  },
  {
    method: 'post',
    path: '/files',
    tag: 'Files',
    summary: 'Upload a file',
    description:
      'The type is detected from the content, not the file name. Images are re-encoded as WebP, ' +
      'which strips their metadata.',
    permission: 'files:write',
    body: 'file',
    status: 201,
    response: 'File',
    errors: [413],
  },
  {
    method: 'get',
    path: '/files/{id}/url',
    tag: 'Files',
    summary: 'Get a short-lived download URL',
    permission: 'files:read',
    response: 'FileUrl',
    errors: [404],
  },
  {
    method: 'delete',
    path: '/files/{id}',
    tag: 'Files',
    summary: 'Delete a file',
    permission: 'files:delete',
    status: 204,
    errors: [404],
  },

  // ─── Reports ───────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/reports/stats',
    tag: 'Reports',
    summary: 'Dashboard statistics',
    description: 'Cached for 60 seconds.',
    permission: 'reports:read',
    response: 'DashboardStats',
  },
  {
    method: 'get',
    path: '/reports/users.xlsx',
    tag: 'Reports',
    summary: 'Download users as a spreadsheet (exceljs)',
    permission: 'reports:export',
    response: { binary: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  },
  {
    method: 'get',
    path: '/reports/users.csv',
    tag: 'Reports',
    summary: 'Download users as CSV (fast-csv)',
    permission: 'reports:export',
    response: { binary: 'text/csv' },
  },
  {
    method: 'get',
    path: '/reports/users.pdf',
    tag: 'Reports',
    summary: 'Download users as a PDF table (pdfmake)',
    permission: 'reports:export',
    response: { binary: 'application/pdf' },
  },
  {
    method: 'get',
    path: '/reports/summary.pdf',
    tag: 'Reports',
    summary: 'Download a one-page summary with a QR code (PDFKit)',
    permission: 'reports:export',
    response: { binary: 'application/pdf' },
  },
  {
    method: 'get',
    path: '/reports/bundle.zip',
    tag: 'Reports',
    summary: 'Download every report in one archive (archiver)',
    permission: 'reports:export',
    response: { binary: 'application/zip' },
  },
  {
    method: 'post',
    path: '/reports/users/import/preview',
    tag: 'Reports',
    summary: 'Validate a user import file',
    description:
      'Accepts .csv or .xlsx with the columns `name`, `email` and optionally `role`. ' +
      'Nothing is written; the response says which rows are valid.',
    permission: 'users:write',
    body: 'file',
    response: 'UserImportPreview',
  },
  {
    method: 'post',
    path: '/reports/exports',
    tag: 'Reports',
    summary: 'Queue an export for the background worker',
    description: 'The worker builds the file, stores it and emails a download link.',
    permission: 'reports:export',
    body: 'ExportRequest',
    status: 202,
    response: 'ExportJob',
  },
  {
    method: 'get',
    path: '/reports/exports/{id}',
    tag: 'Reports',
    summary: 'Check on a queued export',
    permission: 'reports:export',
    response: 'ExportJob',
    errors: [404],
  },

  // ─── Valuation ─────────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/valuation/regression',
    tag: 'Valuation',
    summary: 'Multiple linear regression (ordinary least squares)',
    permission: 'valuation:run',
    body: 'RegressionRequest',
    response: 'RegressionResult',
  },
  {
    method: 'post',
    path: '/valuation/comparables',
    tag: 'Valuation',
    summary: 'Sales comparison (k-nearest neighbours)',
    permission: 'valuation:run',
    body: 'ComparablesRequest',
    response: 'ComparablesResult',
  },
  {
    method: 'post',
    path: '/valuation/ratio-study',
    tag: 'Valuation',
    summary: 'Assessment ratio study (COD and PRD)',
    permission: 'valuation:run',
    body: 'RatioStudyRequest',
    response: 'RatioStudyResult',
  },
  {
    method: 'post',
    path: '/valuation/boosted',
    tag: 'Valuation',
    summary: 'Gradient-boosted regression trees',
    permission: 'valuation:run',
    body: 'BoostedRequest',
    response: 'BoostedResult',
  },
];

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'The request failed validation',
  401: 'Missing, invalid or expired credentials',
  403: 'Not permitted, or the CSRF token is missing or invalid',
  404: 'Not found',
  409: 'Conflicts with an existing resource',
  413: 'The upload is too large',
  429: 'Too many requests',
  501: 'This feature is not configured',
};

const errorResponse = (status: number) => ({
  description: ERROR_DESCRIPTIONS[status] ?? 'Error',
  content: { 'application/json': { schema: ref('Error') } },
});

function queryParameters(schema: z.ZodType): JsonObject[] {
  // "output" describes the values after coercion, which is what a caller should send.
  const { properties = {}, required = [] } = toJsonSchema(schema, 'output') as {
    properties?: Record<string, JsonObject>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    // A parameter with a default is optional for the caller, whatever the parsed type says.
    required: required.includes(name) && !('default' in property),
    schema: property,
  }));
}

function pathParameters(path: string): JsonObject[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    // Export jobs are numbered by the queue; everything else is identified by UUID.
    schema: path.startsWith('/reports/exports')
      ? { type: 'string' }
      : { type: 'string', format: 'uuid' },
  }));
}

function requestBody(body: RouteDoc['body']): JsonObject | undefined {
  if (!body) return undefined;
  if (body === 'file') {
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: { file: { type: 'string', format: 'binary' } },
          },
        },
      },
    };
  }
  return { required: true, content: { 'application/json': { schema: ref(`${body}Input`) } } };
}

function successResponse({ status = 200, response }: RouteDoc): JsonObject {
  if (status === 204 || !response) return { description: 'Done; no content' };
  if (typeof response === 'object' && 'binary' in response) {
    return {
      description: 'The file, as an attachment',
      content: { [response.binary]: { schema: { type: 'string', format: 'binary' } } },
    };
  }

  const schema =
    response === 'object'
      ? { type: 'object', additionalProperties: true }
      : typeof response === 'object'
        ? { type: 'array', items: ref(response.arrayOf) }
        : ref(response);
  return { description: 'Success', content: { 'application/json': { schema } } };
}

function operation(route: RouteDoc): JsonObject {
  const parameters = [
    ...pathParameters(route.path),
    ...(route.query ? queryParameters(route.query) : []),
  ];
  const errors = new Set([
    ...(route.body || route.query ? [400] : []),
    ...(route.public ? [403] : [401]),
    ...(route.permission ? [403] : []),
    ...(route.errors ?? []),
    429,
  ]);
  const description = [
    route.description,
    route.permission && `Requires the \`${route.permission}\` permission.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    tags: [route.tag],
    summary: route.summary,
    ...(description && { description }),
    operationId: `${route.method}${route.path.replace(/[^a-zA-Z0-9]+(\w)?/g, (_, next: string | undefined) => (next ?? '').toUpperCase())}`,
    // An empty requirement overrides the document-wide bearer default.
    ...(route.public && { security: [] }),
    ...(parameters.length > 0 && { parameters }),
    ...(route.body && { requestBody: requestBody(route.body) }),
    responses: {
      [route.status ?? 200]: successResponse(route),
      ...Object.fromEntries([...errors].sort().map((status) => [status, errorResponse(status)])),
    },
  };
}

function buildPaths(): JsonObject {
  const paths: Record<string, JsonObject> = {};
  for (const route of routes) {
    (paths[route.path] ??= {})[route.method] = operation(route);
  }

  // Health probes live outside the versioned prefix.
  const probe = (summary: string, extra: JsonObject = {}) => ({
    servers: [{ url: '/' }],
    get: {
      tags: ['Health'],
      summary,
      security: [],
      responses: {
        200: {
          description: 'Healthy',
          content: {
            'application/json': { schema: { type: 'object', additionalProperties: true } },
          },
        },
        ...extra,
      },
    },
  });
  paths['/health'] = probe('Liveness: the process is running');
  paths['/health/ready'] = probe(
    'Readiness: PostgreSQL and Redis are reachable. Storage is reported as "degraded", not failed',
    { 503: { description: 'PostgreSQL or Redis is unavailable' } },
  );

  return paths;
}

export function buildOpenApiDocument(): JsonObject {
  return {
    openapi: '3.1.0',
    info: {
      title: `${env.APP_NAME} API`,
      version: packageJson.version,
      description:
        'Authenticate with `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes; ' +
        'exchange the refresh cookie at `POST /auth/refresh` for a new one. Errors always have the ' +
        'shape `{ error: { code, message, details?, requestId } }`.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'Auth', description: 'Sessions, registration and the signed-in user' },
      { name: 'Two-factor', description: 'TOTP authenticator apps' },
      { name: 'Passkeys', description: 'WebAuthn credentials' },
      { name: 'Users', description: 'User administration' },
      { name: 'Files', description: 'Uploads to S3-compatible storage or Google Cloud Storage' },
      { name: 'Reports', description: 'Statistics, document exports and imports' },
      { name: 'Valuation', description: 'Statistical and machine-learning valuation models' },
      { name: 'Health', description: 'Probes for orchestrators and load balancers' },
    ],
    security: [{ bearerAuth: [] }],
    paths: buildPaths(),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ...Object.fromEntries(
          Object.entries(requestSchemas).map(([name, schema]) => [
            `${name}Input`,
            toJsonSchema(schema, 'input'),
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(responseSchemas).map(([name, schema]) => [
            name,
            toJsonSchema(schema, 'output'),
          ]),
        ),
      },
    },
  };
}
