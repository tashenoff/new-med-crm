import { timeToMinutes, SLOT_INTERVAL_MINUTES, SLOT_HEIGHT_PX, DEFAULT_APPOINTMENT_DURATION } from '../../../config/calendarConfig.js';

// Display geometry only: never round or mutate the stored appointment interval.
export const getAppointmentLayout = (appointment, visibleStart, visibleEnd) => {
  const start = timeToMinutes(appointment.appointment_time);
  const end = appointment.end_time ? timeToMinutes(appointment.end_time) : start + DEFAULT_APPOINTMENT_DURATION;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const clippedStart = Math.max(start, visibleStart);
  const clippedEnd = Math.min(end, visibleEnd);
  if (clippedEnd <= clippedStart) return null;
  const pixelsPerMinute = SLOT_HEIGHT_PX / SLOT_INTERVAL_MINUTES;
  return { top: (clippedStart - visibleStart) * pixelsPerMinute, height: (clippedEnd - clippedStart) * pixelsPerMinute };
};
