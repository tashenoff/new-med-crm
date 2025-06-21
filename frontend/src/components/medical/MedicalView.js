import React from 'react';

const MedicalView = ({ 
  patients, 
  selectedPatient, 
  medicalSummary,
  patientAppointments,
  user,
  onSelectPatient,
  onEditMedicalRecord,
  onAddMedicalEntry,
  onAddDiagnosis,
  onAddMedication
}) => {
  if (!selectedPatient) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Медицинские карты</h2>
        
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="font-semibold mb-4">Выберите пациента</h3>
          <div className="grid gap-3">
            {patients.map(patient => (
              <button
                key={patient.id}
                onClick={() => onSelectPatient(patient)}
                className="text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">{patient.full_name}</div>
                <div className="text-sm text-gray-600">{patient.phone}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!medicalSummary) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Медицинские карты</h2>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка медицинской карты...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Медицинские карты</h2>
      
      <div className="space-y-6">
        {/* Информация о пациенте */}
        <div className="bg-white rounded-lg p-6 shadow">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-semibold">{selectedPatient.full_name}</h3>
              <div className="mt-2 text-sm text-gray-600 space-y-1">
                <p>Телефон: {medicalSummary.patient.phone}</p>
                {medicalSummary.medical_record?.blood_type && (
                  <p>Группа крови: {medicalSummary.medical_record.blood_type}</p>
                )}
                {medicalSummary.medical_record?.height && (
                  <p>Рост: {medicalSummary.medical_record.height} см</p>
                )}
                {medicalSummary.medical_record?.weight && (
                  <p>Вес: {medicalSummary.medical_record.weight} кг</p>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {user?.role !== 'patient' && (
                <>
                  <button
                    onClick={() => onEditMedicalRecord(selectedPatient.id, medicalSummary.medical_record)}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    title="Редактировать медицинскую карту"
                  >
                    ✏️ Редактировать медкарту
                  </button>
                  <button
                    onClick={() => onAddMedicalEntry(selectedPatient.id)}
                    className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                    title="Добавить запись о приеме"
                  >
                    📝 Добавить запись
                  </button>
                  <button
                    onClick={() => onAddDiagnosis(selectedPatient.id)}
                    className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm"
                    title="Добавить диагноз"
                  >
                    🩺 Добавить диагноз
                  </button>
                  <button
                    onClick={() => onAddMedication(selectedPatient.id)}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                    title="Назначить лекарство"
                  >
                    💊 Назначить лекарство
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* История приемов */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h4 className="font-semibold mb-3">📅 История приемов</h4>
          {patientAppointments.length === 0 ? (
            <p className="text-gray-500">Записей на прием нет</p>
          ) : (
            <div className="space-y-3">
              {patientAppointments.map(appointment => (
                <div key={appointment.id} className="border-l-4 border-indigo-500 pl-4 bg-indigo-50 p-3 rounded">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-indigo-900">
                        {appointment.doctor_name} ({appointment.doctor_specialty})
                      </div>
                      <div className="text-sm text-indigo-700">
                        📅 {appointment.appointment_date} в {appointment.appointment_time}
                      </div>
                      {appointment.reason && (
                        <div className="text-sm text-gray-600 mt-1">
                          Причина: {appointment.reason}
                        </div>
                      )}
                      {appointment.notes && (
                        <div className="text-sm text-gray-600">
                          Заметки: {appointment.notes}
                        </div>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded font-medium ${
                      appointment.status === 'completed' ? 'bg-green-100 text-green-800' :
                      appointment.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                      appointment.status === 'in_progress' ? 'bg-orange-100 text-orange-800' :
                      appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {appointment.status === 'completed' ? 'Завершен' :
                       appointment.status === 'confirmed' ? 'Подтвержден' :
                       appointment.status === 'in_progress' ? 'В процессе' :
                       appointment.status === 'cancelled' ? 'Отменен' :
                       'Не подтвержден'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Последние записи */}
        {medicalSummary.entries.length > 0 && (
          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold mb-3">📝 Последние записи</h4>
            <div className="space-y-3">
              {medicalSummary.entries.map(entry => (
                <div key={entry.id} className="border-l-4 border-green-500 pl-4 bg-green-50 p-3 rounded">
                  <div className="font-medium text-green-900">{entry.title}</div>
                  <div className="text-sm text-green-700 mt-1">{entry.description}</div>
                  <div className="text-xs text-gray-500 mt-2">
                    {new Date(entry.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Остальные секции аналогично */}
      </div>
    </div>
  );
};

export default MedicalView;