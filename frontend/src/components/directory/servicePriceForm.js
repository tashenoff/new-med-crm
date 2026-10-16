const SAVE_ERROR = 'Ошибка при сохранении услуги';

export const validateServicePrice = (value) => {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return 'Укажите цену. Допускается 0 ₸.';
  }
  const numeric = typeof value === 'number' || (typeof value === 'string'
    && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()));
  if (!numeric || !Number.isFinite(Number(value))) {
    return 'Введите корректную числовую цену.';
  }
  return Number(value) < 0 ? 'Цена не может быть отрицательной.' : '';
};

const errorLocation = (detail) => Array.isArray(detail?.loc)
  ? detail.loc.filter(part => typeof part === 'string' || typeof part === 'number')
    .filter(part => part !== 'body')
  : [];

const detailText = (detail) => {
  if (typeof detail === 'string') return detail.trim();
  if (Array.isArray(detail)) return detail.map(detailText).filter(Boolean).join('; ');
  if (detail && typeof detail === 'object') {
    const message = typeof detail.msg === 'string' ? detail.msg.trim()
      : typeof detail.message === 'string' ? detail.message.trim() : '';
    const location = errorLocation(detail).join('.');
    if (message) return location ? `${location}: ${message}` : message;
    if (location) return `${location}: Проверьте значение поля.`;
  }
  return '';
};

export const servicePriceSaveError = (detail) => {
  const items = Array.isArray(detail) ? detail : [detail];
  // A component's price is a different field; do not mark the package price.
  const priceDetails = items.filter(item => {
    const location = errorLocation(item);
    return location.length === 1 && location[0] === 'price';
  });
  return {
    message: detailText(detail) || SAVE_ERROR,
    priceError: priceDetails.length
      ? `Проверьте цену. ${detailText(priceDetails)}` : ''
  };
};
