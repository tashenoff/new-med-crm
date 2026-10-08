export const nextWorkDate = (doctor, todayISO) => {
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const workDays = new Set((doctor?.working_days || []).map(day => dayNames.indexOf(day)));
  const base = new Date(`${todayISO}T00:00:00`);
  for (let offset = 0; offset < 14; offset++) {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    if (workDays.has(date.getDay())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }
  return todayISO;
};

export const autofillSlot = (slot = {}, doctor, date, times, endTime) => {
  const availabilityKey = `${doctor.doctor_id}:${date}`;
  if (slot.availabilityKey === availabilityKey) return slot;
  const start = doctor.has_schedule === true ? times[0] || '' : '';
  return { ...slot, doctor_id: doctor.doctor_id, date, start,
    end: start ? endTime(start) : '', availabilityKey };
};

const timeMinutes = time => {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const hasScheduleWindow = doctor => doctor?.has_schedule === true
  && timeMinutes(doctor.schedule_end) - timeMinutes(doctor.schedule_start) >= 30;

export const freeTimesFor = doctor => {
  if (!hasScheduleWindow(doctor)) return [];
  const booked = new Set(doctor.booked || []);
  const times = [];
  for (let minutes = timeMinutes(doctor.schedule_start); minutes + 30 <= timeMinutes(doctor.schedule_end); minutes += 30) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if (!booked.has(time)) times.push(time);
  }
  return times;
};

export const isBookableSlot = (doctor, slot, times, endTime) => hasScheduleWindow(doctor)
  && slot?.doctor_id === doctor.doctor_id
  && !!slot?.start && times.includes(slot.start) && freeTimesFor(doctor).includes(slot.start)
  && slot.end === endTime(slot.start)
  && timeMinutes(slot.end) - timeMinutes(slot.start) === 30
  && timeMinutes(slot.start) >= timeMinutes(doctor.schedule_start)
  && timeMinutes(slot.end) <= timeMinutes(doctor.schedule_end);
