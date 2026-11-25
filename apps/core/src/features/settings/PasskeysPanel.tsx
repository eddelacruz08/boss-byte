import type { Passkey } from '@bossbyte/shared';
import {
  Alert,
  Button,
  ConfirmDialog,
  formatDate,
  formatRelativeTime,
  Skeleton,
  TextField,
  useToast,
} from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { QueryError } from '@/components/QueryError';
import { authApi, passkeysQueryOptions } from '@/features/auth/api';
import { errorMessage, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  createPasskey,
  isPasskeyPromptDismissed,
  isPasskeySupported,
  passkeyErrorMessage,
} from '@/lib/webauthn';

const passkeyNameSchema = z.object({
  name: z.string().trim().min(1, 'Give the passkey a name').max(60),
});

async function registerPasskey(name: string): Promise<Passkey> {
  const options = await authApi.passkeyRegisterOptions();
  const response = await createPasskey(options);
  return authApi.passkeyRegisterVerify({ response, name });
}

/** The passkey list is also behind the user's `passkeyCount`, so both are refreshed. */
function usePasskeysChanged() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: passkeysQueryOptions.queryKey }),
      refreshUser(),
    ]);
}

function AddPasskeyForm() {
  const { toast } = useToast();
  const passkeysChanged = usePasskeysChanged();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(passkeyNameSchema), defaultValues: { name: '' } });

  const add = useMutation({
    mutationFn: registerPasskey,
    onSuccess: async (passkey) => {
      reset();
      toast({ title: `${passkey.name} was added`, tone: 'success' });
      await passkeysChanged();
    },
  });

  const failure =
    add.isError && !isPasskeyPromptDismissed(add.error)
      ? isApiError(add.error)
        ? errorMessage(add.error)
        : passkeyErrorMessage(add.error)
      : null;

  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={handleSubmit(({ name }) => add.mutate(name))}
    >
      {failure && <Alert tone="danger">{failure}</Alert>}
      <TextField
        label="Passkey name"
        placeholder="Work laptop"
        hint="Something that tells you which device it lives on."
        error={errors.name?.message}
        {...register('name')}
      />
      <div>
        <Button type="submit" loading={add.isPending}>
          Add a passkey
        </Button>
      </div>
    </form>
  );
}

/** Lists the user's passkeys and lets them add or remove one. */
export function PasskeysPanel() {
  const { toast } = useToast();
  const passkeys = useQuery(passkeysQueryOptions);
  const passkeysChanged = usePasskeysChanged();
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const remove = useMutation({
    mutationFn: authApi.deletePasskey,
    onSuccess: async () => {
      setConfirmOpen(false);
      toast({ title: 'Passkey removed', tone: 'info' });
      await passkeysChanged();
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast({ title: errorMessage(error), tone: 'danger' });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-slate-700">
        A passkey signs you in with your fingerprint, face or device PIN instead of a password. It
        cannot be phished and never leaves your device.
      </p>

      {passkeys.isPending && <Skeleton className="h-16 max-w-2xl" />}
      {passkeys.isError && (
        <QueryError error={passkeys.error} onRetry={() => void passkeys.refetch()} />
      )}
      {passkeys.data?.length === 0 && (
        <p className="text-sm text-slate-600">You have not added a passkey yet.</p>
      )}
      {passkeys.data && passkeys.data.length > 0 && (
        <ul className="max-w-2xl divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {passkeys.data.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-sm font-medium text-slate-950">{passkey.name}</p>
                <p className="text-sm text-slate-600">
                  Added {formatDate(passkey.createdAt)} ·{' '}
                  {passkey.lastUsedAt
                    ? `last used ${formatRelativeTime(passkey.lastUsedAt)}`
                    : 'never used'}
                  {passkey.backedUp && ' · synced'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Remove ${passkey.name}`}
                onClick={() => {
                  setRemoving(passkey);
                  setConfirmOpen(true);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isPasskeySupported() ? (
        <AddPasskeyForm />
      ) : (
        <Alert tone="info">This browser does not support passkeys.</Alert>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title="Remove this passkey?"
        message={`You will no longer be able to sign in with "${removing?.name ?? ''}".`}
        confirmLabel="Remove passkey"
        tone="danger"
        loading={remove.isPending}
      />
    </div>
  );
}
