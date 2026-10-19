import { ledgerCommands } from './accountingLedger.js';

export const APPOINTMENT_STATUSES = [
  { value: 'unconfirmed', label: 'Не подтверждено', color: 'bg-yellow-400', tone: 'warning', icon: 'clock' },
  { value: 'confirmed', label: 'Подтверждено', color: 'bg-green-500', tone: 'positive', icon: 'check' },
  { value: 'arrived', label: 'Пришел', color: 'bg-blue-500', tone: 'blue', icon: 'arrow-right' },
  { value: 'in_progress', label: 'На приеме', color: 'bg-indigo-500', tone: 'blue', icon: 'clock' },
  { value: 'completed', label: 'Завершен', color: 'bg-gray-500', tone: 'muted', icon: 'check' },
  { value: 'cancelled', label: 'Отменен', color: 'bg-red-500', tone: 'negative', icon: 'close' },
  { value: 'no_show', label: 'Не явился', color: 'bg-orange-500', tone: 'muted', icon: 'clock' },
];
export function clinicDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bishkek', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = name => parts.find(part => part.type === name)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function appointmentStatusReason(appointment, status, now = new Date()) {
  if (!APPOINTMENT_STATUSES.some(item => item.value === status)) return 'Неизвестный статус записи';
  if (['arrived', 'in_progress', 'completed', 'no_show'].includes(status)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment?.appointment_date || '')) return 'Не удалось определить дату приёма';
    if (appointment.appointment_date > clinicDate(now)) return 'Статус посещения доступен с даты приёма';
  }
  return '';
}
export const canEditCalendar = user => Boolean(user && (['admin', 'super_admin'].includes(user.role) || user.permissions?.includes('calendar_edit')));

// Both calendar and WhatsApp use the same completion idempotency key and writer.
export async function sendAppointmentStatus(id, status, send, appointment) {
  if (appointment) {
    const reason = appointmentStatusReason(appointment, status);
    if (reason) throw new Error(reason);
  }
  const result = status === 'completed'
    ? await ledgerCommands.run(`appointment:status:${id}`, { status }, send)
    : await send({ status });
  if (typeof window !== 'undefined') window.dispatchEvent(new window.Event('crm-appointments-changed'));
  return result;
}
