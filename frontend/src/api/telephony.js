import { apiClient, handleApiError } from './config';

export const telephonyApi = {
  /**
   * Инициировать click-to-call звонок.
   * @param {string} phone
   * @param {string} [sip='100']
   */
  startCallback: async (phone, sip = '100') => {
    const { data } = await apiClient.post('/telephony/callbacks', { phone, sip });
    return data;
  },

  /**
   * История звонков с фильтрацией.
   * @param {Object} params
   * @param {string} [params.phone]
   * @param {string} [params.user_id]
   * @param {number} [params.limit=50]
   * @param {number} [params.offset=0]
   */
  getCalls: async ({ phone, user_id, limit = 50, offset = 0 } = {}) => {
    const { data } = await apiClient.get('/telephony/calls', {
      params: {
        phone: phone || undefined,
        user_id: user_id || undefined,
        limit,
        offset,
      },
    });
    return data;
  },

  /**
   * История звонков по конкретному номеру телефона.
   * @param {string} phone
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   */
  getCallsByPhone: async (phone, { limit = 50 } = {}) => {
      const { data } = await apiClient.get(`/telephony/calls/${encodeURIComponent(phone)}`, {
        params: { limit },
      });
      return data;
    },

  healthCheck: async () => {
    const { data } = await apiClient.get('/telephony/health');
    return data;
  },
};

export { handleApiError };

