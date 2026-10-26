import LoadingIndicator from '../common/LoadingIndicator';
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../../api/config';

const STATUS_META = {
  pending_score: { label: 'Ожидает оценку', cls: "bg-curai-warningBg text-curai-warning" },
  pending_reason: { label: 'Ожидает причину', cls: "bg-curai-warningBg text-curai-warning" },
  good: { label: 'Хорошо', cls: "bg-curai-positiveBg text-curai-positive" },
  bad: { label: 'Плохо', cls: "bg-curai-negativeBg text-curai-negative" }
};

const inputCls = "w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus text-sm";
const labelCls = "block text-sm font-medium text-curai-ink mb-1";

const FeedbackView = () => {
  const [settings, setSettings] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, fRes] = await Promise.all([
        fetch(`${API_BASE_URL}/feedback/settings`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/feedback`, { headers: authHeaders() })
      ]);
      if (sRes.ok) setSettings(await sRes.json());
      if (fRes.ok) setFeedbacks(await fRes.json());
    } catch (e) {
      console.error('feedback load error', e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setSettings(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const patch = {
        enabled: settings.enabled,
        good_score_min: Number(settings.good_score_min) || 8,
        review_link: settings.review_link,
        good_message: settings.good_message,
        ask_reason_message: settings.ask_reason_message
      };
      const res = await fetch(`${API_BASE_URL}/feedback/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(patch)
      });
      if (res.ok) {
        setSettings(await res.json());
        setMsg({ type: 'ok', text: 'Настройки сохранены' });
        load();
      } else {
        setMsg({ type: 'err', text: 'Не удалось сохранить' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: 'Ошибка сохранения' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <LoadingIndicator label="Загрузка..." className="text-center py-10 text-curai-muted" />;
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return (
    <div className="space-y-6">
      {/* Сообщение */}
      {msg && (
        <div className={`mb-4 px-4 py-3 rounded ${msg.type === 'ok' ? "bg-curai-positiveBg border border-curai-positive text-curai-positive" : "bg-curai-negativeBg border border-curai-negative text-curai-negative"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-right font-semibold">×</button>
        </div>
      )}

      {/* Настройки */}
      <div className="border border-curai-border rounded-md p-5">
        <h4 className="text-sm font-semibold text-curai-ink mb-3">⚙️ Настройки обратной связи</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Включить</label>
            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={settings.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="w-4 h-4 text-curai-blue border-curai-control rounded focus:ring-curai-focus" />
              <span className="text-sm text-curai-muted ">Авто-опрос после завершения приёма</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>Порог «хорошая оценка» (1–10)</label>
            <input type="number" min="1" max="10" value={settings.good_score_min}
              onChange={(e) => set('good_score_min', e.target.value)} className={inputCls} />
            <p className="text-xs text-curai-muted mt-1">Оценка ≥ порога — отправляем ссылку на отзыв, иначе спрашиваем причину.</p>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Ссылка на отзыв</label>
            <input type="text" value={settings.review_link}
              onChange={(e) => set('review_link', e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Сообщение при хорошей оценке (макросы: {`{score}`}, {`{link}`})</label>
            <textarea rows={2} value={settings.good_message}
              onChange={(e) => set('good_message', e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Сообщение при плохой оценке (макрос {`{score}`})</label>
            <textarea rows={2} value={settings.ask_reason_message}
              onChange={(e) => set('ask_reason_message', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue text-sm disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>
      </div>

      {/* Список фидбеков */}
      <div>
        <h4 className="text-sm font-semibold text-curai-ink mb-3">📊 Фидбек от пациентов</h4>
        {feedbacks.length === 0 ? (
          <div className="text-center py-10 bg-curai-subtle rounded-md text-curai-muted">
            Пока нет обратной связи
          </div>
        ) : (
          <div className="overflow-x-auto border border-curai-border rounded-md">
            <table className="min-w-full divide-y divide-curai-border ">
              <thead className="bg-curai-negativeBg ">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase">Пациент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase">Врач</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase">Дата</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase">Оценка</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase">Причина</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase">Статус</th>
                </tr>
              </thead>
              <tbody className="bg-curai-surface divide-y divide-curai-border ">
                {feedbacks.map((f) => {
                  const meta = STATUS_META[f.status] || { label: f.status, cls: "bg-curai-subtle text-curai-ink" };
                  return (
                    <tr key={f.id || f._id}>
                      <td className="px-4 py-3 text-sm text-curai-ink whitespace-nowrap">{f.patient_name}</td>
                      <td className="px-4 py-3 text-sm text-curai-ink whitespace-nowrap">{f.doctor_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-curai-muted whitespace-nowrap">{fmtDate(f.created_at)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-curai-ink ">{f.score ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-curai-muted max-w-xs break-words">{f.reason || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackView;
