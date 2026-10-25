import { useEffect, useRef, useState } from 'react';

const selectionKey = form => JSON.stringify([
  form.doctor_id, form.room_id || '', form.appointment_date,
  form.appointment_time, form.end_time || '', form.complex_id || ''
]);

// All three entry points use AppointmentModal. Resolve against fresh server
// data and ignore late responses when the user has changed their selection.
export function useBookingTime({ show, editing, form, update, api }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const automaticKey = useRef(null);
  const updateRef = useRef(update);
  updateRef.current = update;
  const key = selectionKey(form);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError('');
    if (key !== automaticKey.current) setNotice('');
    if (!show || editing || !form.doctor_id || !form.appointment_date || !form.appointment_time) {
      setChecking(false);
      return () => { active = false; controller.abort(); };
    }
    const toMinutes = time => {
      if (!/^\d{2}:\d{2}$/.test(time || '')) return NaN;
      const [hours, minutes] = time.split(':').map(Number);
      return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
    };
    const duration = form.end_time ? toMinutes(form.end_time) - toMinutes(form.appointment_time) : 30;
    if (!Number.isFinite(duration) || duration < 30) {
      setChecking(false);
      return () => { active = false; controller.abort(); };
    }
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${api}/api/appointments/resolve-time`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ doctor_id: form.doctor_id, room_id: form.room_id || null,
            appointment_date: form.appointment_date, appointment_time: form.appointment_time,
            end_time: form.end_time || null, complex_id: form.complex_id || null })
        });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось подобрать время приёма');
        if (data.appointment_time !== form.appointment_time || data.end_time !== form.end_time) {
          const adjusted = { ...form, ...data };
          automaticKey.current = selectionKey(adjusted);
          updateRef.current(current => selectionKey(current) === key ? { ...current, ...data } : current);
          if (data.appointment_time !== form.appointment_time) {
            setNotice(`Выбрано ближайшее свободное время: ${data.appointment_time}–${data.end_time}`);
          }
        }
      } catch (failure) {
        if (active && failure.name !== 'AbortError') setError(failure.message || 'Не удалось проверить время приёма');
      } finally {
        if (active) setChecking(false);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [show, editing, key, api]);

  return { checking, error, notice };
}
