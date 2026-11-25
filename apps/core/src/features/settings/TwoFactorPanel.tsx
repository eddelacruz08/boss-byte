import { totpDisableSchema, totpEnableSchema, type TotpSetupResponse } from '@bossbyte/shared';
import { Alert, Badge, Button, TextField, useCopyToClipboard, useToast } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { authApi } from '@/features/auth/api';
import { errorMessage } from '@/lib/api';
import { useAuth, useCurrentUser } from '@/lib/auth';

function EnableStep({ setup, onCancel }: { setup: TotpSetupResponse; onCancel: () => void }) {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const { copied, copy } = useCopyToClipboard();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(totpEnableSchema), defaultValues: { code: '' } });

  const enable = useMutation({
    mutationFn: async (code: string) => {
      await authApi.totpEnable({ code });
      await refreshUser();
    },
    onSuccess: () => toast({ title: 'Two-factor authentication is on', tone: 'success' }),
  });

  return (
    <div className="flex max-w-md flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm text-slate-700">
        <li>
          <p>Scan this code with an authenticator app such as Google Authenticator or 1Password.</p>
          <img
            src={setup.qrCodeDataUrl}
            alt="QR code to add BossByte to your authenticator app"
            width={192}
            height={192}
            className="mt-3 rounded-lg border border-slate-200 bg-white p-2"
          />
          <p className="mt-3">Cannot scan it? Enter this key by hand instead:</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs break-all text-slate-900">
              {setup.secret}
            </code>
            <Button variant="outline" size="sm" onClick={() => void copy(setup.secret)}>
              {copied ? 'Copied' : 'Copy key'}
            </Button>
          </div>
        </li>
        <li>
          <p>Enter the 6-digit code the app shows to confirm it works.</p>
          <form
            noValidate
            className="mt-3 flex flex-col gap-4"
            onSubmit={handleSubmit(({ code }) => enable.mutate(code))}
          >
            {enable.isError && <Alert tone="danger">{errorMessage(enable.error)}</Alert>}
            <TextField
              label="Authentication code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              error={errors.code?.message}
              {...register('code')}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={enable.isPending}>
                Turn on two-factor
              </Button>
              <Button variant="ghost" onClick={onCancel} disabled={enable.isPending}>
                Cancel
              </Button>
            </div>
          </form>
        </li>
      </ol>
    </div>
  );
}

function DisableForm() {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(totpDisableSchema), defaultValues: { password: '' } });

  const disable = useMutation({
    mutationFn: async (password: string) => {
      await authApi.totpDisable({ password });
      await refreshUser();
    },
    onSuccess: () => toast({ title: 'Two-factor authentication is off', tone: 'info' }),
  });

  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={handleSubmit(({ password }) => disable.mutate(password))}
    >
      {disable.isError && <Alert tone="danger">{errorMessage(disable.error)}</Alert>}
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        hint="Confirm your password to turn two-factor authentication off."
        error={errors.password?.message}
        {...register('password')}
      />
      <div>
        <Button type="submit" variant="danger" loading={disable.isPending}>
          Turn off two-factor
        </Button>
      </div>
    </form>
  );
}

/** Turns TOTP two-factor authentication on (QR code, then a confirming code) or off. */
export function TwoFactorPanel() {
  const user = useCurrentUser();
  const setup = useMutation({ mutationFn: authApi.totpSetup });

  if (user.totpEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Badge tone="success">On</Badge>
          Signing in asks for a code from your authenticator app.
        </p>
        <DisableForm />
      </div>
    );
  }

  if (setup.data) return <EnableStep setup={setup.data} onCancel={setup.reset} />;

  return (
    <div className="flex max-w-md flex-col items-start gap-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <Badge>Off</Badge>
        Add a second step to sign-in: a code from an app on your phone.
      </p>
      {setup.isError && <Alert tone="danger">{errorMessage(setup.error)}</Alert>}
      <Button onClick={() => setup.mutate()} loading={setup.isPending}>
        Set up two-factor
      </Button>
    </div>
  );
}
