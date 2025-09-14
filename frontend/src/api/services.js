import { apiClient, handleApiError } from './config';

// API для работы с услугами и справочниками
export const servicesApi = {
  // Цены на услуги
  prices: {
    getAll: async () => {
      try {
        const response = await apiClient.get('/service-prices');
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    create: async (priceData) => {
      try {
        const response = await apiClient.post('/service-prices', priceData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    update: async (id, priceData) => {
      try {
        const response = await apiClient.put(`/service-prices/${id}`, priceData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    delete: async (id) => {
      try {
        await apiClient.delete(`/service-prices/${id}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    }
  },

  // Специальности
  specialties: {
    getAll: async () => {
      try {
        const response = await apiClient.get('/specialties');
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    create: async (specialtyData) => {
      try {
        const response = await apiClient.post('/specialties', specialtyData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    update: async (id, specialtyData) => {
      try {
        const response = await apiClient.put(`/specialties/${id}`, specialtyData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    delete: async (id) => {
      try {
        await apiClient.delete(`/specialties/${id}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    }
  },

  // Типы оплаты
  paymentTypes: {
    getAll: async () => {
      try {
        const response = await apiClient.get('/payment-types');
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    create: async (paymentTypeData) => {
      try {
        const response = await apiClient.post('/payment-types', paymentTypeData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    update: async (id, paymentTypeData) => {
      try {
        const response = await apiClient.put(`/payment-types/${id}`, paymentTypeData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    delete: async (id) => {
      try {
        await apiClient.delete(`/payment-types/${id}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    }
  }
};


