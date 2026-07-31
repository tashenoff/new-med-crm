import React from 'react';

const StaffView = ({
  staff,
  searchTerm,
  setSearchTerm,
  filterRole,
  setFilterRole,
  onAddStaff,
  onEditStaff,
  onDeleteStaff,
  onAssignAccess,
  onRevokeAccess,
  canManage
}) => {
  // Маппинг ролей на русский
  const roleLabels = {
    super_admin: 'Супер Администратор',
    admin: 'Администратор',
    doctor: 'Врач',
    marketer: 'Маркетолог',
    administrator: 'Администратор клиники'
  };

  // Цвета для бейджей ролей
  const getRoleColor = (role) => {
    const colors = {
      super_admin: 'bg-purple-100 text-purple-800',
      admin: 'bg-blue-100 text-blue-800',
      doctor: 'bg-green-100 text-green-800',
      marketer: 'bg-orange-100 text-orange-800',
      administrator: 'bg-gray-100 text-gray-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  // Фильтрация персонала
  const filteredStaff = staff.filter(member => {
    const matchesSearch = member.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = filterRole === 'all' || member.role === filterRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Управление персоналом
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Управление сотрудниками и врачами клиники
            </p>
          </div>
          {canManage && (
            <button
              onClick={onAddStaff}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить сотрудника
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Поиск */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Поиск по имени или email
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Фильтр по роли */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Фильтр по роли
            </label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Все роли</option>
              <option value="super_admin">Супер Администратор</option>
              <option value="admin">Администратор</option>
              <option value="doctor">Врач</option>
              <option value="marketer">Маркетолог</option>
              <option value="administrator">Администратор клиники</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Сотрудник
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email / Логин
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Роль
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Телефон
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Дата создания
              </th>
              {canManage && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M21 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-gray-500 text-lg">Сотрудники не найдены</p>
                    <p className="text-gray-400 text-sm mt-1">Попробуйте изменить параметры поиска</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredStaff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${
                        member.type === 'doctor' ? 'bg-gradient-to-br from-green-500 to-teal-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'
                      }`}>
                        {member.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {member.full_name}
                        </div>
                        {member.type === 'doctor' && member.specialty && (
                          <div className="text-xs text-gray-500">
                            {member.specialty}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{member.email || '—'}</div>
                    {member.type === 'doctor' && !member.has_access && (
                      <div className="text-xs text-orange-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Нет доступа
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(member.role)}`}>
                      {roleLabels[member.role] || member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {member.phone || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {member.is_active ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Активен
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Неактивен
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {member.created_at ? new Date(member.created_at).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.type === 'doctor' ? (
                        // Для врачей показываем кнопки управления доступом
                        member.has_access ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => onEditStaff(member)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Редактировать права"
                            >
                              Права доступа
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => onRevokeAccess && onRevokeAccess(member)}
                              className="text-orange-600 hover:text-orange-900"
                              title="Отозвать доступ"
                            >
                              Отозвать доступ
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => onAssignAccess && onAssignAccess(member)}
                            className="text-green-600 hover:text-green-900 font-semibold"
                            title="Назначить доступ"
                          >
                            Назначить доступ
                          </button>
                        )
                      ) : (
                        // Для обычного персонала - редактирование и удаление
                        <>
                          <button
                            onClick={() => onEditStaff(member)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                            title="Редактировать"
                          >
                            Редактировать
                          </button>
                          <button
                            onClick={() => onDeleteStaff(member.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Удалить"
                          >
                            Удалить
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with count */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Показано <span className="font-medium">{filteredStaff.length}</span> из{' '}
          <span className="font-medium">{staff.length}</span> сотрудников
        </p>
      </div>
    </div>
  );
};

export default StaffView;
