/**
 * Saves a blob to the user's device under `fileName`.
 *
 * @example
 *   const { blob, fileName } = await api.download('/reports/users.pdf');
 *   saveBlob(blob, fileName ?? 'users.pdf');
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Starts a download from a URL the browser can fetch on its own, such as a
 * signed storage link. The server has to answer with
 * `Content-Disposition: attachment` (the API's signed links do); otherwise
 * the browser shows the file in place of the app.
 *
 * @example
 *   const { url } = await api.get<FileUrl>(`/files/${id}/url`);
 *   startDownload(url);
 */
export function startDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
}
