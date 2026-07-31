import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { useGlobalRefresh } from './useGlobalRefresh';
import { insightsApi } from '../api/insights';

export const useInsightsBadges = () => {
  const { user } = useAuth();
  const { refreshTriggers } = useGlobalRefresh();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBadges = useCallback(async () => {
    if (!user) {
      setBadges([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await insightsApi.fetchBadges();
      setBadges(payload.badges || []);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Не удалось загрузить сигналы';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const insightsTick = refreshTriggers?.insights ?? 0;

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges, insightsTick]);

  return {
    badges,
    loading,
    error,
    refresh: fetchBadges
  };
};

export default useInsightsBadges;
