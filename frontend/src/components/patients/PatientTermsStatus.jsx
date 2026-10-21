import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/config';

const hiddenPatients = new Set(); // Memory only, isolated to this browser tab/session.
const dateLabel = value => value ? new Date(value).toLocaleString('ru-RU') : '';

export default function PatientTermsStatus({ patientId, dismissible = false, active = true }) {
  const [result, setResult] = useState(null);
  const [hidden, setHidden] = useState(null);
  useEffect(() => {
    if (!patientId || !active) return undefined;
    let stopped = false;
    let timer;
    let controller;
    const poll = async () => {
      clearTimeout(timer);
      if (document.hidden || stopped) return;
      controller?.abort();
      const pending = new AbortController();
      controller = pending;
      try {
        const { data } = await apiClient.get(`/patients/${encodeURIComponent(patientId)}/terms-status`, { signal: pending.signal });
        if (!stopped && controller === pending) setResult({ patientId, data });
      } catch (error) {
        if (!stopped && controller === pending && error.code !== 'ERR_CANCELED') setResult({ patientId, error: true });
      } finally {
        if (!stopped && controller === pending && !document.hidden) timer = setTimeout(poll, 10000);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) controller?.abort();
      else poll();
    };
    poll();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [patientId, active]);
  if (!patientId || !active || (dismissible && (hidden === patientId || hiddenPatients.has(patientId)))) return null;
  const current = result?.patientId === patientId ? result : null;
  const data = current?.data;
  return <section className={`patient-terms-status ${dismissible ? 'compact' : ''}`} aria-label="Условия пациента" aria-live="polite">
    <div>
      <span>{!current ? 'Проверяем условия…' : current.error ? 'Статус условий недоступен' : data.accepted ? `Условия приняты · ${dateLabel(data.accepted_at)}` : 'Условия не приняты'}</span>
      {!dismissible && data && <>
        <small>Текущая версия: {data.version}{data.demonstration ? ' · демонстрационная' : ''}</small>
        {data.history?.length > 0 && <details><summary>История принятия</summary>{data.history.map(item => <p key={item.document.version}>{item.document.version} · {dateLabel(item.accepted_at)}<br/>{item.document.title}</p>)}</details>}
      </>}
    </div>
    {dismissible && <button type="button" aria-label="Скрыть статус условий" onClick={() => { hiddenPatients.add(patientId); setHidden(patientId); }}>×</button>}
  </section>;
}
