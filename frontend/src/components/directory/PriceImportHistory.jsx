import React, { useEffect, useState } from 'react';
import { formatImportTime } from './priceImport';

export default function PriceImportHistory({ refreshKey = 0 }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/price-import/history`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('History unavailable');
        const data = await response.json();
        if (!controller.signal.aborted) setHistory(data);
      } catch (failure) {
        if (failure.name !== 'AbortError' && !controller.signal.aborted) setError(true);
      }
    };
    load();
    return () => controller.abort();
  }, [refreshKey]);

  if (error) return <p role="status" className="text-sm text-curai-negative">Не удалось загрузить историю импорта.</p>;
  if (!history) return <p className="text-sm text-curai-muted">История импорта загружается…</p>;
  const successful = history.last_successful_import;
  const latest = history.last_import;
  return <div className="text-sm text-curai-muted space-y-1" aria-live="polite">
    <p>Последний успешный импорт: {successful
      ? <time dateTime={successful.finished_at}>{formatImportTime(successful.finished_at)}</time>
      : 'данных пока нет'}.</p>
    {latest && latest.status !== 'success' && <p>
      Последняя попытка: {latest.status === 'partial' ? 'выполнена частично' : 'завершилась с ошибкой'} —{' '}
      <time dateTime={latest.finished_at}>{formatImportTime(latest.finished_at)}</time>.
    </p>}
  </div>;
}
