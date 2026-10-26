import LoadingIndicator from '../../common/LoadingIndicator';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import AuthContext from '../../../context/AuthContext';
import { apiClient, handleApiError } from '../../../api/config';
import { canEditCalendar, appointmentStatusReason, sendAppointmentStatus } from '../../../utils/appointmentStatus';
import useDialogFocus from '../../../hooks/useDialogFocus';
import Modal from '../../modals/Modal';
import CuraiButton from '../../common/CuraiButton';
import AppointmentStatusControl from '../../calendar/ux/AppointmentStatusControl';

const nextAction = { unconfirmed: ['confirmed', 'Подтвердить'], confirmed: ['arrived', 'Пациент пришел'], arrived: ['in_progress', 'Начать прием'], in_progress: ['completed', 'Завершить'] };
const dateLabel = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
};
function AppointmentsDialog({ state, patientName, reload, onClose, onBook, booking, showBookAction, onStatus, busy, error, canEdit }) {
  const body = useRef(null);
  useDialogFocus(body, true, onClose);
  return <Modal show onClose={onClose} dialogLabel="Приёмы пациента" title="Приёмы пациента" className="curai-appointments-dialog" size="max-w-[960px]" subheader={<div className="curai-appointments-subheader"><span>{patientName}{state.records && <> · {state.records.length} записей</>}</span>{showBookAction && <CuraiButton variant="primary" disabled={booking} onClick={onBook}>Записать</CuraiButton>}</div>}>
    <div ref={body}>
      {(error || state.error) && <p role="alert" className="curai-communication-error">{error || state.error} {state.error && <CuraiButton onClick={reload}>Повторить</CuraiButton>}</p>}
      {state.loading ? <LoadingIndicator label="Загрузка приёмов…" /> : state.records?.length ? <table className="curai-appointments-table"><thead><tr><th>Дата и время</th><th>Врач / компонент</th><th>Статус записи</th><th>Действие</th></tr></thead><tbody>
        {state.records.map(appointment => {
          const id = appointment.id || appointment._id, action = nextAction[appointment.status], reason = action ? appointmentStatusReason(appointment, action[0]) : '';
          return <tr key={id}><td><strong>{dateLabel(appointment.appointment_date)}</strong><span>{appointment.appointment_time}{appointment.end_time ? `–${appointment.end_time}` : ''}</span></td><td><strong title={appointment.doctor_name}>{appointment.doctor_name || 'Врач не указан'}</strong><span>{appointment.reason || appointment.doctor_specialty || '—'}</span></td><td><AppointmentStatusControl appointment={appointment} disabled={!canEdit || Boolean(busy)} onChange={status => onStatus(appointment, status)}/></td><td>{action ? <CuraiButton disabled={!canEdit || Boolean(busy) || Boolean(reason)} title={!canEdit ? 'Недостаточно прав для изменения календаря' : reason || action[1]} onClick={() => onStatus(appointment, action[0])}>{busy === id ? 'Обработка…' : action[1]}</CuraiButton> : <span>—</span>}</td></tr>;
        })}
      </tbody></table> : !state.error && <div className="curai-appointments-empty"><strong>Приёмов пока нет</strong><p>Новые записи пациента появятся здесь.</p></div>}
    </div>
  </Modal>;
}
export default function PatientAppointments({ patientId, patientName, revision, onBook, booking, onChanged, showBookAction = true }) {
  const user = useContext(AuthContext)?.user;
  const [state, setState] = useState({ patientId, loading: Boolean(patientId), records: null, error: '' });
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(null), [error, setError] = useState('');
  const generation = useRef(0), locked = useRef(false), currentPatient = useRef(patientId);
  currentPatient.current = patientId;
  const close = useCallback(() => setOpen(false), []);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    if (!patientId) { setState({ patientId, loading: false, records: null, error: '' }); return; }
    setState({ patientId, loading: true, records: null, error: '' });
    try {
      const { data } = await apiClient.get('/appointments', { params: { patient_id: patientId } });
      const records = Array.isArray(data) ? data : data?.appointments;
      if (!Array.isArray(records) || records.some(row => row.patient_id !== patientId || !(row.id || row._id))) throw new Error('Некорректный список приёмов пациента');
      if (request === generation.current) setState({ patientId, loading: false, records, error: '' });
    } catch (failure) { if (request === generation.current) setState({ patientId, loading: false, records: null, error: handleApiError(failure) }); }
  }, [patientId]);
  useEffect(() => { reload(); return () => { generation.current++; }; }, [reload, revision]);
  useEffect(() => { window.addEventListener('crm-appointments-changed', reload); return () => window.removeEventListener('crm-appointments-changed', reload); }, [reload]);
  useEffect(() => { close(); setError(''); }, [patientId, close]);
  const onStatus = async (appointment, status) => {
    const reason = appointmentStatusReason(appointment, status);
    if (locked.current || !canEditCalendar(user) || reason) return;
    const activePatient = patientId, id = appointment.id || appointment._id;
    locked.current = true; setBusy(id); setError('');
    try {
      await sendAppointmentStatus(id, status, body => apiClient.patch(`/appointments/${encodeURIComponent(id)}/status`, body), appointment);
      if (currentPatient.current === activePatient) await onChanged?.();
    } catch (failure) { if (currentPatient.current === activePatient) setError(handleApiError(failure)); }
    finally { locked.current = false; if (currentPatient.current === activePatient) setBusy(null); }
  };
  const visible = state.patientId === patientId ? state : { loading: true, records: null };
  return <><CuraiButton variant="ghost" className="curai-chat-action" disabled={!patientId} onClick={() => { setOpen(true); reload(); }}>Приёмы{patientId && (visible.loading ? ' · …' : visible.records ? ` · ${visible.records.length}` : '')}</CuraiButton>
    {open && patientId && <AppointmentsDialog state={visible} patientName={patientName} onClose={close} reload={reload} onBook={() => { close(); onBook(); }} booking={booking} showBookAction={showBookAction} onStatus={onStatus} busy={busy} error={error} canEdit={canEditCalendar(user)}/>}
  </>;
}
