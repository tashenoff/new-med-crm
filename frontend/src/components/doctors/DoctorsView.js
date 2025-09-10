import React from 'react';

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
    const specialty = doctor.specialty || '';
    const phone = doctor.phone || '';
    
    return (
      fullName.toLowerCase().includes(searchTermLower) ||
      specialty.toLowerCase().includes(searchTermLower) ||
      phone.includes(searchTerm)
    );
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Врачи</h2>
        {canManage && (
          <button
            onClick={onAddDoctor}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            + Добавить врача
          </button>
        )}
      </div>

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
                      <span className="px-2 py-1 text-xs rounded font-medium bg-purple-100 text-purple-800">
                        {doctor.specialty}
                      </span>
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
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            💰 {doctor.payment_value || 0} {doctor.currency === 'KZT' ? '₸' : doctor.currency === 'USD' ? '$' : doctor.currency === 'EUR' ? '€' : doctor.currency === 'RUB' ? '₽' : doctor.currency}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {doctor.payment_type === 'percentage' ? 'от выручки' : 'фиксированная'}
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
  );
};

export default DoctorsView;