// Keep the existing display formatting for initial and synchronized stored values.
export const formatPhoneNumber = (value = '') => {
  const digits = String(value).replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS);
  return digits ? '+' + digits : '';
};

// This is a +7 field: bare leading 8 is a local trunk prefix, even while typing.
// Explicit + prefixes belong to the caller and must never be reinterpreted.
export const PHONE_MAX_DIGITS = 11;
export const PHONE_VALID_DIGITS = 11;

export const formatPhoneChange = (value = '') => {
  const input = String(value).trim();
  let digits = input.replace(/\D/g, '');
  const explicitPlus = input.startsWith('+');
  if (!digits) return explicitPlus ? '+' : '';
  if (!explicitPlus && digits.startsWith('8')) digits = '7' + digits.slice(1);
  // Preserve explicit foreign numbers in full; this does not validate them.
  if (!explicitPlus || digits.startsWith('7')) digits = digits.slice(0, PHONE_MAX_DIGITS);
  return '+' + digits;
};
