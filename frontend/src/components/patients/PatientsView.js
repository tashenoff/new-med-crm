import React from 'react';

const PatientsView = ({ 
  patients, 
  searchTerm, 
  setSearchTerm,
  onAddPatient,
  onEditPatient,
  onDeletePatient,
  canManage 
}) => {
  const filteredPatients = patients.filter(patient =>
    patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm)
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Пациенты</h2>
        {canManage && (
          <button
            onClick={onAddPatient}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            + Добавить пациента
          </button>
        )}
      </div>

      {/* Поиск */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Поиск по имени или телефону..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
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
                    Дата регистрации
                  </th>
                  {canManage && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPatients.map(patient => (
                  <tr key={patient.id} className="hover:bg-gray-50">
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {(patient.revenue || 0) > 0 && (
                          <div className="text-green-600">↗ {patient.revenue} ₸</div>
                        )}
                        {(patient.debt || 0) > 0 && (
                          <div className="text-red-600">↘ {patient.debt} ₸</div>
                        )}
                        {(patient.overpayment || 0) > 0 && (
                          <div className="text-blue-600">↖ {patient.overpayment} ₸</div>
                        )}
                        <div className="text-xs text-gray-500">
                          {patient.appointments_count || 0} приемов
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(patient.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => onEditPatient(patient)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => onDeletePatient(patient.id)}
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

export default PatientsView;