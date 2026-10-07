import { useCallback, useEffect, useRef, useState } from 'react';
import { configuredColumns, kanbanRequest } from '../utils/kanbanColumns';

export function useKanbanColumns(fetchLeads) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const generation = useRef(0);

  const loadColumns = useCallback(async () => {
    const request = ++generation.current;
    const data = await kanbanRequest();
    if (!Array.isArray(data)) throw new Error('Некорректный ответ API колонок');
    if (request === generation.current) setColumns(configuredColumns(data));
    return configuredColumns(data);
  }, []);

  const reload = useCallback(async () => {
    const request = generation.current + 1;
    setLoading(true);
    setError('');
    try {
      await loadColumns();
    } catch (failure) {
      if (request === generation.current) setError(failure.message);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [loadColumns]);

  useEffect(() => {
    reload();
    return () => { generation.current += 1; };
  }, [reload]);

  const run = async operation => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const mutate = (path, method, body) => run(async () => {
    await kanbanRequest(path, method, body);
    await Promise.all([loadColumns(), fetchLeads()]);
  });

  const remove = column => run(async () => {
    const current = (await loadColumns()).find(item => item.id === column.id);
    if (!current || current.is_system) throw new Error('Колонка больше недоступна. Обновите доску.');
    if (!window.confirm(`Удалить колонку «${current.name}»? Карточек: ${current.affected_count}. Все карточки вернутся в «Неразобранные».`)) return;
    const result = await kanbanRequest(`/kanban/columns/${encodeURIComponent(current.id)}`, 'DELETE');
    setNotice(`Колонка удалена. Карточек возвращено в «Неразобранные»: ${result.affected_count}.`);
    await Promise.all([loadColumns(), fetchLeads()]);
  });

  return { columns, loading, busy, error, notice, reload, mutate, remove };
}
