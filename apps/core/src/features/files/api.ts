import type { FileList, FileUrl, StoredFile } from '@bossbyte/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const filesApi = {
  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.upload<StoredFile>('/files', form);
  },
  /** A short-lived signed link straight to the storage bucket. */
  getUrl: (id: string) => api.get<FileUrl>(`/files/${id}/url`),
  remove: (id: string) => api.delete(`/files/${id}`),
};

export function filesQueryOptions(page: number, pageSize: number) {
  return queryOptions({
    queryKey: ['files', 'list', { page, pageSize }],
    queryFn: ({ signal }) => api.get<FileList>('/files', { query: { page, pageSize }, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Uploads and deletions also change the dashboard's file and storage figures. */
function useInvalidateFiles() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['files'] }),
      queryClient.invalidateQueries({ queryKey: ['reports', 'stats'] }),
    ]);
}

export function useUploadFile() {
  const invalidate = useInvalidateFiles();
  return useMutation({ mutationFn: filesApi.upload, onSuccess: invalidate });
}

export function useDeleteFile() {
  const invalidate = useInvalidateFiles();
  return useMutation({ mutationFn: filesApi.remove, onSuccess: invalidate });
}
