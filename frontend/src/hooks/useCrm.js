/**
 * CRM Hook - Управление состоянием CRM данных
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCrmApi } from './useCrmApi';

export const useCrm = () => {
  // Состояния для данных
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [deals, setDeals] = useState([]);
  const [managers, setManagers] = useState([]);
  const [sources, setSources] = useState([]);
  
  // Состояния для статистики
  const [leadsStats, setLeadsStats] = useState(null);
  const [clientsStats, setClientsStats] = useState(null);
  const [clientsDetailedStats, setClientsDetailedStats] = useState(null);
  const [dealsStats, setDealsStats] = useState(null);
  const [sourcesStats, setSourcesStats] = useState(null);
  
  // Состояния UI
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  
  // Состояния загрузки
  const [dataLoading, setDataLoading] = useState({
    leads: false,
    clients: false,
    deals: false,
    managers: false,
    sources: false,
  });
  
  // Флаг инициализации
  const [isInitialized, setIsInitialized] = useState(false);

  // API хук
  const crmApi = useCrmApi();

  // ==================== LEADS ====================
  
  const fetchLeads = useCallback(async (filters = {}) => {
    setDataLoading(prev => ({ ...prev, leads: true }));
    try {
      const data = await crmApi.leads.getAll(filters);
      setLeads(data);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setDataLoading(prev => ({ ...prev, leads: false }));
    }
  }, [crmApi.leads]);

  const createLead = useCallback(async (leadData) => {
    try {
      const newLead = await crmApi.leads.create(leadData);
      setLeads(prev => [newLead, ...prev]);
      return newLead;
    } catch (error) {
      console.error('Error creating lead:', error);
      throw error;
    }
  }, [crmApi.leads]);

  const updateLead = useCallback(async (id, updateData) => {
    try {
      const updatedLead = await crmApi.leads.update(id, updateData);
      setLeads(prev => prev.map(lead => 
        lead.id === id ? updatedLead : lead
      ));
      if (selectedLead?.id === id) {
        setSelectedLead(updatedLead);
      }
      return updatedLead;
    } catch (error) {
      console.error('Error updating lead:', error);
      throw error;
    }
  }, [crmApi.leads, selectedLead]);

  const updateLeadStatus = useCallback(async (id, status, notes = null) => {
    try {
      const updatedLead = await crmApi.leads.updateStatus(id, status, notes);
      setLeads(prev => prev.map(lead => 
        lead.id === id ? updatedLead : lead
      ));
      if (selectedLead?.id === id) {
        setSelectedLead(updatedLead);
      }
      return updatedLead;
    } catch (error) {
      console.error('Error updating lead status:', error);
      throw error;
    }
  }, [crmApi.leads, selectedLead]);

  const convertLead = useCallback(async (id, conversionData) => {
    try {
      const result = await crmApi.leads.convert(id, conversionData);
      // Обновляем лида в списке
      await fetchLeads();
      // Обновляем клиентов если нужно
      if (result.client_id) {
        await fetchClients();
      }
      return result;
    } catch (error) {
      console.error('Error converting lead:', error);
      throw error;
    }
  }, [crmApi.leads, fetchLeads]);

  const deleteLead = useCallback(async (id) => {
    try {
      await crmApi.leads.delete(id);
      setLeads(prev => prev.filter(lead => lead.id !== id));
      if (selectedLead?.id === id) {
        setSelectedLead(null);
      }
    } catch (error) {
      console.error('Error deleting lead:', error);
      throw error;
    }
  }, [crmApi.leads, selectedLead]);

  const fetchLeadsStatistics = useCallback(async () => {
    try {
      const stats = await crmApi.leads.getStatistics();
      setLeadsStats(stats);
    } catch (error) {
      console.error('Error fetching leads statistics:', error);
    }
  }, [crmApi.leads]);

  // ==================== CLIENTS ====================
  
  const fetchClients = useCallback(async (filters = {}) => {
    setDataLoading(prev => ({ ...prev, clients: true }));
    try {
      const data = await crmApi.clients.getAll(filters);
      setClients(data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setDataLoading(prev => ({ ...prev, clients: false }));
    }
  }, [crmApi.clients]);

  const createClient = useCallback(async (clientData) => {
    try {
      const newClient = await crmApi.clients.create(clientData);
      setClients(prev => [newClient, ...prev]);
      return newClient;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  }, [crmApi.clients]);

  const updateClient = useCallback(async (id, updateData) => {
    try {
      const updatedClient = await crmApi.clients.update(id, updateData);
      setClients(prev => prev.map(client => 
        client.id === id ? updatedClient : client
      ));
      if (selectedClient?.id === id) {
        setSelectedClient(updatedClient);
      }
      return updatedClient;
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }, [crmApi.clients, selectedClient]);

  const fetchClientsStatistics = useCallback(async () => {
    try {
      const stats = await crmApi.clients.getStatistics();
      setClientsStats(stats);
    } catch (error) {
      console.error('Error fetching clients statistics:', error);
    }
  }, [crmApi.clients]);

  const fetchClientsDetailedStatistics = useCallback(async () => {
    try {
      const stats = await crmApi.clients.getDetailedStatistics();
      setClientsDetailedStats(stats);
    } catch (error) {
      console.error('Error fetching detailed clients statistics:', error);
    }
  }, [crmApi.clients]);

  // ==================== DEALS ====================
  
  const fetchDeals = useCallback(async (filters = {}) => {
    setDataLoading(prev => ({ ...prev, deals: true }));
    try {
      const data = await crmApi.deals.getAll(filters);
      setDeals(data);
    } catch (error) {
      console.error('Error fetching deals:', error);
    } finally {
      setDataLoading(prev => ({ ...prev, deals: false }));
    }
  }, [crmApi.deals]);

  const createDeal = useCallback(async (dealData) => {
    try {
      const newDeal = await crmApi.deals.create(dealData);
      setDeals(prev => [newDeal, ...prev]);
      return newDeal;
    } catch (error) {
      console.error('Error creating deal:', error);
      throw error;
    }
  }, [crmApi.deals]);

  const updateDeal = useCallback(async (id, updateData) => {
    try {
      const updatedDeal = await crmApi.deals.update(id, updateData);
      setDeals(prev => prev.map(deal => 
        deal.id === id ? updatedDeal : deal
      ));
      if (selectedDeal?.id === id) {
        setSelectedDeal(updatedDeal);
      }
      return updatedDeal;
    } catch (error) {
      console.error('Error updating deal:', error);
      throw error;
    }
  }, [crmApi.deals, selectedDeal]);

  const closeDealAsWon = useCallback(async (id, amount = null) => {
    try {
      const result = await crmApi.deals.closeAsWon(id, amount);
      setDeals(prev => prev.map(deal => 
        deal.id === id ? result.deal : deal
      ));
      if (selectedDeal?.id === id) {
        setSelectedDeal(result.deal);
      }
      return result;
    } catch (error) {
      console.error('Error closing deal:', error);
      throw error;
    }
  }, [crmApi.deals, selectedDeal]);

  const fetchDealsStatistics = useCallback(async () => {
    try {
      const stats = await crmApi.deals.getStatistics();
      setDealsStats(stats);
    } catch (error) {
      console.error('Error fetching deals statistics:', error);
    }
  }, [crmApi.deals]);

  // ==================== MANAGERS ====================
  
  const fetchManagers = useCallback(async (filters = {}) => {
    setDataLoading(prev => ({ ...prev, managers: true }));
    try {
      const data = await crmApi.managers.getAll(filters);
      setManagers(data);
    } catch (error) {
      console.error('Error fetching managers:', error);
    } finally {
      setDataLoading(prev => ({ ...prev, managers: false }));
    }
  }, [crmApi.managers]);

  const fetchAvailableManagers = useCallback(async (specialization = null) => {
    try {
      return await crmApi.managers.getAvailable(specialization);
    } catch (error) {
      console.error('Error fetching available managers:', error);
      return [];
    }
  }, [crmApi.managers]);

  // ==================== SOURCES ====================
  
  const fetchSources = useCallback(async (filters = {}) => {
    setDataLoading(prev => ({ ...prev, sources: true }));
    try {
      const data = await crmApi.sources.getAll(filters);
      setSources(data);
    } catch (error) {
      console.error('Error fetching sources:', error);
    } finally {
      setDataLoading(prev => ({ ...prev, sources: false }));
    }
  }, [crmApi.sources]);

  const createSource = useCallback(async (sourceData) => {
    try {
      const newSource = await crmApi.sources.create(sourceData);
      setSources(prev => [newSource, ...prev]);
      return newSource;
    } catch (error) {
      console.error('Error creating source:', error);
      throw error;
    }
  }, [crmApi.sources]);

  const updateSource = useCallback(async (id, updateData) => {
    try {
      const updatedSource = await crmApi.sources.update(id, updateData);
      setSources(prev => prev.map(source => 
        source.id === id ? updatedSource : source
      ));
      if (selectedSource && selectedSource.id === id) {
        setSelectedSource(updatedSource);
      }
      return updatedSource;
    } catch (error) {
      console.error('Error updating source:', error);
      throw error;
    }
  }, [crmApi.sources, selectedSource]);

  const deleteSource = useCallback(async (id) => {
    try {
      await crmApi.sources.delete(id);
      setSources(prev => prev.filter(source => source.id !== id));
      if (selectedSource && selectedSource.id === id) {
        setSelectedSource(null);
      }
    } catch (error) {
      console.error('Error deleting source:', error);
      throw error;
    }
  }, [crmApi.sources, selectedSource]);

  const fetchSourcesStatistics = useCallback(async () => {
    try {
      const stats = await crmApi.sources.getStatistics();
      setSourcesStats(stats);
    } catch (error) {
      console.error('Error fetching sources statistics:', error);
    }
  }, [crmApi.sources]);

  // ==================== DASHBOARD DATA ====================
  
  const fetchDashboardData = useCallback(async () => {
    try {
      await Promise.all([
        fetchLeadsStatistics(),
        fetchClientsStatistics(),
        fetchDealsStatistics(),
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [fetchLeadsStatistics, fetchClientsStatistics, fetchDealsStatistics]);

  // ==================== INITIALIZATION ====================
  
  useEffect(() => {
    let mounted = true;
    
    const initializeData = async () => {
      try {
        // Используем crmApi напрямую вместо функций из useCallback
        const [leadsData, clientsData, dealsData, managersData, sourcesData] = await Promise.all([
          crmApi.leads.getAll(),
          crmApi.clients.getAll(),
          crmApi.deals.getAll(),
          crmApi.managers.getAll(),
          crmApi.sources.getAll()
        ]);

        if (!mounted) return;

        setLeads(leadsData);
        setClients(clientsData);
        setDeals(dealsData);
        setManagers(managersData);
        setSources(sourcesData);

        // Загружаем статистику
        const [leadsStatsData, clientsStatsData, clientsDetailedStatsData, dealsStatsData, sourcesStatsData] = await Promise.all([
          crmApi.leads.getStatistics(),
          crmApi.clients.getStatistics ? crmApi.clients.getStatistics() : Promise.resolve(null),
          crmApi.clients.getDetailedStatistics ? crmApi.clients.getDetailedStatistics() : Promise.resolve(null),
          crmApi.deals.getStatistics ? crmApi.deals.getStatistics() : Promise.resolve(null),
          crmApi.sources.getStatistics ? crmApi.sources.getStatistics() : Promise.resolve(null)
        ]);

        if (!mounted) return;

        setLeadsStats(leadsStatsData);
        setClientsStats(clientsStatsData);
        setClientsDetailedStats(clientsDetailedStatsData);
        setDealsStats(dealsStatsData);
        setSourcesStats(sourcesStatsData);
        setIsInitialized(true);

      } catch (error) {
        console.error('Error initializing CRM data:', error);
        if (mounted) {
          setIsInitialized(true);
        }
      }
    };
    
    if (!isInitialized) {
      initializeData();
    }
    
    return () => {
      mounted = false;
    };
  }, []); // Убираем все зависимости

  return {
    // Данные
    leads,
    clients,
    deals,
    managers,
    sources,
    
    // Статистика
    leadsStats,
    clientsStats,
    clientsDetailedStats,
    dealsStats,
    sourcesStats,
    
    // Выбранные элементы
    selectedLead,
    selectedClient,
    selectedDeal,
    selectedSource,
    setSelectedLead,
    setSelectedClient,
    setSelectedDeal,
    setSelectedSource,
    
    // Состояния загрузки
    dataLoading,
    loading: crmApi.loading,
    isInitialized,
    error: crmApi.error,
    clearError: crmApi.clearError,
    
    // Методы для лидов
    fetchLeads,
    createLead,
    updateLead,
    updateLeadStatus,
    convertLead,
    deleteLead,
    fetchLeadsStatistics,
    
    // Методы для клиентов
    fetchClients,
    createClient,
    updateClient,
    fetchClientsStatistics,
    fetchClientsDetailedStatistics,
    
    // Методы для сделок
    fetchDeals,
    createDeal,
    updateDeal,
    closeDealAsWon,
    fetchDealsStatistics,
    
    // Методы для менеджеров
    fetchManagers,
    fetchAvailableManagers,
    
    // Методы для источников
    fetchSources,
    createSource,
    updateSource,
    deleteSource,
    fetchSourcesStatistics,
    
    // Дашборд
    fetchDashboardData,
  };
};

