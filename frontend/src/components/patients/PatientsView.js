import { canAction } from '../../utils/permissions.js';
import React, { useState, useEffect } from 'react';
import PanelHeader from '../common/PanelHeader';
import { formatPatientPhone } from '../../utils/patientPhone';
import { patientOriginLabel, visiblePatientNotes } from '../../utils/patientOrigin';
import { firstAcquisitionLabel } from '../../utils/attribution';

const PatientsView = ({
  user,
  patients, 
  patientsTreatmentPlans = {},
  searchTerm, 
  setSearchTerm,
  filterType,
  setFilterType,
  planStatusFilter = 'all',
  setPlanStatusFilter,

  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onAddPatient,
  onEditPatient,
  canManage 
}) => {
  // Источники (каналы привлечения)
  const [sources, setSources] = useState([]);
  
  // Загрузка источников
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const API = import.meta.env.VITE_BACKEND_URL;
        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/api/crm/sources/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setSources(data);
        }
      } catch (error) {
        console.error('Error fetching sources:', error);
      }
    };
    fetchSources();
  }, []);

  // Функция получения названия источника
  const getSourceName = (patient) => {
    // Если есть source_id, ищем в загруженных источниках
    if (patient.source_id && sources.length > 0) {
      const source = sources.find(s => s.id === patient.source_id);
      if (source) return source.name;
    }
    // Фолбэк на статические названия по типу
    const sourceLabels = {
      'phone': 'Телефон',
      'walk_in': 'Обращение',
      'referral': 'Направление',
      'website': 'Веб-сайт',
      'social_media': 'Соц. сети',
      'social': 'Соц. сети',
      'advertising': 'Реклама',
      'email': 'Email',
      'crm_conversion': 'CRM',
      'other': 'Другое'
    };
    return sourceLabels[patient.source] || patient.source || 'Не указан';
  };

  // Вычисляем статистику оплат для пациента
  const calculatePaymentStats = (patientId) => {
    const plans = patientsTreatmentPlans[patientId] || [];
    let totalCost = 0;
    let totalPaid = 0;
    let totalServices = 0;
    let paidServices = 0;

    plans.forEach(plan => {
      if (plan.services && Array.isArray(plan.services)) {
        plan.services.forEach(service => {
          totalServices++;
          totalCost += service.total_price || 0;
          // оплачено: обычная услуга — вся цена при 'paid'; комплекс — сумма оплаченных долей
          const sPaid = (service.payment_status === 'paid')
            ? (service.total_price || 0)
            : (service.paid_amount || 0);
          if (sPaid > 0) paidServices++;
          totalPaid += sPaid;
        });
      }
    });

    const remaining = totalCost - totalPaid;
    const percentage = totalCost > 0 ? (totalPaid / totalCost) * 100 : 0;

    return {
      totalCost,
      totalPaid,
      remaining,
      percentage,
      totalServices,
      paidServices
    };
  };

  // Фильтрация по оплате планов — та же логика, что в колонке «оплачено / остаток»
  const filteredPatients = (patients || []).filter((patient) => {
    if (!planStatusFilter || planStatusFilter === 'all') return true;
    const stats = calculatePaymentStats(patient.id);
    if (planStatusFilter === 'none') return stats.totalServices === 0 && (patientsTreatmentPlans[patient.id] || []).length === 0;
    const isClosed = stats.totalCost > 0 && stats.remaining <= 0;
    if (planStatusFilter === 'closed') return isClosed;
    if (planStatusFilter === 'open') return stats.totalCost > 0 && stats.remaining > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-md`}>
        <PanelHeader
          title="Пациенты"
          subtitle="Управление списком пациентов клиники"
          onAction={canAction(user, "patients_view", "patients_edit") ? (canManage ? onAddPatient : undefined) : undefined}
          actionLabel="+ Добавить пациента"
        />

        <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border p-4 space-y-4 shadow-none">
          {/* Фильтры */}
          <div className="mb-6 space-y-4">
            {/* Поиск */}
            <div>
              <input
                type="text"
                placeholder="Поиск по имени или телефону..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
              />
            </div>

            {/* Фильтры в одной строке */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Фильтр по типу пациента */}
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Тип пациента
                </label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                >
                  <option value="all">Все пациенты</option>
                  <option value="returning">Повторные</option>
                  <option value="new">Новые</option>
                </select>
              </div>

              {/* Фильтр по планам лечения */}
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Планы лечения
                </label>
                <select
                  value={planStatusFilter}
                  onChange={(e) => setPlanStatusFilter && setPlanStatusFilter(e.target.value)}
                  className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                >
                  <option value="all">Все планы</option>
                  <option value="open">Незакрытые</option>
                  <option value="closed">Закрытые</option>
                  <option value="none">Без плана лечения</option>
                </select>
              </div>

              {/* Дата от */}
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Период с
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                />
              </div>

              {/* Дата до */}
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Период по
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                />
              </div>
            </div>

            {/* Кнопка очистки фильтров */}
            {(filterType !== 'all' || planStatusFilter !== 'all' || dateFrom || dateTo || searchTerm) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                    if (setPlanStatusFilter) setPlanStatusFilter('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="px-4 py-2 text-sm text-curai-muted hover:text-curai-ink border border-curai-control rounded-md hover:bg-curai-subtle "
                >
                  Очистить фильтры
                </button>
              </div>
            )}
          </div>

          {/* Список пациентов */}
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            {filteredPatients.length === 0 ? (
              <div className="text-center py-8 text-curai-muted">
                <p>Пациенты не найдены</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-curai-border">
                  <thead className="bg-curai-subtle">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Пациент
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Контакты
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Личные данные
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                          Первое привлечение
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Финансы
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Статус / Дата
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-curai-surface divide-y divide-curai-border">
                    {filteredPatients.map((patient, index) => (
                      <tr 
                        key={patient.id} 
                        className="hover:bg-curai-subtle cursor-pointer transition-colors"
                        onClick={() => canManage && onEditPatient(patient)}
                        title={canManage ? "Нажмите для редактирования" : ""}
                        data-guide={index === 0 ? "patient-row" : undefined}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-curai-ink">
                            {patient.full_name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.name || 'Без имени'}
                          </div>
                          {patientOriginLabel(patient, sources) && (
                            <div className="text-sm text-curai-muted">{patientOriginLabel(patient, sources)}</div>
                          )}
                          {visiblePatientNotes(patient) && (
                            <div className="text-sm text-curai-muted">{visiblePatientNotes(patient)}</div>
                          )}
                          {patient.referrer && (
                            <div className="text-sm text-curai-blue">Направил: {patient.referrer}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-curai-ink">{formatPatientPhone(patient.phone)}</div>
                          {patient.iin && (
                            <div className="text-sm text-curai-muted">ИИН: {patient.iin}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {patient.birth_date && (
                            <div className="text-sm text-curai-ink">
                              {new Date(patient.birth_date).toLocaleDateString('ru-RU')}
                            </div>
                          )}
                          {patient.gender && (
                            <div className="text-sm text-curai-muted">
                              {patient.gender === 'male' ? 'Мужской' :
                               patient.gender === 'female' ? 'Женский' : 'Другой'}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded font-medium ${
                            patient.source === 'phone' ? "bg-curai-selected text-curai-blue" :
                            patient.source === 'walk_in' ? "bg-curai-positiveBg text-curai-positive" :
                            patient.source === 'referral' ? "bg-curai-selected text-curai-blue" :
                            patient.source === 'website' ? "bg-curai-selected text-curai-blue" :
                            patient.source === 'social_media' || patient.source === 'social' ? "bg-curai-negativeBg text-curai-negative" :
                            patient.source === 'advertising' ? "bg-curai-warningBg text-curai-warning" :
                            patient.source === 'email' ? "bg-curai-selected text-curai-blue" :
                            patient.source === 'crm_conversion' ? "bg-curai-positiveBg text-curai-positive" :
                            "bg-curai-subtle text-curai-ink"
                          }`}>
                            {firstAcquisitionLabel(patient, sources)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            const stats = calculatePaymentStats(patient.id);
                            return stats.totalCost > 0 ? (
                              <div className="space-y-2 min-w-[200px]">
                                {/* Прогресс-бар */}
                                <div className="w-full bg-curai-border rounded-full h-2.5">
                                  <div 
                                    className="bg-curai-positive h-2.5 rounded-full transition-all duration-300"
                                    style={{ width: `${stats.percentage}%` }}
                                  ></div>
                                </div>
                                
                                {/* Статистика */}
                                <div className="flex justify-between text-xs">
                                  <div className="font-medium text-curai-positive">
                                    ✓ {stats.totalPaid.toFixed(0)} ₸
                                  </div>
                                  <div className="text-curai-muted">
                                    {stats.paidServices}/{stats.totalServices} услуг
                                  </div>
                                  <div className="font-medium text-curai-warning">
                                    ⏳ {stats.remaining.toFixed(0)} ₸
                                  </div>
                                </div>
                                
                                {/* Процент */}
                                <div className="text-center text-xs font-semibold text-curai-ink">
                                  {stats.percentage.toFixed(0)}% оплачено
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-curai-muted italic">
                                Нет планов лечения
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col space-y-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              patient.appointments_count > 0 
                                ? "bg-curai-selected text-curai-blue "
                                : "bg-curai-positiveBg text-curai-positive "
                            }`}>
                              {patient.appointments_count > 0 ? '🔄 Повторный' : '✨ Новый'}
                              {patient.appointments_count > 0 && ` (${patient.appointments_count})`}
                            </span>
                            <span className="text-xs text-curai-muted ">
                              {new Date(patient.created_at).toLocaleDateString('ru-RU')}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientsView;
