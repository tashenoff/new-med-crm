import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// Stored international numbers may lack '+', e.g. a WhatsApp chatId.
// Do not infer a country for local numbers or reinterpret the local 8 trunk.
export const formatPatientPhone = (value = '') => {
  if (typeof value !== 'string') return '';
  const input = value.trim();
  if (!/^\+?[0-9\s().-]+$/.test(input)) return value;
  const digits = input.replace(/[^0-9]/g, '');
  if (!input.startsWith('+') && (digits.length < 11 || (digits.length === 11 && digits.startsWith('8')))) return value;
  const candidate = `+${digits}`;
  const phone = parsePhoneNumberFromString(candidate, { extract: false });
  // Formatting may add '+', but must never change the identity's digits.
  return phone?.isValid() && phone.number === candidate ? candidate : value;
};
