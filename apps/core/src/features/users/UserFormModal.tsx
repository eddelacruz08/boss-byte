import {
  createUserSchema,
  nameSchema,
  ROLE_LABELS,
  ROLES,
  roleSchema,
  type User,
} from '@bossbyte/shared';
import { Alert, Button, Modal, Select, TextField, useToast } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage, isApiError } from '@/lib/api';
import { useAuth, useCurrentUser } from '@/lib/auth';
import { applyApiFieldErrors, optionalPhoneSchema } from '@/lib/forms';
import { useCreateUser, useUpdateUser } from './api';

const createFormSchema = createUserSchema.extend({
  role: roleSchema,
  phone: optionalPhoneSchema,
});

const editFormSchema = z.object({
  name: nameSchema,
  role: roleSchema,
  phone: optionalPhoneSchema,
});

const roleOptions = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The user to edit. Leave out to create a new one. */
  user?: User;
}

/** Create and edit share one dialog; the form inside is chosen by `user`. */
export function UserFormModal({ open, onClose, user }: UserFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? 'Edit user' : 'New user'}
      description={
        user
          ? `Update the details for ${user.email}.`
          : 'They can sign in straight away with the password you set.'
      }
    >
      {user ? <EditUserForm user={user} onDone={onClose} /> : <CreateUserForm onDone={onClose} />}
    </Modal>
  );
}

interface FormProps {
  onDone: () => void;
}

function FormActions({
  submitLabel,
  submitting,
  onCancel,
}: {
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button variant="outline" onClick={onCancel} disabled={submitting}>
        Cancel
      </Button>
      <Button type="submit" loading={submitting}>
        {submitLabel}
      </Button>
    </div>
  );
}

function CreateUserForm({ onDone }: FormProps) {
  const { toast } = useToast();
  const createUser = useCreateUser();
  const form = useForm({
    resolver: zodResolver(createFormSchema),
    defaultValues: { name: '', email: '', password: '', role: 'viewer' as const, phone: '' },
  });
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const hasFieldError = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) =>
        createUser.mutate(
          { ...values, phone: values.phone || null },
          {
            onSuccess: (created) => {
              toast({ title: `${created.name} was added`, tone: 'success' });
              onDone();
            },
            onError: (error) => {
              if (isApiError(error, 'email_taken')) setError('email', { message: error.message });
              else applyApiFieldErrors(error, form);
            },
          },
        ),
      )}
    >
      {createUser.isError && !hasFieldError && (
        <Alert tone="danger">{errorMessage(createUser.error)}</Alert>
      )}
      <TextField label="Full name" error={errors.name?.message} {...register('name')} />
      <TextField
        label="Email"
        type="email"
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Temporary password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Controller
        control={control}
        name="role"
        render={({ field, fieldState }) => (
          <Select
            label="Role"
            options={roleOptions}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <FormActions submitLabel="Create user" submitting={createUser.isPending} onCancel={onDone} />
    </form>
  );
}

function EditUserForm({ user, onDone }: FormProps & { user: User }) {
  const { toast } = useToast();
  const { setUser } = useAuth();
  // The API refuses a change to your own role, so the field is locked and left out.
  const isSelf = useCurrentUser().id === user.id;
  const updateUser = useUpdateUser();
  const form = useForm({
    resolver: zodResolver(editFormSchema),
    defaultValues: { name: user.name, role: user.role, phone: user.phone ?? '' },
  });
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const hasFieldError = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(({ role, name, phone }) =>
        updateUser.mutate(
          { id: user.id, input: { name, phone: phone || null, ...(isSelf ? {} : { role }) } },
          {
            onSuccess: (updated) => {
              if (isSelf) setUser(updated);
              toast({ title: `${updated.name} was updated`, tone: 'success' });
              onDone();
            },
            onError: (error) => applyApiFieldErrors(error, form),
          },
        ),
      )}
    >
      {updateUser.isError && !hasFieldError && (
        <Alert tone="danger">{errorMessage(updateUser.error)}</Alert>
      )}
      <TextField label="Full name" error={errors.name?.message} {...register('name')} />
      <Controller
        control={control}
        name="role"
        render={({ field, fieldState }) => (
          <Select
            label={isSelf ? 'Role (you cannot change your own)' : 'Role'}
            options={roleOptions}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
            disabled={isSelf}
          />
        )}
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <FormActions submitLabel="Save changes" submitting={updateUser.isPending} onCancel={onDone} />
    </form>
  );
}
