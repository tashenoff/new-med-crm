import { apiClient, handleApiError, cleanAppointmentData } from './config';
import { appointmentPayment, ledgerCommands } from '../utils/accountingLedger';

// API для работы с записями
export const appointmentsApi = {
  // Получить все записи
  getAll: async () => {
    try {
      const response = await apiClient.get('/appointments');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить запись по ID
  getById: async (id) => {
    try {
      const response = await apiClient.get(`/appointments/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Создать новую запись
  create: async (appointmentData) => {
    try {
      console.log('🚀 Исходные данные записи:', appointmentData);
      const cleanData = cleanAppointmentData(appointmentPayment(appointmentData));
      console.log('✨ Очищенные данные записи:', cleanData);
      const response = cleanData.status === 'completed'
        ? await ledgerCommands.run('appointment:create', cleanData, body => apiClient.post('/appointments', body))
        : await apiClient.post('/appointments', cleanData);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Ошибка создания записи:', error);
      return { success: false, error: handleApiError(error) };
    }
  },

  // Обновить запись
  update: async (id, appointmentData) => {
    try {
      const cleanData = cleanAppointmentData(appointmentPayment(appointmentData));
      const response = cleanData.status === 'completed'
        ? await ledgerCommands.run(`appointment:update:${id}`, cleanData, body => apiClient.put(`/appointments/${id}`, body))
        : await apiClient.put(`/appointments/${id}`, cleanData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Удалить запись
  delete: async (id) => {
    try {
      await apiClient.delete(`/appointments/${id}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Обновить статус записи
  updateStatus: async (id, status) => {
    try {
      const response = status === 'completed'
        ? await ledgerCommands.run(`appointment:status:${id}`, { status }, body => apiClient.patch(`/appointments/${id}/status`, body))
        : await apiClient.patch(`/appointments/${id}/status`, { status });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Переместить запись (специальный метод для drag & drop)
  move: async (id, moveData) => {
    try {
      const response = await apiClient.put(`/appointments/${id}`, moveData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  }
};
