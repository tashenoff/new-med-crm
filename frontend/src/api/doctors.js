import { apiClient, handleApiError } from './config';

// API для работы с врачами
export const doctorsApi = {
  // Получить всех врачей
  getAll: async () => {
    try {
      const response = await apiClient.get('/doctors');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить врача по ID
  getById: async (id) => {
    try {
      const response = await apiClient.get(`/doctors/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Создать нового врача
  create: async (doctorData) => {
    try {
      const response = await apiClient.post('/doctors', doctorData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Обновить врача
  update: async (id, doctorData) => {
    try {
      const response = await apiClient.put(`/doctors/${id}`, doctorData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Удалить врача (деактивировать)
  delete: async (id) => {
    try {
      await apiClient.delete(`/doctors/${id}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить доступных врачей для времени/кабинета
  getAvailable: async (roomId, date, time) => {
    try {
      const params = { room_id: roomId, date, time };
      const response = await apiClient.get('/doctors/available', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  }
};
