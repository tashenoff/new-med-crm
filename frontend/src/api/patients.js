import { apiClient, handleApiError } from './config';

// API для работы с пациентами
export const patientsApi = {
  // Получить всех пациентов
  getAll: async (search = '') => {
    try {
      const params = search ? { search } : {};
      const response = await apiClient.get('/patients', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить пациента по ID
  getById: async (id) => {
    try {
      const response = await apiClient.get(`/patients/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Создать нового пациента
  create: async (patientData) => {
    try {
      const response = await apiClient.post('/patients', patientData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Обновить пациента
  update: async (id, patientData) => {
    try {
      const response = await apiClient.put(`/patients/${id}`, patientData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Удалить пациента
  delete: async (id) => {
    try {
      await apiClient.delete(`/patients/${id}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить медицинские данные пациента (для CRM)
  getMedicalData: async (id) => {
    try {
      const response = await apiClient.get(`/patients/${id}/medical-data`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  }
};


