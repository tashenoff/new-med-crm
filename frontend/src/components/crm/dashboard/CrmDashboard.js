import React, { useState, useEffect } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import { useCrmApi } from '../../../hooks/useCrmApi';

const CrmDashboard = ({ user }) => {
  const [recentActivity, setRecentActivity] = useState([]);
  const [hmsRevenueStats, setHmsRevenueStats] = useState(null);
  const [loadingHmsRevenue, setLoadingHmsRevenue] = useState(false);
  
  const {
    leadsStats,
    clientsStats,
    dealsStats,
    managers,
    loading,
    error,
    isInitialized,
    fetchDashboardData
  } = useCrm();
  
  const crmApi = useCrmApi();

  // Функция для загрузки статистики выручки из HMS
  const fetchHmsRevenueStats = async () => {
    setLoadingHmsRevenue(true);
    try {
      const hmsStats = await crmApi.integration.getHmsRevenueStatistics();
      setHmsRevenueStats(hmsStats);
      console.log('✅ Получена статистика выручки из HMS:', hmsStats);
    } catch (error) {
      console.error('❌ Ошибка получения статистики HMS:', error);
    } finally {
      setLoadingHmsRevenue(false);
    }
  };

  // Преобразуем данные для отображения
  const stats = {
    leads: {
      total: leadsStats?.total_leads || 0,
      new: leadsStats?.new_leads || 0,
      inProgress: leadsStats?.in_progress_leads || 0,
      converted: leadsStats?.converted_leads || 0,
      conversionRate: leadsStats?.conversion_rate || 0
    },
    clients: {
      total: clientsStats?.total_clients || 0,
      active: clientsStats?.active_clients || 0,
      vip: clientsStats?.vip_clients || 0,
      // ✨ ИСПОЛЬЗУЕМ РЕАЛЬНУЮ ВЫРУЧКУ ИЗ HMS ВМЕСТО CRM
      totalRevenue: hmsRevenueStats?.total_revenue || clientsStats?.total_revenue || 0
    },
    deals: {
      total: dealsStats?.total_deals || 0,
      active: dealsStats?.active_deals || 0,
      won: dealsStats?.won_deals || 0,
      totalAmount: dealsStats?.total_amount || 0,
      wonAmount: dealsStats?.won_amount || 0,
      winRate: dealsStats?.win_rate || 0
    },
    managers: {
      total: managers.length,
      active: managers.filter(m => m.status === 'active').length
    }
  };

  // ✨ ЗАГРУЗКА СТАТИСТИКИ HMS ПРИ ИНИЦИАЛИЗАЦИИ
  useEffect(() => {
    if (isInitialized) {
      fetchHmsRevenueStats();
    }
  }, [isInitialized]);

  // Пока используем моковую активность (в будущем можно добавить API для активности)
  useEffect(() => {
    if (isInitialized && recentActivity.length === 0) {
      setRecentActivity([
        { 
          id: 1, 
          type: 'lead', 
          action: 'Новая заявка', 
          description: 'Поступила новая заявка на консультацию', 
          time: '2 мин назад'
        },
        { 
          id: 2, 
          type: 'deal', 
          action: 'Статистика сделок', 
          description: `${stats.deals.won} выиграно из ${stats.deals.total} сделок`, 
          time: '15 мин назад'
        },
        { 
          id: 3, 
          type: 'client', 
          action: 'Активные клиенты', 
          description: `${stats.clients.active} активных клиентов`, 
          time: '1 час назад'
        }
      ]);
    }
  }, [isInitialized]);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded">
          <p>Ошибка загрузки данных: {error}</p>
          <button 
            onClick={fetchDashboardData}
            className="mt-2 bg-curai-negative text-white px-4 py-2 rounded hover:bg-curai-negative"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-curai-ink">CRM Дашборд</h1>
          <p className="text-curai-muted">Обзор ключевых метрик и активности</p>
        </div>
        <div className="text-sm text-curai-muted">
          Обновлено: {new Date().toLocaleTimeString('ru-RU')}
        </div>
      </div>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Заявки */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-curai-muted">Заявки</p>
              <p className="text-2xl font-semibold text-curai-ink">
                {loading ? '...' : stats.leads.total}
              </p>
            </div>
            <div className="p-3 bg-curai-negativeBg rounded-full">
              <svg className="w-6 h-6 text-curai-negative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-curai-muted">Новые: {loading ? '...' : stats.leads.new}</span>
              <span className="text-curai-blue">В работе: {loading ? '...' : stats.leads.inProgress}</span>
            </div>
            <div className="text-sm text-curai-positive">
              Конверсия: {loading ? '...' : stats.leads.conversionRate}%
            </div>
          </div>
        </div>

        {/* Контакты */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-curai-muted">Контакты</p>
              <p className="text-2xl font-semibold text-curai-ink">
                {loading ? '...' : stats.clients.total}
              </p>
            </div>
            <div className="p-3 bg-curai-selected rounded-full">
              <svg className="w-6 h-6 text-curai-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-curai-muted">Активные: {loading ? '...' : stats.clients.active}</span>
              <span className="text-curai-blue">VIP: {loading ? '...' : stats.clients.vip}</span>
            </div>
            <div className="text-sm space-y-1">
              <div className="text-curai-positive font-medium">
                Выручка HMS: {loadingHmsRevenue ? '⏳' : Math.round(stats.clients.totalRevenue).toLocaleString()}₸
              </div>
              {hmsRevenueStats && (
                <div className="text-xs text-curai-muted">
                  Планов: {hmsRevenueStats.total_plans} • Собираемость: {hmsRevenueStats.collection_rate}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Сделки */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-curai-muted">Сделки</p>
              <p className="text-2xl font-semibold text-curai-ink">
                {loading ? '...' : stats.deals.total}
              </p>
            </div>
            <div className="p-3 bg-curai-positiveBg rounded-full">
              <svg className="w-6 h-6 text-curai-positive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-curai-muted">Открыто: {loading ? '...' : stats.deals.active}</span>
              <span className="text-curai-positive">Закрыто: {loading ? '...' : stats.deals.won}</span>
            </div>
            <div className="text-sm text-curai-positive">
              Процент закрытия: {loading ? '...' : stats.deals.winRate}%
            </div>
          </div>
        </div>

        {/* Оборот */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-curai-muted">Оборот</p>
              <p className="text-2xl font-semibold text-curai-ink">
                {loading ? '...' : `${Math.round(stats.deals.wonAmount / 1000)}K`}₸
              </p>
            </div>
            <div className="p-3 bg-curai-warningBg rounded-full">
              <svg className="w-6 h-6 text-curai-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-curai-muted">
              За текущий месяц
            </div>
            <div className="text-sm text-curai-positive">
              Потенциал: {loading ? '...' : Math.round(stats.deals.totalAmount / 1000)}K₸
            </div>
          </div>
        </div>
      </div>

      {/* Статистика по статусам */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Заявки по статусам */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <h3 className="text-lg font-medium text-curai-ink mb-4">Заявки по статусам</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-curai-blue">● Новые</span>
              <span className="font-medium">{loading ? '...' : stats.leads.new}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-curai-warning">● В работе</span>
              <span className="font-medium">{loading ? '...' : stats.leads.inProgress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-curai-positive">● Конвертированы</span>
              <span className="font-medium">{loading ? '...' : stats.leads.converted}</span>
            </div>
          </div>
        </div>

        {/* Быстрые действия */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <h3 className="text-lg font-medium text-curai-ink mb-4">Быстрые действия</h3>
          <div className="grid grid-cols-1 gap-3">
            <button className="flex items-center justify-center p-3 border-2 border-dashed border-curai-control rounded-md hover:border-curai-negative hover:bg-curai-negativeBg transition-colors">
              <svg className="w-5 h-5 text-curai-negative mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Создать заявку
            </button>
            <button className="flex items-center justify-center p-3 border-2 border-dashed border-curai-control rounded-md hover:border-curai-control hover:bg-curai-selected transition-colors">
              <svg className="w-5 h-5 text-curai-blue mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Добавить клиента
            </button>
            <button className="flex items-center justify-center p-3 border-2 border-dashed border-curai-control rounded-md hover:border-curai-positive hover:bg-curai-positiveBg transition-colors">
              <svg className="w-5 h-5 text-curai-positive mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Новая сделка
            </button>
          </div>
        </div>
      </div>

      {/* Последняя активность */}
      <div className="bg-curai-surface rounded-md shadow-none">
        <div className="p-6 border-b border-curai-border">
          <h3 className="text-lg font-medium text-curai-ink">Последняя активность</h3>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center space-x-3 animate-pulse">
                  <div className="w-8 h-8 bg-curai-border rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-curai-border rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-curai-border rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    activity.type === 'lead' ? "bg-curai-negativeBg" :
                    activity.type === 'client' ? "bg-curai-selected" :
                    activity.type === 'deal' ? "bg-curai-positiveBg" : "bg-curai-subtle"
                  }`}>
                    {activity.type === 'lead' ? '📝' :
                     activity.type === 'client' ? '👤' :
                     activity.type === 'deal' ? '💼' : '📊'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-curai-ink">{activity.action}</p>
                    <p className="text-sm text-curai-muted">{activity.description}</p>
                    <p className="text-xs text-curai-muted mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-curai-muted text-center py-4">Нет активности</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrmDashboard;