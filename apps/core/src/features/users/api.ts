import type { CreateUserInput, UpdateUserInput, User, UserList } from '@bossbyte/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { UsersSearch } from './search';

export const usersApi = {
  create: (input: CreateUserInput) => api.post<User>('/users', input),
  update: (id: string, input: UpdateUserInput) => api.patch<User>(`/users/${id}`, input),
  remove: (id: string) => api.delete(`/users/${id}`),
};

export function usersQueryOptions(search: UsersSearch) {
  return queryOptions({
    queryKey: ['users', 'list', search],
    queryFn: ({ signal }) => api.get<UserList>('/users', { query: search, signal }),
    // Keeps the current rows on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  });
}

/** Any change to a user also changes the dashboard figures. */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['reports', 'stats'] }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: usersApi.create, onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      usersApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: usersApi.remove, onSuccess: invalidate });
}
