import { nameSchema } from '@bossbyte/shared';
import { Alert, Button, TextField, useToast } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi } from '@/features/auth/api';
import { errorMessage } from '@/lib/api';
import { useAuth, useCurrentUser } from '@/lib/auth';
import { applyApiFieldErrors, optionalPhoneSchema } from '@/lib/forms';

const profileFormSchema = z.object({ name: nameSchema, phone: optionalPhoneSchema });

export function ProfileForm() {
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '' },
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  const save = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (updated) => {
      setUser(updated);
      reset({ name: updated.name, phone: updated.phone ?? '' });
      toast({ title: 'Profile saved', tone: 'success' });
    },
    onError: (error) => applyApiFieldErrors(error, form),
  });

  const hasFieldError = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={handleSubmit((values) =>
        save.mutate({ name: values.name, phone: values.phone || null }),
      )}
    >
      {save.isError && !hasFieldError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <TextField
        label="Email"
        type="email"
        value={user.email}
        readOnly
        hint="Your email is your sign-in name and cannot be changed here."
      />
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div>
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
