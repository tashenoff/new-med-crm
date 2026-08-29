import React from 'react';
import PanelHeader from '../common/PanelHeader';

const DoctorsView = ({ 
  doctors, 
  searchTerm, 
  setSearchTerm,
  onAddDoctor,
  onEditDoctor,
  onDeleteDoctor,
  canManage 
}) => {
  const filteredDoctors = doctors.filter(doctor => {
    const searchTermLower = searchTerm.toLowerCase();
    const fullName = doctor.full_name || '';
    const specialties = doctor.specialties || (doctor.specialty ? [doctor.specialty] : []);
    const specialtiesStr = specialties.join(' ');
    const phone = doctor.phone || '';
    
    return (
      fullName.toLowerCase().includes(searchTermLower) ||
      specialtiesStr.toLowerCase().includes(searchTermLower) ||
      phone.includes(searchTerm)
    );
  });

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Врачи"
          subtitle="Управление врачами и их специальностями"
          onAction={canManage ? onAddDoctor : undefined}
          actionLabel="+ Добавить врача"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Поиск */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Поиск по имени, специальности или телефону..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Список врачей */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {filteredDoctors.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Врачи не найдены</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Врач
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Специальность
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Телефон
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Оплата
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Дата добавления
                      </th>
                      {canManage && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Действия
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredDoctors.map(doctor => (
                      <tr key={doctor.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                              <span className="text-purple-700 font-medium text-sm">
                                {doctor.full_name.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="font-medium text-gray-900">{doctor.full_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {(doctor.specialties || (doctor.specialty ? [doctor.specialty] : [])).map((spec, idx) => (
                              <span
                                key={idx}
                                className={`px-2 py-1 text-xs rounded font-medium ${
                                  idx === 0
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {spec}
                              </span>
                            ))}
                            {(doctor.specialties || []).length === 0 && !doctor.specialty && (
                              <span className="px-2 py-1 text-xs rounded font-medium bg-gray-100 text-gray-400">
                                Не указана
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {doctor.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {doctor.email || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {doctor.payment_type === 'percentage' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                📊 {doctor.payment_value || 0}%
                              </span>
                            ) : doctor.payment_type === 'hybrid' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                🔗 {doctor.payment_value || 0}₸ + {doctor.hybrid_percentage_value || 0}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                💰 {doctor.payment_value || 0} {doctor.currency === 'KZT' ? '₸' : doctor.currency === 'USD' ? '$' : doctor.currency === 'EUR' ? '€' : doctor.currency === 'RUB' ? '₽' : doctor.currency}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {doctor.payment_type === 'percentage' ? 'от выручки' :
                             doctor.payment_type === 'hybrid' ? 'гибридная' : 'фиксированная'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(doctor.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                            <button
                              onClick={() => onEditDoctor(doctor)}
                              className="text-purple-600 hover:text-purple-900"
                            >
                              Редактировать
                            </button>
                            <button
                              onClick={() => onDeleteDoctor(doctor.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Удалить
                            </button>
                          </td>
                        )}
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

export default DoctorsView;
