import { registerSchema, SECURITY, type RegisterInput } from '@bossbyte/shared';
import { Alert, Button, TextField } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { errorMessage, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiFieldErrors } from '@/lib/forms';
import { authApi } from './api';

export interface RegisterFormProps {
  /** Called once the account exists and the new user is signed in. */
  onRegistered: () => void;
}

export function RegisterForm({ onRegistered }: RegisterFormProps) {
  const { signIn } = useAuth();
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const createAccount = useMutation({
    mutationFn: async (values: RegisterInput) => signIn(await authApi.register(values)),
    onSuccess: onRegistered,
    onError: (error) => {
      if (isApiError(error, 'email_taken')) setError('email', { message: error.message });
      else applyApiFieldErrors(error, form);
    },
  });

  const hasFieldError = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => createAccount.mutate(values))}
    >
      {createAccount.isError && !hasFieldError && (
        <Alert tone="danger">{errorMessage(createAccount.error)}</Alert>
      )}
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        hint={`At least ${SECURITY.password.minLength} characters, with upper and lower case letters and a number.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" fullWidth loading={createAccount.isPending}>
        Create account
      </Button>
    </form>
  );
}
