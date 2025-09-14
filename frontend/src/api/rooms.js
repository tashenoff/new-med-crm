import { apiClient, handleApiError } from './config';

// API для работы с кабинетами
export const roomsApi = {
  // Получить все кабинеты
  getAll: async () => {
    try {
      const response = await apiClient.get('/rooms');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить кабинеты с расписанием
  getAllWithSchedule: async () => {
    try {
      const response = await apiClient.get('/rooms-with-schedule');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить кабинет по ID
  getById: async (id) => {
    try {
      const response = await apiClient.get(`/rooms/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Создать новый кабинет
  create: async (roomData) => {
    try {
      const response = await apiClient.post('/rooms', roomData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Обновить кабинет
  update: async (id, roomData) => {
    try {
      const response = await apiClient.put(`/rooms/${id}`, roomData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Удалить кабинет
  delete: async (id) => {
    try {
      await apiClient.delete(`/rooms/${id}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Работа с расписанием кабинетов
  schedule: {
    // Получить расписание кабинета
    get: async (roomId) => {
      try {
        const response = await apiClient.get(`/rooms/${roomId}/schedule`);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    // Создать запись в расписании
    create: async (roomId, scheduleData) => {
      try {
        const response = await apiClient.post(`/rooms/${roomId}/schedule`, scheduleData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    // Обновить запись в расписании
    update: async (roomId, scheduleId, scheduleData) => {
      try {
        const response = await apiClient.put(`/rooms/${roomId}/schedule/${scheduleId}`, scheduleData);
        return { success: true, data: response.data };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    },

    // Удалить запись из расписания
    delete: async (roomId, scheduleId) => {
      try {
        await apiClient.delete(`/rooms/${roomId}/schedule/${scheduleId}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: handleApiError(error) };
      }
    }
  }
};


