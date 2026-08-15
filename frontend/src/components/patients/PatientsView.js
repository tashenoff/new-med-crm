import React from 'react';
import PanelHeader from '../common/PanelHeader';

const PatientsView = ({ 
  patients, 
  patientsTreatmentPlans = {},
  searchTerm, 
  setSearchTerm,
  filterType,
  setFilterType,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onAddPatient,
  onEditPatient,
  canManage 
}) => {
  // Фильтрация теперь происходит на сервере, поэтому просто отображаем полученные данные
  const filteredPatients = patients;

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
          if (service.payment_status === 'paid') {
            paidServices++;
            totalPaid += service.total_price || 0;
          }
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

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Пациенты"
          subtitle="Управление списком пациентов клиники"
          onAction={canManage ? onAddPatient : undefined}
          actionLabel="+ Добавить пациента"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Фильтры */}
          <div className="mb-6 space-y-4">
            {/* Поиск */}
            <div>
              <input
                type="text"
                placeholder="Поиск по имени или телефону..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Фильтры в одной строке */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Фильтр по типу пациента */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Тип пациента
                </label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Все пациенты</option>
                  <option value="returning">Повторные</option>
                  <option value="new">Новые</option>
                </select>
              </div>

              {/* Дата от */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Период с
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Дата до */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Период по
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Кнопка очистки фильтров */}
            {(filterType !== 'all' || dateFrom || dateTo || searchTerm) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Очистить фильтры
                </button>
              </div>
            )}
          </div>

          {/* Список пациентов */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {filteredPatients.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Пациенты не найдены</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Пациент
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Контакты
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Личные данные
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Источник
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Финансы
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Статус / Дата
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPatients.map(patient => (
                      <tr 
                        key={patient.id} 
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => canManage && onEditPatient(patient)}
                        title={canManage ? "Нажмите для редактирования" : ""}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{patient.full_name}</div>
                          {patient.notes && (
                            <div className="text-sm text-gray-500">{patient.notes}</div>
                          )}
                          {patient.referrer && (
                            <div className="text-sm text-blue-600">Направил: {patient.referrer}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{patient.phone}</div>
                          {patient.iin && (
                            <div className="text-sm text-gray-500">ИИН: {patient.iin}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {patient.birth_date && (
                            <div className="text-sm text-gray-900">
                              {new Date(patient.birth_date).toLocaleDateString('ru-RU')}
                            </div>
                          )}
                          {patient.gender && (
                            <div className="text-sm text-gray-500">
                              {patient.gender === 'male' ? 'Мужской' :
                               patient.gender === 'female' ? 'Женский' : 'Другой'}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded font-medium ${
                            patient.source === 'phone' ? 'bg-blue-100 text-blue-800' :
                            patient.source === 'walk_in' ? 'bg-green-100 text-green-800' :
                            patient.source === 'referral' ? 'bg-purple-100 text-purple-800' :
                            patient.source === 'website' ? 'bg-indigo-100 text-indigo-800' :
                            patient.source === 'social_media' ? 'bg-pink-100 text-pink-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {patient.source === 'phone' ? 'Телефон' :
                             patient.source === 'walk_in' ? 'Обращение' :
                             patient.source === 'referral' ? 'Направление' :
                             patient.source === 'website' ? 'Веб-сайт' :
                             patient.source === 'social_media' ? 'Соц. сети' :
                             'Другое'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            const stats = calculatePaymentStats(patient.id);
                            return stats.totalCost > 0 ? (
                              <div className="space-y-2 min-w-[200px]">
                                {/* Прогресс-бар */}
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                  <div 
                                    className="bg-gradient-to-r from-green-500 to-green-600 h-2.5 rounded-full transition-all duration-300"
                                    style={{ width: `${stats.percentage}%` }}
                                  ></div>
                                </div>
                                
                                {/* Статистика */}
                                <div className="flex justify-between text-xs">
                                  <div className="font-medium text-green-600">
                                    ✓ {stats.totalPaid.toFixed(0)} ₸
                                  </div>
                                  <div className="text-gray-500">
                                    {stats.paidServices}/{stats.totalServices} услуг
                                  </div>
                                  <div className="font-medium text-orange-600">
                                    ⏳ {stats.remaining.toFixed(0)} ₸
                                  </div>
                                </div>
                                
                                {/* Процент */}
                                <div className="text-center text-xs font-semibold text-gray-700">
                                  {stats.percentage.toFixed(0)}% оплачено
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400 italic">
                                Нет планов лечения
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col space-y-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              patient.appointments_count > 0 
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            }`}>
                              {patient.appointments_count > 0 ? '🔄 Повторный' : '✨ Новый'}
                              {patient.appointments_count > 0 && ` (${patient.appointments_count})`}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
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
