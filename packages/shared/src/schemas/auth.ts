import { z } from 'zod';
import { SECURITY } from '../constants/security';

/** Trimmed and lower-cased before validation, so " Ada@Example.com " is accepted. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));

/** The password policy, enforced identically in the browser and on the server. */
export const passwordSchema = z
  .string()
  .min(
    SECURITY.password.minLength,
    `Password must be at least ${SECURITY.password.minLength} characters`,
  )
  .max(SECURITY.password.maxLength)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^[0-9]{${SECURITY.totp.digits}}$`), 'Enter the 6-digit code');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(SECURITY.password.maxLength),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

/** Second step of a two-factor login. */
export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: totpCodeSchema,
});

export const totpEnableSchema = z.object({ code: totpCodeSchema });

export const totpDisableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const totpSetupResponseSchema = z.object({
  /** `otpauth://` URI, for manual entry or deep links. */
  uri: z.string(),
  /** The same URI rendered as a PNG data URL. */
  qrCodeDataUrl: z.string(),
  secret: z.string(),
});

export const firebaseLoginSchema = z.object({ idToken: z.string().min(1) });

/**
 * WebAuthn payloads are produced by the browser and verified structurally by
 * SimpleWebAuthn, so they are only loosely typed here.
 */
export const passkeyResponseSchema = z.object({
  response: z.looseObject({ id: z.string(), rawId: z.string(), type: z.literal('public-key') }),
});

export const passkeyRegisterVerifySchema = passkeyResponseSchema.extend({
  name: z.string().trim().min(1).max(60).default('Passkey'),
});

export const passkeyLoginOptionsSchema = z.object({ email: emailSchema.optional() });

export const passkeyLoginVerifySchema = passkeyResponseSchema.extend({
  challengeId: z.string().min(1),
});

export const passkeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  deviceType: z.string(),
  backedUp: z.boolean(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
});

/**
 * Logging in either completes straight away or asks for a second factor.
 * `mfaRequired` discriminates the two.
 */
export const loginResponseSchema = z.discriminatedUnion('mfaRequired', [
  authTokensSchema.extend({ mfaRequired: z.literal(false) }),
  z.object({ mfaRequired: z.literal(true), mfaToken: z.string() }),
]);

export const csrfTokenSchema = z.object({ csrfToken: z.string() });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type TotpEnableInput = z.infer<typeof totpEnableSchema>;
export type TotpDisableInput = z.infer<typeof totpDisableSchema>;
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;
export type FirebaseLoginInput = z.infer<typeof firebaseLoginSchema>;
export type PasskeyRegisterVerifyInput = z.infer<typeof passkeyRegisterVerifySchema>;
export type PasskeyLoginOptionsInput = z.infer<typeof passkeyLoginOptionsSchema>;
export type PasskeyLoginVerifyInput = z.infer<typeof passkeyLoginVerifySchema>;
export type Passkey = z.infer<typeof passkeySchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
