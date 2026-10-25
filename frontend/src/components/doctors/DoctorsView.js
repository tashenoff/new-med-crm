import { canAction, permissionProps } from '../../utils/permissions.js';
import React from 'react';
import PanelHeader from '../common/PanelHeader';

const DoctorsView = ({
  user,
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
      <div className={`calendar-container calendar-view-panel rounded-md`}>
        <PanelHeader
          title="Врачи"
          subtitle="Управление врачами и их специальностями"
          onAction={canAction(user, "doctors_view", "doctors_create") ? (canManage ? onAddDoctor : undefined) : undefined}
          actionLabel="+ Добавить врача"
        />

        <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border p-4 space-y-4 shadow-none">
          {/* Поиск */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Поиск по имени, специальности или телефону..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
            />
          </div>

          {/* Список врачей */}
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            {filteredDoctors.length === 0 ? (
              <div className="text-center py-8 text-curai-muted">
                <p>Врачи не найдены</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-curai-border">
                  <thead className="bg-curai-subtle">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Врач
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Специальность
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Телефон
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Оплата
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                        Дата добавления
                      </th>
                      {canManage && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                          Действия
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-curai-surface divide-y divide-curai-border">
                    {filteredDoctors.map(doctor => (
                      <tr key={doctor.id} className="hover:bg-curai-subtle">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 bg-curai-selected rounded-full flex items-center justify-center">
                              <span className="text-curai-blue font-medium text-sm">
                                {doctor.full_name.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="font-medium text-curai-ink">{doctor.full_name}</div>
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
                                    ? "bg-curai-selected text-curai-blue "
                                    : "bg-curai-subtle text-curai-muted "
                                }`}
                              >
                                {spec}
                              </span>
                            ))}
                            {(doctor.specialties || []).length === 0 && !doctor.specialty && (
                              <span className="px-2 py-1 text-xs rounded font-medium bg-curai-subtle text-curai-muted">
                                Не указана
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                          {doctor.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                          {doctor.email || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-curai-ink">
                            {!canAction(user, 'payroll_view') ? <span className="text-curai-muted">Нет доступа</span> : doctor.payment_type === 'percentage' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-positiveBg text-curai-positive">
                                📊 {doctor.payment_value || 0}%
                              </span>
                            ) : doctor.payment_type === 'hybrid' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-selected text-curai-blue">
                                🔗 {doctor.payment_value || 0}₸ + {doctor.hybrid_percentage_value || 0}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-selected text-curai-blue">
                                💰 {doctor.payment_value || 0} {doctor.currency === 'KZT' ? '₸' : doctor.currency === 'USD' ? '$' : doctor.currency === 'EUR' ? '€' : doctor.currency === 'RUB' ? '₽' : doctor.currency}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-curai-muted">
                            {!canAction(user, 'payroll_view') ? '' : doctor.payment_type === 'percentage' ? 'от выручки' :
                             doctor.payment_type === 'hybrid' ? 'гибридная' : 'фиксированная'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                          {new Date(doctor.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                            <button
                              onClick={() => onEditDoctor(doctor)}
                              className="text-curai-blue hover:text-curai-blue"
                             {...permissionProps(user, "doctors_view", "doctors_edit")}>
                              Редактировать
                            </button>
                            <button
                              onClick={() => onDeleteDoctor(doctor.id)}
                              className="text-curai-negative hover:text-curai-negative"
                             {...permissionProps(user, "doctors_view", "doctors_delete")}>
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
