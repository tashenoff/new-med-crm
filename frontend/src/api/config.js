import axios from 'axios';

// Базовая конфигурация API
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const API_BASE_URL = `${BACKEND_URL}/api`;

// Создаем экземпляр axios с базовой конфигурацией
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для автоматического добавления токена авторизации
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ответов
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Автоматический логаут при 401 ошибке
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

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
export const getEntityId = (entity) => entity._id || entity.id;
export const compareIds = (id1, id2) => String(id1) === String(id2);
