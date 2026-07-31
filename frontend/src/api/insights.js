import { apiClient } from './config';

export const insightsApi = {
  fetchBadges: async () => {
    const response = await apiClient.get('/insights/badges');
    return response.data;
  }
};
