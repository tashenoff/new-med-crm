import React, { useState, useEffect } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import { useCrmApi } from '../../../hooks/useCrmApi';

const ContactsView = ({ user }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sourcesRevenue, setSourcesRevenue] = useState(null);
  const [loadingRevenue, setLoadingRevenue] = useState(false);
  const [newSource, setNewSource] = useState({
    name: '',
    type: 'website',
    description: '',
    url: '',
    cost_per_lead: 0,
    monthly_budget: ''
  });

  const {
    sources,
    sourcesStats,
    loading,
    error,
    isInitialized,
    fetchSources,
    createSource,
    updateSource,
    deleteSource,
    clearError
  } = useCrm();
  
  const crmApi = useCrmApi();

  // Функция для загрузки статистики выручки источников
  const fetchSourcesRevenue = async () => {
    setLoadingRevenue(true);
    try {
      const revenueData = await crmApi.integration.getSourcesRevenueStatistics();
      setSourcesRevenue(revenueData);
      console.log('✅ Получена статистика выручки источников:', revenueData);
    } catch (error) {
      console.error('❌ Ошибка получения статистики выручки:', error);
    } finally {
      setLoadingRevenue(false);
    }
  };

  useEffect(() => {
    if (isInitialized) {
      fetchSourcesRevenue();
    }
  }, [isInitialized]);

  // Отдельный useEffect для fetchSources который вызывается только один раз
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleCreateSource = async () => {
    try {
      const sourceData = {
        ...newSource,
        monthly_budget: newSource.monthly_budget ? parseFloat(newSource.monthly_budget) : null
      };
      await createSource(sourceData);
      setShowCreateModal(false);
      setNewSource({
        name: '',
        type: 'website',
        description: '',
        url: '',
        cost_per_lead: 0,
        monthly_budget: ''
      });
      // Обновляем статистику выручки после создания
      fetchSourcesRevenue();
      // Обновляем статистику источников
      await updateSourcesStatistics();
      alert('Источник успешно создан!');
    } catch (error) {
      console.error('Error creating source:', error);
      alert('Ошибка при создании источника: ' + (error.message || error));
    }
  };

  const sourceTypes = {
    website: { label: 'Сайт', icon: '🌐', color: 'bg-blue-100 text-blue-800' },
    social: { label: 'Соц. сети', icon: '📱', color: 'bg-pink-100 text-pink-800' },
    referral: { label: 'Рекомендации', icon: '👥', color: 'bg-green-100 text-green-800' },
    advertising: { label: 'Реклама', icon: '📢', color: 'bg-purple-100 text-purple-800' },
    phone: { label: 'Телефон', icon: '📞', color: 'bg-yellow-100 text-yellow-800' },
    other: { label: 'Другое', icon: '📋', color: 'bg-gray-100 text-gray-800' }
  };

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">
          <p>Ошибка загрузки источников: {error}</p>
        </div>
        <button 
          onClick={() => {
            clearError();
            fetchSources();
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📱 Источники обращений</h1>
          <p className="text-gray-600 mt-1">Анализ эффективности каналов привлечения</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
        >
          + Новый источник
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Всего заявок</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {sourcesStats?.total_leads || 0}
              </p>
            </div>
            <div className="text-3xl">🎯</div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Средняя конверсия</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {sourcesStats?.avg_conversion_rate || 0}%
              </p>
            </div>
            <div className="text-3xl">📈</div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Лучший источник</p>
              <p className="text-lg font-bold text-gray-900 mt-1">
                {sourcesStats?.top_sources?.[0]?.name || 'Нет данных'}
              </p>
            </div>
            <div className="text-3xl">🏆</div>
          </div>
        </div>
      </div>

      {/* Sources List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {sources.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Источники не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Источник
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Тип
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Заявки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Конверсия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Стоимость заявки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Выручка HMS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ROI
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sources.map((source) => {
                  const sourceType = sourceTypes[source.type] || sourceTypes.other;
                  
                  return (
                    <tr key={source.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900">{source.name}</div>
                          <div className="text-sm text-gray-500">{source.description}</div>
                          {source.url && (
                            <div className="text-xs text-blue-500 mt-1">
                              <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {source.url}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${sourceType.color}`}>
                          {sourceType.icon} {sourceType.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{source.leads_count}</div>
                        <div className="text-xs text-gray-500">За месяц: {source.leads_this_month}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          source.conversion_rate >= 50 ? 'text-green-600' :
                          source.conversion_rate >= 25 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {source.conversion_rate}%
                        </div>
                        <div className="text-xs text-gray-500">
                          {source.conversion_count} конверсий
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {source.cost_per_lead === 0 ? 'Бесплатно' : `${source.cost_per_lead}₸`}
                        </div>
                        {source.monthly_budget && (
                          <div className="text-xs text-gray-500">
                            Бюджет: {source.monthly_budget}₸/мес
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          // Находим данные выручки для этого источника
                          const revenueData = sourcesRevenue?.sources?.find(s => s.source_id === source.id);
                          
                          if (loadingRevenue) {
                            return <div className="text-xs text-gray-400">⏳ Загрузка...</div>;
                          }
                          
                          if (!revenueData) {
                            return <div className="text-xs text-gray-400">Нет данных</div>;
                          }
                          
                          return (
                            <div>
                              <div className="text-sm font-medium text-green-600">
                                {Math.round(revenueData.total_revenue).toLocaleString()}₸
                              </div>
                              <div className="text-xs text-gray-500">
                                {revenueData.converted_patients_count} пациентов
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          source.roi >= 80 ? 'text-green-600' :
                          source.roi >= 50 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {source.roi.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          Затраты: {source.total_cost.toFixed(0)}₸
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Source Modal */}
      {showCreateModal && (
        <div 
          className="fixed bg-black bg-opacity-50 z-50 flex items-center justify-center" 
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            margin: 0,
            padding: 0
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Новый источник</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                <input
                  type="text"
                  value={newSource.name}
                  onChange={(e) => setNewSource({...newSource, name: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Название источника"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип *</label>
                <select
                  value={newSource.type}
                  onChange={(e) => setNewSource({...newSource, type: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {Object.entries(sourceTypes).map(([key, type]) => (
                    <option key={key} value={key}>{type.icon} {type.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={newSource.description}
                  onChange={(e) => setNewSource({...newSource, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows="3"
                  placeholder="Описание источника..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={newSource.url}
                  onChange={(e) => setNewSource({...newSource, url: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="https://example.com"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Стоимость заявки (₸)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newSource.cost_per_lead}
                    onChange={(e) => setNewSource({...newSource, cost_per_lead: parseFloat(e.target.value) || 0})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Месячный бюджет (₸)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newSource.monthly_budget}
                    onChange={(e) => setNewSource({...newSource, monthly_budget: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Необязательно"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateSource}
                disabled={!newSource.name}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsView;

