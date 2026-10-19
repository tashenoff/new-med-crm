import React, { useEffect, useState } from 'react';
import { money } from './PaymentPresentation';
import { paymentResponse } from '../../../utils/settleLegacyPlan';

export default function PatientFundingSummary({ patientId, plans }) {
  const [state, setState] = useState({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ patientId, loading: true });
    if (!patientId) { setState({ patientId, error: 'Выберите пациента' }); return () => { current = false; }; }
    (async () => {
      try {
        const data = await paymentResponse(await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/patients/${encodeURIComponent(patientId)}/funding-summary`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }));
        if (!Number.isFinite(data.deposit_received_kzt) || !['deposit_used_kzt', 'deposit_available_kzt'].every(key => data[key] === null || Number.isFinite(data[key]))) throw new Error('Некорректный ответ о депозите');
        if (current) setState({ patientId, data });
      } catch (error) { if (current) setState({ patientId, error: error.message }); }
    })();
    return () => { current = false; };
  }, [patientId, plans, retry]);
  const ready = state.patientId === patientId && state.data;
  const amount = key => ready && ready[key] != null ? money(ready[key]) : state.loading ? 'Загрузка…' : 'Нет данных';
  return <div className="curai-r21-deposit" aria-label="Депозит пациента">
    <span>Депозит</span><strong aria-label="Сумма депозита">{amount('deposit_available_kzt')}</strong>
    {(ready?.detail || state.error) && <div className="curai-r21-deposit-details">
      {ready?.detail && <small role="status">{ready.detail}</small>}
      {state.error && <small role="alert">Данные депозита недоступны: {state.error} <button type="button" className="curai-r21-deposit-retry" onClick={() => setRetry(value => value + 1)}>Повторить</button></small>}
    </div>}
  </div>;
}
