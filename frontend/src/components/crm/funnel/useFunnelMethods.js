import { useEffect, useState } from 'react';
import { funnelRequest } from '../../../utils/eventFunnel';

export default function useFunnelMethods(source, batch, revision) {
  const sourceId = source.startsWith('source:') ? source.slice(7) : '';
  const key = JSON.stringify([sourceId, batch, revision]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!sourceId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ source_id: sourceId });
    if (batch) params.set('synthetic_batch', batch);
    funnelRequest(`methods?${params}`, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.source_id !== sourceId || !Array.isArray(data.methods)) throw new Error('Некорректный ответ справочника способов');
      setResult({ key, methods: data.methods });
    }).catch(failure => {
      if (!controller.signal.aborted) setResult({ key, error: failure.message, methods: [] });
    });
    return () => controller.abort();
  }, [sourceId, batch, key]);
  if (!sourceId) return { status: 'unselected', methods: [] };
  if (result?.key !== key) return { status: 'loading', methods: [] };
  return { ...result, status: result.error ? 'error' : 'ready' };
}
