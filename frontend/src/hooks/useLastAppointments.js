import { useState, useCallback } from 'react';
import { useCrmApi } from './useCrmApi';

/**
 * Хук для получения информации о последних приемах клиентов
 */
export const useLastAppointments = () => {
  const [appointmentsData, setAppointmentsData] = useState({});
  const [loadingAppointments, setLoadingAppointments] = useState(new Set());
  
  const crmApi = useCrmApi();

  // Получить информацию о последнем приеме конкретного клиента
  const getClientLastAppointment = useCallback(async (clientId) => {
    // Если данные уже есть в кеше, возвращаем их
    if (appointmentsData[clientId] !== undefined) {
      return appointmentsData[clientId];
    }

    // Если клиент уже загружается, ожидаем завершения
    if (loadingAppointments.has(clientId)) {
      return null;
    }

    try {
      setLoadingAppointments(prev => new Set([...prev, clientId]));
      
      const appointmentInfo = await crmApi.integration.getClientLastAppointment(clientId);
      
      setAppointmentsData(prev => ({
        ...prev,
        [clientId]: appointmentInfo.last_appointment
      }));
      
      return appointmentInfo.last_appointment;
      
    } catch (error) {
      console.error(`❌ Ошибка получения последнего приема для клиента ${clientId}:`, error);
      // Сохраняем null в кеш, чтобы избежать повторных запросов
      setAppointmentsData(prev => ({
        ...prev,
        [clientId]: null
      }));
      return null;
    } finally {
      setLoadingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(clientId);
        return newSet;
      });
    }
  }, [appointmentsData, loadingAppointments, crmApi.integration]);

  // Загрузить информацию о приемах для множества клиентов
  const loadMultipleAppointments = useCallback(async (clients) => {
    const clientsToLoad = clients.filter(client => 
      client.is_hms_patient && 
      appointmentsData[client.id] === undefined && 
      !loadingAppointments.has(client.id)
    );
    
    // Загружаем приемы для HMS клиентов
    
    if (clientsToLoad.length > 0) {
      const promises = clientsToLoad.map(client => getClientLastAppointment(client.id));
      await Promise.allSettled(promises);
    }
  }, [appointmentsData, loadingAppointments, getClientLastAppointment]);

  // Проверить, загружается ли прием для конкретного клиента
  const isClientAppointmentLoading = useCallback((clientId) => {
    return loadingAppointments.has(clientId);
  }, [loadingAppointments]);

  // Получить данные приема из кеша
  const getCachedAppointment = useCallback((clientId) => {
    return appointmentsData[clientId] || null;
  }, [appointmentsData]);

  return {
    appointmentsData,
    getClientLastAppointment,
    loadMultipleAppointments,
    isClientAppointmentLoading,
    getCachedAppointment
  };
};
