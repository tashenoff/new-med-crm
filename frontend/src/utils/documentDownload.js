import { canAction } from './permissions.js';

// Build only our own authenticated API URL. Never send a bearer to a supplied URL.
export async function downloadPatientDocument(document, user) {
  if (!canAction(user, 'patients_view', 'patients_export')) throw new Error('Нет прав на скачивание документа');
  const filename = document?.filename;
  if (typeof filename !== 'string' || !filename || /[\\/:]/.test(filename) || ['.', '..'].includes(filename)) {
    throw new Error('Некорректное имя файла');
  }
  const { apiClient } = await import('../api/config');
  const response = await apiClient.get(`/uploads/${encodeURIComponent(filename)}`, {responseType: 'blob'});
  const objectUrl = URL.createObjectURL(response.data);
  const link = window.document.createElement('a');
  link.href = objectUrl;
  link.download = document.original_filename || filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
