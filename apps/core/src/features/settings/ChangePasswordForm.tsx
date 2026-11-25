import { changePasswordSchema, SECURITY } from '@bossbyte/shared';
import { Alert, Button, TextField, useToast } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { authApi } from '@/features/auth/api';
import { errorMessage, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiFieldErrors } from '@/lib/forms';

export function ChangePasswordForm() {
  const { clear } = useAuth();
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const change = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      toast({
        title: 'Password changed',
        description: 'Sign in again with your new password.',
        tone: 'success',
      });
      // The API has revoked every session, this one included.
      clear();
    },
    onError: (error) => {
      if (isApiError(error, 'invalid_password')) {
        setError('currentPassword', { message: error.message });
      } else {
        applyApiFieldErrors(error, form);
      }
    },
  });

  const hasFieldError = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={handleSubmit((values) => change.mutate(values))}
    >
      <Alert tone="info">
        Changing your password signs you out everywhere, including on this device.
      </Alert>
      {change.isError && !hasFieldError && (
        <Alert tone="danger">{errorMessage(change.error)}</Alert>
      )}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${SECURITY.password.minLength} characters, with upper and lower case letters and a number.`}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <div>
        <Button type="submit" loading={change.isPending}>
          Change password
        </Button>
      </div>
    </form>
  );
}
