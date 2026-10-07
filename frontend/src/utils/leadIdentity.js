export const normalizeIdentityPhone = (phone) => {
  if (typeof phone !== 'string' || !/^\+?[0-9\s().-]+$/.test(phone.trim())) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 10 || digits.length > 15 || new Set(digits).size === 1) return null;
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
};
