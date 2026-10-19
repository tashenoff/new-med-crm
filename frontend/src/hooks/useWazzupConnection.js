import { useEffect, useState } from 'react';
import { apiClient } from '../api/config';

// Sending without channel_id uses the first active channel in WazzupService.
// Match that existing contract; patient presence and chat status are unrelated.
export function wazzupConnectionStatus(channels) {
  if (!Array.isArray(channels)) return null;
  if (channels.some(channel => typeof channel?.status === 'string' && channel.status.toLowerCase() === 'active')) return 'online';
  if (!channels.length) return 'offline';
  if (channels.some(channel => typeof channel?.status !== 'string' || !channel.status || ['unknown', 'loading'].includes(channel.status.toLowerCase()))) return null;
  return 'offline';
}

export default function useWazzupConnection(isOpen) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    setStatus(null);
    if (!isOpen) return;
    let alive = true, pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const { data } = await apiClient.get('/wazzup/channels', { signal: controller.signal });
        if (alive) setStatus(wazzupConnectionStatus(data));
      } catch {
        if (alive) setStatus(null);
      } finally { pending = false; }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, [isOpen]);
  return status;
}
