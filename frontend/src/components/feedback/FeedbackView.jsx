import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../../api/config';

const STATUS_META = {
  pending_score: { label: 'Ожидает оценку', cls: 'bg-amber-100 text-amber-800' },
  pending_reason: { label: 'Ожидает причину', cls: 'bg-amber-100 text-amber-800' },
  good: { label: 'Хорошо', cls: 'bg-emerald-100 text-emerald-800' },
  bad: { label: 'Плохо', cls: 'bg-red-100 text-red-800' }
};

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

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
    return <div className="text-center py-10 text-gray-500">Загрузка...</div>;
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return (
    <div className="space-y-6">
      {/* Сообщение */}
      {msg && (
        <div className={`mb-4 px-4 py-3 rounded ${msg.type === 'ok' ? 'bg-green-100 border border-green-400 text-green-700' : 'bg-red-100 border border-red-400 text-red-700'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Настройки */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">⚙️ Настройки обратной связи</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Включить</label>
            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={settings.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Авто-опрос после завершения приёма</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>Порог «хорошая оценка» (1–10)</label>
            <input type="number" min="1" max="10" value={settings.good_score_min}
              onChange={(e) => set('good_score_min', e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-500 mt-1">Оценка ≥ порога — отправляем ссылку на отзыв, иначе спрашиваем причину.</p>
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
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>
      </div>

      {/* Список фидбеков */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">📊 Фидбек от пациентов</h4>
        {feedbacks.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-500">
            Пока нет обратной связи
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-pink-100 dark:bg-pink-900/20">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Пациент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Врач</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Дата</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Оценка</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Причина</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Статус</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {feedbacks.map((f) => {
                  const meta = STATUS_META[f.status] || { label: f.status, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={f.id || f._id}>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">{f.patient_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">{f.doctor_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(f.created_at)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{f.score ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs break-words">{f.reason || '—'}</td>
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
