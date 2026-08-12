import { useState, useCallback, useEffect } from 'react';
import { useCrmApi } from './useCrmApi';

/**
 * Хук для автоматической синхронизации планов лечения между HMS и CRM
 */
export const useTreatmentPlanSync = () => {
  const [treatmentPlansData, setTreatmentPlansData] = useState({});
  const [syncingClients, setSyncingClients] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const crmApi = useCrmApi();

  // Получить информацию о планах лечения конкретного клиента
  const getClientTreatmentPlans = useCallback(async (clientId) => {
    // Если данные уже есть в кеше, возвращаем их
    if (treatmentPlansData[clientId]) {
      return treatmentPlansData[clientId];
    }

    // Если клиент уже синхронизируется, ожидаем завершения
    if (syncingClients.has(clientId)) {
      return null;
    }

    try {
      setSyncingClients(prev => new Set([...prev, clientId]));
      
      // Запрашиваем выручку клиента из HMS (это включает планы лечения)
      const revenueData = await crmApi.integration.getClientRevenueFromHMS(clientId);
      
      const planData = {
        totalAmount: revenueData.total_amount || 0,
        paidAmount: revenueData.paid_amount || 0,
        depositAmount: revenueData.deposit_amount || 0,  // Общая сумма депозитов
        depositInPlans: revenueData.deposit_in_plans || 0,  // Депозит применённый к планам
        depositFromAppointments: revenueData.deposit_from_appointments || 0,  // Депозит из записей
        depositBalance: revenueData.deposit_balance || 0,  // ✅ Остаток депозита
        pendingAmount: revenueData.pending_amount || 0,
        treatmentPlansCount: revenueData.treatment_plans_count || 0,
        plans: revenueData.plans || [],
        lastUpdate: new Date().toISOString()
      };

      // Сохраняем в кеш
      setTreatmentPlansData(prev => ({
        ...prev,
        [clientId]: planData
      }));

      return planData;
    } catch (error) {
      console.error(`Error fetching treatment plans for client ${clientId}:`, error);
      // Если клиент не найден в HMS, записываем пустые данные
      const emptyData = {
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        treatmentPlansCount: 0,
        plans: [],
        lastUpdate: new Date().toISOString()
      };
      
      setTreatmentPlansData(prev => ({
        ...prev,
        [clientId]: emptyData
      }));
      
      return emptyData;
    } finally {
      setSyncingClients(prev => {
        const newSet = new Set(prev);
        newSet.delete(clientId);
        return newSet;
      });
    }
  }, [crmApi.integration, treatmentPlansData, syncingClients]);

  // Массовая синхронизация планов лечения для списка клиентов
  const syncMultipleClients = useCallback(async (clients) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔄 Начинаем синхронизацию планов лечения для ${clients.length} клиентов`);
      
      // Фильтруем только HMS пациентов
      const hmsClients = clients.filter(client => client.is_hms_patient);
      
      if (hmsClients.length === 0) {
        console.log('ℹ️ Нет HMS пациентов для синхронизации');
        return;
      }

      console.log(`🔄 Синхронизируем ${hmsClients.length} HMS пациентов`);

      // Запускаем синхронизацию параллельно (но с ограничением)
      const batchSize = 5; // Ограничиваем количество одновременных запросов
      const results = {};

      for (let i = 0; i < hmsClients.length; i += batchSize) {
        const batch = hmsClients.slice(i, i + batchSize);
        const batchPromises = batch.map(async (client) => {
          try {
            const planData = await getClientTreatmentPlans(client.id);
            return { clientId: client.id, data: planData };
          } catch (error) {
            console.error(`Error syncing client ${client.id}:`, error);
            return { clientId: client.id, data: null };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(({ clientId, data }) => {
          if (data) {
            results[clientId] = data;
          }
        });

        // Небольшая пауза между батчами
        if (i + batchSize < hmsClients.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Синхронизация завершена для ${Object.keys(results).length} клиентов`);
      
    } catch (error) {
      console.error('Error during bulk sync:', error);
      setError('Ошибка при массовой синхронизации планов лечения');
    } finally {
      setLoading(false);
    }
  }, [getClientTreatmentPlans]);

  // Принудительная синхронизация всех планов лечения через HMS API
  const forceSyncAllTreatmentPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Запуск принудительной синхронизации всех планов лечения');
      const result = await crmApi.integration.syncAllTreatmentPlans();
      
      // Очищаем кеш, чтобы при следующем запросе получить свежие данные
      setTreatmentPlansData({});
      
      console.log('✅ Принудительная синхронизация завершена:', result);
      return result;
    } catch (error) {
      console.error('Error during force sync:', error);
      setError('Ошибка при принудительной синхронизации');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [crmApi.integration]);

  // Очистить кеш для конкретного клиента
  const clearClientCache = useCallback((clientId) => {
    setTreatmentPlansData(prev => {
      const newData = { ...prev };
      delete newData[clientId];
      return newData;
    });
  }, []);

  // Очистить весь кеш
  const clearAllCache = useCallback(() => {
    setTreatmentPlansData({});
  }, []);

  // Получить статистику по синхронизации
  const getSyncStats = useCallback(() => {
    const cachedClientsCount = Object.keys(treatmentPlansData).length;
    const syncingCount = syncingClients.size;
    
    return {
      cachedClientsCount,
      syncingCount,
      isLoading: loading || syncingCount > 0
    };
  }, [treatmentPlansData, syncingClients, loading]);

  return {
    // Данные
    treatmentPlansData,
    loading,
    error,
    
    // Функции
    getClientTreatmentPlans,
    syncMultipleClients,
    forceSyncAllTreatmentPlans,
    clearClientCache,
    clearAllCache,
    getSyncStats,
    
    // Статус
    syncingClients,
    isClientSyncing: (clientId) => syncingClients.has(clientId)
  };
};
