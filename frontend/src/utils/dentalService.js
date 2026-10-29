export const isToothService = service => service?.unit === 'зуб';

export function dentalTotal(price, teeth = [], discount = 0) {
  const amount = (Number(price) || 0) * teeth.length * (1 - (Number(discount) || 0) / 100);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
