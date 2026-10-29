import axios from 'axios';
import { API_BASE_URL, configureSessionHandling } from './session';
export { API_BASE_URL } from './session';

// Создаем экземпляр axios с базовой конфигурацией
export const apiClient = configureSessionHandling(axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
}));

// Вспомогательные функции для обработки ошибок
export const handleApiError = (error) => {
  let errorMessage = 'Произошла ошибка';
  
  if (error.response?.data?.detail) {
    // Если detail - это массив ошибок валидации
    if (Array.isArray(error.response.data.detail)) {
      errorMessage = error.response.data.detail.map(err => 
        `${err.loc ? err.loc.join('.') + ': ' : ''}${err.msg}`
      ).join(', ');
    } else if (typeof error.response.data.detail === 'string') {
      errorMessage = error.response.data.detail;
    } else {
      errorMessage = JSON.stringify(error.response.data.detail);
    }
  } else if (error.message) {
    errorMessage = error.message;
  }
  
  return errorMessage;
};

// Утилиты для очистки данных
export const cleanAppointmentData = (appointmentData) => {
  const cleanData = { ...appointmentData };
  delete cleanData.chair_number; // Удалено поле chair_number
  
  // Конвертируем price в число если оно не пустое
  if (cleanData.price !== undefined && cleanData.price !== '') {
    cleanData.price = parseFloat(cleanData.price) || 0;
  } else {
    cleanData.price = 0;
  }
  
  return cleanData;
};

// Утилиты для работы с ID
export const getEntityId = (entity) => entity.id || entity._id;
export const compareIds = (id1, id2) => String(id1) === String(id2);
