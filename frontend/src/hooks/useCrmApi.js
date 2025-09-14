/**
 * CRM API Hook - Хук для работы с CRM API
 */

import { useState, useCallback, useMemo } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://env-setup-12.preview.emergentagent.com';
const CRM_API = `${API_BASE}/api/crm`;

export const useCrmApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Получение токена из localStorage
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Обработка ошибок
  const handleError = useCallback((error) => {
    console.error('CRM API Error:', error);
    const message = error.response?.data?.detail || error.message || 'Произошла ошибка';
    setError(message);
    throw new Error(message);
  }, []);

  // Универсальный API вызов
  const apiCall = useCallback(async (method, url, data = null) => {
    setLoading(true);
    setError(null);
    
    try {
      const config = {
        method,
        url: `${CRM_API}${url}`,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, handleError]);

  // ==================== LEADS API ====================
  
  const leads = {
    // Получить список лидов
    getAll: useCallback(async (params = {}) => {
      const queryParams = new URLSearchParams();
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(key, v));
          } else {
            queryParams.append(key, value);
          }
        }
      });
      
      const queryString = queryParams.toString();
      const url = `/leads/${queryString ? `?${queryString}` : ''}`;
      
      return await apiCall('GET', url);
    }, [apiCall]),

    // Получить лида по ID
    getById: useCallback(async (id) => {
      return await apiCall('GET', `/leads/${id}`);
    }, [apiCall]),

    // Создать лида
    create: useCallback(async (leadData) => {
      return await apiCall('POST', '/leads/', leadData);
    }, [apiCall]),

    // Обновить лида
    update: useCallback(async (id, updateData) => {
      return await apiCall('PUT', `/leads/${id}`, updateData);
    }, [apiCall]),

    // Удалить лида
    delete: useCallback(async (id) => {
      return await apiCall('DELETE', `/leads/${id}`);
    }, [apiCall]),

    // Обновить статус лида
    updateStatus: useCallback(async (id, status, notes = null) => {
      return await apiCall('PATCH', `/leads/${id}/status`, { status, notes });
    }, [apiCall]),

    // Назначить менеджера
    assignManager: useCallback(async (id, managerId, notes = null) => {
      return await apiCall('PATCH', `/leads/${id}/assign`, { 
        manager_id: managerId, 
        notes 
      });
    }, [apiCall]),

    // Конвертировать в клиента
    convert: useCallback(async (id, conversionData) => {
      return await apiCall('POST', `/leads/${id}/convert`, conversionData);
    }, [apiCall]),

    // Получить статистику
    getStatistics: useCallback(async () => {
      return await apiCall('GET', '/leads/statistics/summary');
    }, [apiCall]),

    // Получить лидов менеджера
    getByManager: useCallback(async (managerId) => {
      return await apiCall('GET', `/leads/manager/${managerId}`);
    }, [apiCall]),
  };

  // ==================== CLIENTS API ====================
  
  const clients = {
    // Получить список клиентов
    getAll: useCallback(async (params = {}) => {
      const queryParams = new URLSearchParams(params);
      const url = `/clients/${queryParams.toString() ? `?${queryParams}` : ''}`;
      return await apiCall('GET', url);
    }, [apiCall]),

    // Получить клиента по ID
    getById: useCallback(async (id) => {
      return await apiCall('GET', `/clients/${id}`);
    }, [apiCall]),

    // Создать клиента
    create: useCallback(async (clientData) => {
      return await apiCall('POST', '/clients/', clientData);
    }, [apiCall]),

    // Обновить клиента
    update: useCallback(async (id, updateData) => {
      return await apiCall('PUT', `/clients/${id}`, updateData);
    }, [apiCall]),

    // Получить статистику
    getStatistics: useCallback(async () => {
      return await apiCall('GET', '/clients/statistics/summary');
    }, [apiCall]),

    // Получить детальную статистику
    getDetailedStatistics: useCallback(async () => {
      return await apiCall('GET', '/clients/statistics/detailed');
    }, [apiCall]),
  };

  // ==================== DEALS API ====================
  
  const deals = {
    // Получить список сделок
    getAll: useCallback(async (params = {}) => {
      const queryParams = new URLSearchParams(params);
      const url = `/deals/${queryParams.toString() ? `?${queryParams}` : ''}`;
      return await apiCall('GET', url);
    }, [apiCall]),

    // Получить сделку по ID
    getById: useCallback(async (id) => {
      return await apiCall('GET', `/deals/${id}`);
    }, [apiCall]),

    // Создать сделку
    create: useCallback(async (dealData) => {
      return await apiCall('POST', '/deals/', dealData);
    }, [apiCall]),

    // Обновить сделку
    update: useCallback(async (id, updateData) => {
      return await apiCall('PUT', `/deals/${id}`, updateData);
    }, [apiCall]),

    // Закрыть сделку как выигранную
    closeAsWon: useCallback(async (id, amount = null) => {
      const url = `/deals/${id}/close-won${amount ? `?amount=${amount}` : ''}`;
      return await apiCall('PATCH', url);
    }, [apiCall]),

    // Получить статистику
    getStatistics: useCallback(async () => {
      return await apiCall('GET', '/deals/statistics/summary');
    }, [apiCall]),
  };

  // ==================== MANAGERS API ====================
  
  const managers = {
    // Получить список менеджеров
    getAll: useCallback(async (params = {}) => {
      const queryParams = new URLSearchParams(params);
      const url = `/managers/${queryParams.toString() ? `?${queryParams}` : ''}`;
      return await apiCall('GET', url);
    }, [apiCall]),

    // Получить доступных менеджеров
    getAvailable: useCallback(async (specialization = null) => {
      const url = `/managers/available${specialization ? `?specialization=${specialization}` : ''}`;
      return await apiCall('GET', url);
    }, [apiCall]),

    // Получить менеджера по ID
    getById: useCallback(async (id) => {
      return await apiCall('GET', `/managers/${id}`);
    }, [apiCall]),

    // Создать менеджера
    create: useCallback(async (managerData) => {
      return await apiCall('POST', '/managers/', managerData);
    }, [apiCall]),

    // Обновить менеджера
    update: useCallback(async (id, updateData) => {
      return await apiCall('PUT', `/managers/${id}`, updateData);
    }, [apiCall]),
  };

  // ==================== SOURCES API ====================
  
  const sources = useMemo(() => ({
    // Получить список источников
    getAll: async (params = {}) => {
      const queryParams = new URLSearchParams(params);
      const url = `/sources/${queryParams.toString() ? `?${queryParams}` : ''}`;
      return await apiCall('GET', url);
    },

    // Получить источник по ID
    getById: async (id) => {
      return await apiCall('GET', `/sources/${id}`);
    },

    // Создать источник
    create: async (sourceData) => {
      return await apiCall('POST', '/sources/', sourceData);
    },

    // Обновить источник
    update: async (id, updateData) => {
      return await apiCall('PUT', `/sources/${id}`, updateData);
    },

    // Удалить источник
    delete: async (id) => {
      return await apiCall('DELETE', `/sources/${id}`);
    },

    // Получить статистику источников
    getStatistics: async () => {
      return await apiCall('GET', '/sources/statistics/summary');
    },

    // Обновить статистику всех источников
    updateStatistics: async () => {
      return await apiCall('POST', '/sources/update-statistics');
    },
  }), [apiCall]);

  // ==================== INTEGRATION API ====================
  
  const integration = {
    // Синхронизировать все оплаченные планы лечения
    syncAllTreatmentPlans: useCallback(async () => {
      return await apiCall('POST', '/integration/sync-all-treatment-plans');
    }, [apiCall]),

    // Получить выручку клиента из HMS
    getClientRevenueFromHMS: useCallback(async (clientId) => {
      return await apiCall('GET', `/integration/client-revenue/${clientId}`);
    }, [apiCall]),

    // Синхронизировать конкретный план лечения
    syncTreatmentPlan: useCallback(async (syncData) => {
      return await apiCall('POST', '/integration/sync-treatment-plan', syncData);
    }, [apiCall]),

    // Получить статистику выручки из HMS
    getHmsRevenueStatistics: useCallback(async () => {
      return await apiCall('GET', '/integration/hms-revenue-statistics');
    }, [apiCall]),

    // Получить статистику выручки по источникам
    getSourcesRevenueStatistics: useCallback(async () => {
      return await apiCall('GET', '/integration/sources-revenue-statistics');
    }, [apiCall]),

    // Получить последний прием клиента
    getClientLastAppointment: useCallback(async (clientId) => {
      return await apiCall('GET', `/integration/client-last-appointment/${clientId}`);
    }, [apiCall]),

  };

  // Очистить ошибку
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    clearError,
    leads,
    clients,
    deals,
    managers,
    sources,
    integration,
  };
};

