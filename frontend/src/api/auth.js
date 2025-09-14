import { apiClient, handleApiError } from './config';

// API для аутентификации
export const authApi = {
  // Вход в систему
  login: async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Регистрация
  register: async (email, password, fullName, role = 'patient') => {
    try {
      const response = await apiClient.post('/auth/register', {
        email,
        password,
        full_name: fullName,
        role
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Получить информацию о текущем пользователе
  getCurrentUser: async () => {
    try {
      const response = await apiClient.get('/auth/me');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Обновить профиль пользователя
  updateProfile: async (userData) => {
    try {
      const response = await apiClient.put('/auth/profile', userData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  // Сменить пароль
  changePassword: async (currentPassword, newPassword) => {
    try {
      const response = await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  }
};


