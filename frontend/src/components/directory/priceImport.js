export const previewErrors = preview => [
  ...(preview?.parse_errors || []),
  ...(preview?.services_preview?.match_errors || []),
];

export const canImportPreview = preview => Boolean(
  preview && preview.total_services > 0 && preview.can_import !== false
  && !preview.services_preview?.match_errors?.length
);

export const importErrorText = detail => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg || String(item)).join('\n');
  return [detail?.message, ...(detail?.errors || [])].filter(Boolean).join('\n') || 'Ошибка импорта';
};

export const formatImportTime = value => {
  if (!value || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return 'Дата недоступна';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата недоступна';
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  });
  return `${formatter.format(date)} (${formatter.resolvedOptions().timeZone})`;
};
