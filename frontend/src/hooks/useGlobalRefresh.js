import React, { createContext, useContext, useState, useCallback } from 'react';

// Контекст для глобального обновления данных между HMS и CRM
const GlobalRefreshContext = createContext();

export const GlobalRefreshProvider = ({ children }) => {
  const [refreshTriggers, setRefreshTriggers] = useState({
    patients: 0,
    appointments: 0,
    doctors: 0,
    crmClients: 0,
    crmLeads: 0,
    crmDeals: 0,
    treatmentPlans: 0, // Добавляем триггер для планов лечения
    insights: 0
  });

  // Функции для запуска обновления различных сущностей
  const triggerRefresh = useCallback((entity) => {
    console.log(`🔄 Запуск глобального обновления для: ${entity}`);
    setRefreshTriggers(prev => ({
      ...prev,
      [entity]: prev[entity] + 1
    }));
  }, []);

  // Специальные функции для удобства
  const refreshPatients = useCallback(() => triggerRefresh('patients'), [triggerRefresh]);
  const refreshAppointments = useCallback(() => triggerRefresh('appointments'), [triggerRefresh]);
  const refreshDoctors = useCallback(() => triggerRefresh('doctors'), [triggerRefresh]);
  const refreshCrmClients = useCallback(() => triggerRefresh('crmClients'), [triggerRefresh]);
  const refreshCrmLeads = useCallback(() => triggerRefresh('crmLeads'), [triggerRefresh]);
  const refreshCrmDeals = useCallback(() => triggerRefresh('crmDeals'), [triggerRefresh]);
  const refreshTreatmentPlans = useCallback(() => triggerRefresh('treatmentPlans'), [triggerRefresh]);
  const refreshInsights = useCallback(() => triggerRefresh('insights'), [triggerRefresh]);

  // Функция для обновления всех данных HMS (пациенты, записи, врачи)
  const refreshAllHMS = useCallback(() => {
    console.log('🔄 Запуск полного обновления HMS');
    setRefreshTriggers(prev => ({
      ...prev,
      patients: prev.patients + 1,
      appointments: prev.appointments + 1,
      doctors: prev.doctors + 1,
      insights: prev.insights + 1
    }));
  }, []);

  // Функция для обновления всех данных CRM
  const refreshAllCRM = useCallback(() => {
    console.log('🔄 Запуск полного обновления CRM');
    setRefreshTriggers(prev => ({
      ...prev,
      crmClients: prev.crmClients + 1,
      crmLeads: prev.crmLeads + 1,
      crmDeals: prev.crmDeals + 1,
      insights: prev.insights + 1
    }));
  }, []);

  const value = {
    refreshTriggers,
    triggerRefresh,
    refreshPatients,
    refreshAppointments,
    refreshDoctors,
    refreshCrmClients,
    refreshCrmLeads,
    refreshCrmDeals,
    refreshTreatmentPlans,
    refreshInsights,
    refreshAllHMS,
    refreshAllCRM
  };

  return (
    <GlobalRefreshContext.Provider value={value}>
      {children}
    </GlobalRefreshContext.Provider>
  );
};

export const useGlobalRefresh = () => {
  const context = useContext(GlobalRefreshContext);
  if (!context) {
    throw new Error('useGlobalRefresh must be used within a GlobalRefreshProvider');
  }
  return context;
};
