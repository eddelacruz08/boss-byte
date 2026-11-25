import { loginSchema, mfaVerifySchema, type LoginResponse } from '@bossbyte/shared';
import { Alert, Button, TextField } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { errorMessage, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isFirebaseConfigured, isPopupDismissed, signInWithGoogle } from '@/lib/firebase';
import {
  getPasskeyAssertion,
  isPasskeyPromptDismissed,
  isPasskeySupported,
  passkeyErrorMessage,
} from '@/lib/webauthn';
import { authApi } from './api';

export interface LoginFormProps {
  /** Called once the session is established and the user is loaded. */
  onSignedIn: () => void;
}

interface SignInAttempt {
  method: 'password' | 'passkey' | 'google';
  run: () => Promise<LoginResponse>;
}

async function signInWithPasskey(): Promise<LoginResponse> {
  const { challengeId, options } = await authApi.passkeyLoginOptions();
  const response = await getPasskeyAssertion(options);
  const tokens = await authApi.passkeyLoginVerify({ challengeId, response });
  return { mfaRequired: false, ...tokens };
}

async function signInWithGoogleAccount(): Promise<LoginResponse> {
  return authApi.firebaseLogin({ idToken: await signInWithGoogle() });
}

function signInErrorMessage(error: unknown, method: SignInAttempt['method']): string | null {
  if (isPasskeyPromptDismissed(error) || isPopupDismissed(error)) return null;
  if (isApiError(error)) return error.message;
  if (method === 'passkey') return passkeyErrorMessage(error);
  return errorMessage(error);
}

function CredentialsStep({
  onSignedIn,
  onMfaRequired,
}: LoginFormProps & { onMfaRequired: (mfaToken: string) => void }) {
  const { signIn } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const attempt = useMutation({
    mutationFn: async ({ run }: SignInAttempt) => {
      const outcome = await run();
      if (!outcome.mfaRequired) await signIn(outcome);
      return outcome;
    },
    onSuccess: (outcome) => {
      if (outcome.mfaRequired) onMfaRequired(outcome.mfaToken);
      else onSignedIn();
    },
  });

  const pendingMethod = attempt.isPending ? attempt.variables.method : null;
  const failure = attempt.isError
    ? signInErrorMessage(attempt.error, attempt.variables.method)
    : null;
  const showPasskey = isPasskeySupported();

  return (
    <div className="flex flex-col gap-5">
      {failure && <Alert tone="danger">{failure}</Alert>}

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          attempt.mutate({ method: 'password', run: () => authApi.login(values) }),
        )}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button
          type="submit"
          fullWidth
          loading={pendingMethod === 'password'}
          disabled={attempt.isPending}
        >
          Sign in
        </Button>
      </form>

      {(showPasskey || isFirebaseConfigured) && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5">
          {showPasskey && (
            <Button
              variant="outline"
              fullWidth
              loading={pendingMethod === 'passkey'}
              disabled={attempt.isPending}
              onClick={() => attempt.mutate({ method: 'passkey', run: signInWithPasskey })}
            >
              Sign in with a passkey
            </Button>
          )}
          {isFirebaseConfigured && (
            <Button
              variant="outline"
              fullWidth
              loading={pendingMethod === 'google'}
              disabled={attempt.isPending}
              onClick={() => attempt.mutate({ method: 'google', run: signInWithGoogleAccount })}
            >
              Continue with Google
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const mfaCodeSchema = mfaVerifySchema.pick({ code: true });

function MfaStep({
  mfaToken,
  onSignedIn,
  onCancel,
}: LoginFormProps & { mfaToken: string; onCancel: () => void }) {
  const { signIn } = useAuth();
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } });

  const verify = useMutation({
    mutationFn: async (code: string) => signIn(await authApi.verifyMfa({ mfaToken, code })),
    onSuccess: onSignedIn,
  });

  // The step replaces the password form, so move the keyboard along with it.
  useEffect(() => setFocus('code'), [setFocus]);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(({ code }) => verify.mutate(code))}
    >
      {verify.isError && <Alert tone="danger">{errorMessage(verify.error)}</Alert>}
      <TextField
        label="Authentication code"
        hint="Enter the 6-digit code from your authenticator app."
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={errors.code?.message}
        {...register('code')}
      />
      <Button type="submit" fullWidth loading={verify.isPending}>
        Verify
      </Button>
      <Button variant="ghost" fullWidth onClick={onCancel} disabled={verify.isPending}>
        Back to sign in
      </Button>
    </form>
  );
}

/**
 * The whole sign-in flow: password, then a TOTP code if the account has
 * two-factor enabled, with passkey and Google sign-in as alternatives where
 * the browser and configuration allow them.
 */
export function LoginForm({ onSignedIn }: LoginFormProps) {
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  if (mfaToken) {
    return (
      <MfaStep mfaToken={mfaToken} onSignedIn={onSignedIn} onCancel={() => setMfaToken(null)} />
    );
  }
  return <CredentialsStep onSignedIn={onSignedIn} onMfaRequired={setMfaToken} />;
}
