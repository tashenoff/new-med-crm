import React, { useEffect, useState, useRef } from 'react';
import './patientTermsPage.css';

const errors = {
  invalid_link: 'Ссылка недействительна. Обратитесь в клинику.',
  expired_link: 'Срок действия ссылки истёк. Попросите клинику прислать новую.',
  revoked_link: 'Ссылка отозвана. Обратитесь в клинику.',
};
const apiBase = `${(import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')}/api/public/patient-terms`;

export default function PatientTermsPage() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const currentToken = useRef(token);
  currentToken.current = token;
  useEffect(() => {
    const changed = () => setToken(window.location.hash.slice(1));
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const [resolved, setResolved] = useState(null);
  const data = resolved?.token === token ? resolved.data : null;
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = async (action, signal) => {
    const response = await fetch(`${apiBase}/${action}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'accept' ? { token, acknowledged: true } : { token }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(errors[result.detail] || 'Не удалось проверить условия. Попробуйте ещё раз.');
    return result;
  };
  useEffect(() => {
    document.title = 'Условия для пациента';
    setResolved(null); setChecked(false); setBusy(false); setError('');
    const controller = new AbortController();
    request('lookup', controller.signal).then(result => {
      if (!controller.signal.aborted && currentToken.current === token) setResolved({ token, data: result });
    }).catch(e => { if (!controller.signal.aborted && currentToken.current === token && e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
    // The public entrypoint mounts once for the URL and never loads the CRM shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const submit = async event => {
    event.preventDefault();
    if (!checked || busy) return;
    setBusy(true); setError('');
    try {
      const result = await request('accept');
      if (currentToken.current === token) setResolved({ token, data: result });
    }
    catch (e) { if (currentToken.current === token) setError(e.message); }
    finally { if (currentToken.current === token) setBusy(false); }
  };
  return <main className="public-terms">
    <article>
      <div className="public-terms-brand">CURAI · для пациента</div>
      <h1>Условия для пациента</h1>
      {error && <p role="alert" className="public-terms-error">{error}</p>}
      {!data && !error && <p role="status">Загрузка условий…</p>}
      {data && <>
        {data.document.demonstration && <p className="public-terms-demo">Демонстрационный пример · не утверждённая политика клиники</p>}
        <p className="public-terms-version">Версия {data.document.version}</p>
        <div className="public-terms-text">{data.document.text}</div>
        {data.state === 'accepted' ? <div role="status" className="public-terms-success"><h2>Ознакомление подтверждено</h2><p>Дата: {new Date(data.accepted_at).toLocaleString('ru-RU')}</p><p>Можно закрыть эту страницу.</p></div> : <form onSubmit={submit}>
          <label><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={busy}/><span>Я ознакомился(ась) с указанной версией условий</span></label>
          <button type="submit" disabled={!checked || busy}>{busy ? 'Сохраняем…' : 'Подтвердить ознакомление'}</button>
          <p className="public-terms-note">Открытие ссылки ничего не подтверждает. Подтверждается действие обладателя ссылки, а не его личность.</p>
        </form>}
      </>}
    </article>
  </main>;
}
