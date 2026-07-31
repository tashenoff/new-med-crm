import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, DollarSign, Target, Calendar,
  Activity, Phone, Mail, UserPlus, Award, Clock, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { useCrm } from '../../../hooks/useCrm';
import { useCrmApi } from '../../../hooks/useCrmApi';
import { useTheme, themeClasses, cn } from '../../../hooks/useTheme';
import PanelHeader from '../../common/PanelHeader';

const EnhancedCrmDashboard = ({ user }) => {
  const [recentActivity, setRecentActivity] = useState([]);
  const [hmsRevenueStats, setHmsRevenueStats] = useState(null);
  const [loadingHmsRevenue, setLoadingHmsRevenue] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  
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
  const { isDarkMode, theme } = useTheme();

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

  // Цвета для графиков в зависимости от темы
  const chartColors = {
    primary: isDarkMode ? '#60A5FA' : '#3B82F6',
    secondary: isDarkMode ? '#FCD34D' : '#F59E0B',
    success: isDarkMode ? '#34D399' : '#10B981',
    purple: isDarkMode ? '#A78BFA' : '#8B5CF6',
    gray: isDarkMode ? '#6B7280' : '#9CA3AF',
    grid: isDarkMode ? '#374151' : '#E5E7EB',
    text: isDarkMode ? '#F3F4F6' : '#374151'
  };

  // Данные для графиков
  const revenueData = [
    { month: 'Янв', revenue: 45000, target: 50000 },
    { month: 'Фев', revenue: 52000, target: 50000 },
    { month: 'Мар', revenue: 48000, target: 55000 },
    { month: 'Апр', revenue: 61000, target: 55000 },
    { month: 'Май', revenue: 55000, target: 60000 },
    { month: 'Июн', revenue: 67000, target: 60000 },
    { month: 'Июл', revenue: 71000, target: 65000 },
    { month: 'Авг', revenue: 64000, target: 65000 },
    { month: 'Сен', revenue: 78000, target: 70000 },
    { month: 'Окт', revenue: Math.round(stats.clients.totalRevenue), target: 75000 },
  ];

  const leadsData = [
    { name: 'Новые', value: stats.leads.new, color: chartColors.primary },
    { name: 'В работе', value: stats.leads.inProgress, color: chartColors.secondary },
    { name: 'Конвертированы', value: stats.leads.converted, color: chartColors.success },
  ];

  const conversionData = [
    { stage: 'Лиды', count: stats.leads.total, rate: 100 },
    { stage: 'Контакты', count: Math.round(stats.leads.total * 0.7), rate: 70 },
    { stage: 'Встречи', count: Math.round(stats.leads.total * 0.4), rate: 40 },
    { stage: 'Предложения', count: Math.round(stats.leads.total * 0.25), rate: 25 },
    { stage: 'Сделки', count: stats.leads.converted, rate: stats.leads.conversionRate },
  ];

  const topManagersData = managers.slice(0, 5).map((manager, index) => ({
    name: manager.full_name || `Менеджер ${index + 1}`,
    deals: Math.floor(Math.random() * 20) + 5,
    revenue: Math.floor(Math.random() * 100000) + 50000,
    conversion: Math.floor(Math.random() * 30) + 15
  }));

  // ✨ ЗАГРУЗКА СТАТИСТИКИ HMS ПРИ ИНИЦИАЛИЗАЦИИ
  useEffect(() => {
    if (isInitialized) {
      fetchHmsRevenueStats();
    }
  }, [isInitialized]);

  // Моковая активность
  useEffect(() => {
    if (isInitialized && recentActivity.length === 0) {
      setRecentActivity([
        { 
          id: 1, 
          type: 'lead', 
          action: 'Новая заявка от Анны Смирновой', 
          description: 'Консультация по имплантации', 
          time: '2 мин назад',
          amount: 45000
        },
        { 
          id: 2, 
          type: 'deal', 
          action: 'Сделка закрыта', 
          description: 'План лечения для Ивана Петрова', 
          time: '15 мин назад',
          amount: 85000
        },
        { 
          id: 3, 
          type: 'client', 
          action: 'Новый VIP клиент', 
          description: 'Екатерина Козлова', 
          time: '1 час назад',
          amount: 120000
        },
        { 
          id: 4, 
          type: 'meeting', 
          action: 'Встреча запланирована', 
          description: 'Консультация в 15:00', 
          time: '2 часа назад',
          amount: null
        }
      ]);
    }
  }, [isInitialized]);

  const MetricCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, color, loading }) => (
    <div className={cn(themeClasses.bg.card, themeClasses.border.default, themeClasses.shadow.default, "rounded-xl p-6 hover:shadow-md transition-shadow")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className={cn("text-sm font-medium", themeClasses.text.secondary)}>{title}</p>
            <p className={cn("text-2xl font-bold", themeClasses.text.primary)}>
              {loading ? '⏳' : value}
            </p>
          </div>
        </div>
        {trend && (
          <div className={`flex items-center space-x-1 ${trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            <span className="text-sm font-medium">{trendValue}%</span>
          </div>
        )}
      </div>
      {subtitle && (
        <p className={cn("text-sm mt-2", themeClasses.text.muted)}>{subtitle}</p>
      )}
    </div>
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p>Ошибка загрузки данных: {error}</p>
          <button 
            onClick={fetchDashboardData}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl ${themeClasses.shadow.default}`}>
        <PanelHeader
          title="CRM Аналитика"
          subtitle="Детальный обзор ключевых метрик и активности"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Фильтры */}
          <div className="flex items-center justify-end space-x-4">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className={cn("rounded-lg px-3 py-2 text-sm", themeClasses.input.default, themeClasses.input.focus)}
            >
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="quarter">Квартал</option>
              <option value="year">Год</option>
            </select>
            <div className={cn("text-sm", themeClasses.text.muted)}>
              Обновлено: {new Date().toLocaleTimeString('ru-RU')}
            </div>
          </div>

          {/* Основные метрики */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Заявки"
              value={stats.leads.total}
              subtitle={`Конверсия: ${stats.leads.conversionRate}%`}
              icon={Target}
              trend="up"
              trendValue="12"
              color="bg-blue-500"
              loading={loading}
            />
            <MetricCard
              title="Клиенты"
              value={stats.clients.total}
              subtitle={`Активных: ${stats.clients.active}`}
              icon={Users}
              trend="up"
              trendValue="8"
              color="bg-green-500"
              loading={loading}
            />
            <MetricCard
              title="Выручка"
              value={`${Math.round(stats.clients.totalRevenue / 1000)}K₸`}
              subtitle={loadingHmsRevenue ? 'Загрузка...' : `Планов: ${hmsRevenueStats?.total_plans || 0}`}
              icon={DollarSign}
              trend="up"
              trendValue="15"
              color="bg-emerald-500"
              loading={loadingHmsRevenue}
            />
            <MetricCard
              title="Сделки"
              value={stats.deals.total}
              subtitle={`Закрыто: ${stats.deals.won} (${stats.deals.winRate}%)`}
              icon={Award}
              trend="down"
              trendValue="3"
              color="bg-purple-500"
              loading={loading}
            />
          </div>

          {/* Графики */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* График выручки */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Динамика выручки</h3>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Факт</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                    <span>План</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${value.toLocaleString()}₸`, '']} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.2}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#9CA3AF"
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Распределение заявок */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Распределение заявок</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={leadsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {leadsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Воронка конверсии и топ менеджеры */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Воронка конверсии */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Воронка конверсии</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={conversionData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="stage" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Топ менеджеры */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Топ менеджеры</h3>
              <div className="space-y-4">
                {topManagersData.map((manager, index) => (
                  <div key={manager.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{manager.name}</p>
                        <p className="text-sm text-gray-500">{manager.deals} сделок</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{manager.revenue.toLocaleString()}₸</p>
                      <p className="text-xs text-green-600">{manager.conversion}% конверсия</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Последняя активность */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Последняя активность</h3>
                <Activity className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center space-x-4 animate-pulse">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center space-x-4 p-4 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        activity.type === 'lead' ? 'bg-blue-100 text-blue-600' :
                        activity.type === 'client' ? 'bg-green-100 text-green-600' :
                        activity.type === 'deal' ? 'bg-purple-100 text-purple-600' :
                        'bg-yellow-100 text-yellow-600'
                      }`}>
                        {activity.type === 'lead' ? <Target className="w-6 h-6" /> :
                         activity.type === 'client' ? <Users className="w-6 h-6" /> :
                         activity.type === 'deal' ? <DollarSign className="w-6 h-6" /> :
                         <Calendar className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                        <p className="text-sm text-gray-500">{activity.description}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-400">{activity.time}</p>
                        </div>
                      </div>
                      {activity.amount && (
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">{activity.amount.toLocaleString()}₸</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Нет активности</p>
                </div>
              )}
            </div>
          </div>

          {/* Быстрые действия */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Быстрые действия</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button className="flex items-center justify-center p-4 border-2 border-dashed border-blue-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group">
                <Target className="w-6 h-6 text-blue-500 mr-3 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-blue-700">Создать заявку</span>
              </button>
              <button className="flex items-center justify-center p-4 border-2 border-dashed border-green-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all group">
                <UserPlus className="w-6 h-6 text-green-500 mr-3 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-green-700">Добавить клиента</span>
              </button>
              <button className="flex items-center justify-center p-4 border-2 border-dashed border-purple-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all group">
                <DollarSign className="w-6 h-6 text-purple-500 mr-3 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-purple-700">Новая сделка</span>
              </button>
              <button className="flex items-center justify-center p-4 border-2 border-dashed border-yellow-300 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-all group">
                <Calendar className="w-6 h-6 text-yellow-500 mr-3 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-yellow-700">Запланировать встречу</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedCrmDashboard;
