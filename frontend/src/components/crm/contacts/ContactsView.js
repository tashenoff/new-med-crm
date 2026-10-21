import { permissionProps } from '../../../utils/permissions.js';
import React, { useState, useEffect } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import { useCrmApi } from '../../../hooks/useCrmApi';
import SourceEditor from './SourceEditor';

const ContactsView = ({ user }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sourcesRevenue, setSourcesRevenue] = useState(null);
  const [loadingRevenue, setLoadingRevenue] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const canManageNumbers = ['admin', 'super_admin'].includes(user?.role) && user?.permissions?.includes('crm_view') && user?.permissions?.includes('crm_edit');

  const {
    sources,
    sourcesStats,
    loading,
    error,
    isInitialized,
    fetchSources,
    deleteSource,
    updateSourcesStatistics,
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

  const handleDeleteSource = async (source) => {
    // Подтверждение удаления
    const confirmMessage = source.leads_count > 0 
      ? `Источник "${source.name}" имеет ${source.leads_count} заявок и не может быть удален.`
      : `Вы уверены, что хотите удалить источник "${source.name}"? Это действие необратимо.`;
    
    if (source.leads_count > 0) {
      alert(confirmMessage);
      return;
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteSource(source.id);
      alert('Источник успешно удален!');
      
      // Обновляем данные
      await fetchSources();
      await updateSourcesStatistics();
    } catch (error) {
      console.error('Error deleting source:', error);
      alert('Ошибка при удалении источника: ' + (error.message || error));
    }
  };

  const sourceTypes = {
    website: { label: 'Сайт', icon: '🌐', color: "bg-curai-selected text-curai-blue" },
    social: { label: 'Соц. сети', icon: '📱', color: "bg-curai-negativeBg text-curai-negative" },
    referral: { label: 'Рекомендации', icon: '👥', color: "bg-curai-positiveBg text-curai-positive" },
    advertising: { label: 'Реклама', icon: '📢', color: "bg-curai-selected text-curai-blue" },
    phone: { label: 'Телефон', icon: '📞', color: "bg-curai-warningBg text-curai-warning" },
    other: { label: 'Другое', icon: '📋', color: "bg-curai-subtle text-curai-ink" }
  };

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-curai-control"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-curai-negative mb-4">
          <p>Ошибка загрузки источников: {error}</p>
        </div>
        <button 
          onClick={() => {
            clearError();
            fetchSources();
          }}
          className="bg-curai-blue text-white px-4 py-2 rounded-md hover:bg-curai-blue transition-colors"
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
          <h1 className="text-2xl font-semibold text-curai-ink">📱 Источники обращений</h1>
          <p className="text-curai-muted mt-1">Анализ эффективности каналов привлечения</p>
        </div>
        <button 
          onClick={() => { setEditingSource(null); setShowCreateModal(true); }}
          className="bg-curai-warning text-white px-4 py-2 rounded-md hover:bg-curai-warning transition-colors"
         {...permissionProps(user, "crm_view", "crm_edit")}>
          + Новый источник
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-curai-surface rounded-md shadow-none border border-curai-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Всего заявок</p>
              <p className="text-2xl font-semibold text-curai-ink mt-1">
                {sourcesStats?.total_leads || 0}
              </p>
            </div>
            <div className="text-2xl">🎯</div>
          </div>
        </div>
        
        <div className="bg-curai-surface rounded-md shadow-none border border-curai-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Средняя конверсия</p>
              <p className="text-2xl font-semibold text-curai-ink mt-1">
                {sourcesStats?.avg_conversion_rate || 0}%
              </p>
            </div>
            <div className="text-2xl">📈</div>
          </div>
        </div>
        
        <div className="bg-curai-surface rounded-md shadow-none border border-curai-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Лучший источник</p>
              <p className="text-lg font-semibold text-curai-ink mt-1">
                {sourcesStats?.top_sources?.[0]?.name || 'Нет данных'}
              </p>
            </div>
            <div className="text-2xl">🏆</div>
          </div>
        </div>
      </div>

      {/* Sources List */}
      <div className="bg-curai-surface rounded-md shadow-none border border-curai-border">
        {sources.length === 0 ? (
          <div className="text-center py-8 text-curai-muted">
            <p>Источники не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-curai-border">
              <thead className="bg-curai-subtle">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Источник
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Тип
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Заявки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Конверсия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Стоимость заявки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Выручка HMS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    ROI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-curai-surface divide-y divide-curai-border">
                {sources.map((source) => {
                  const sourceType = sourceTypes[source.type] || sourceTypes.other;
                  
                  return (
                    <tr key={source.id} className="hover:bg-curai-subtle">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-curai-ink">{source.name}</div>
                          <div className="text-sm text-curai-muted">{source.description}</div>
                          {source.url && (
                            <div className="text-xs text-curai-blue mt-1">
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
                        <div className="text-sm font-medium text-curai-ink">{source.leads_count}</div>
                        <div className="text-xs text-curai-muted">За месяц: {source.leads_this_month}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          source.conversion_rate >= 50 ? "text-curai-positive" :
                          source.conversion_rate >= 25 ? "text-curai-warning" :
                          "text-curai-negative"
                        }`}>
                          {source.conversion_rate}%
                        </div>
                        <div className="text-xs text-curai-muted">
                          {source.conversion_count} конверсий
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-curai-ink">
                          {source.cost_per_lead === 0 ? 'Бесплатно' : `${source.cost_per_lead}₸`}
                        </div>
                        {source.monthly_budget && (
                          <div className="text-xs text-curai-muted">
                            Бюджет: {source.monthly_budget}₸/мес
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          // Находим данные выручки для этого источника
                          const revenueData = sourcesRevenue?.sources?.find(s => s.source_id === source.id);
                          
                          if (loadingRevenue) {
                            return <div className="text-xs text-curai-muted">⏳ Загрузка...</div>;
                          }
                          
                          if (!revenueData) {
                            return <div className="text-xs text-curai-muted">Нет данных</div>;
                          }
                          
                          return (
                            <div>
                              <div className="text-sm font-medium text-curai-positive">
                                {Math.round(revenueData.total_revenue).toLocaleString()}₸
                              </div>
                              <div className="text-xs text-curai-muted">
                                {revenueData.converted_patients_count} пациентов
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          source.roi >= 80 ? "text-curai-positive" :
                          source.roi >= 50 ? "text-curai-warning" :
                          "text-curai-negative"
                        }`}>
                          {source.roi.toFixed(1)}%
                        </div>
                        <div className="text-xs text-curai-muted">
                          Затраты: {source.total_cost.toFixed(0)}₸
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button type="button" className="text-xs text-curai-blue underline" onClick={() => { setEditingSource(source); setShowCreateModal(true); }} {...permissionProps(user, "crm_view", "crm_edit")}>Редактировать</button>
                          <button
                            onClick={() => handleDeleteSource(source)}
                            disabled={source.leads_count > 0}
                            className={`text-xs px-2 py-1 rounded ${
                              source.leads_count > 0
                                ? "bg-curai-subtle text-curai-muted cursor-not-allowed"
                                : "bg-curai-negativeBg text-curai-negative hover:bg-curai-negativeBg"
                            }`}
                            title={source.leads_count > 0 ? `Нельзя удалить: есть ${source.leads_count} заявок` : 'Удалить источник'}
                           {...permissionProps(user, "crm_view", "crm_delete")}>
                            🗑️ Удалить
                          </button>
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

      {showCreateModal && <SourceEditor source={editingSource} canManageNumbers={canManageNumbers} canDeleteNumbers={canManageNumbers && user?.permissions?.includes("crm_delete")} canEdit={Boolean(user?.permissions?.includes("crm_view") && user?.permissions?.includes("crm_edit"))}
        onClose={() => setShowCreateModal(false)} onSaved={() => {
          setShowCreateModal(false);
          fetchSources();
          fetchSourcesRevenue();
          updateSourcesStatistics();
        }} />}

    </div>
  );
};

export default ContactsView;

