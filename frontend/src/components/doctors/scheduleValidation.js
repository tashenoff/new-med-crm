export function scheduleErrorMessage(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => scheduleErrorMessage(item?.msg || item?.message || item)).filter(Boolean).join('; ');
  if (detail && typeof detail === 'object') return scheduleErrorMessage(detail.msg || detail.message || detail.detail);
  return '';
}
