import React from 'react';

const AppointmentModal = ({ 
  show, 
  onClose, 
  onSave, 
  appointmentForm, 
  setAppointmentForm, 
  patients, 
  doctors, 
  editingItem, 
  loading, 
  errorMessage 
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать запись' : 'Новая запись на прием'}
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <select
              value={appointmentForm.patient_id}
              onChange={(e) => setAppointmentForm({...appointmentForm, patient_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Выберите пациента</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>{patient.full_name}</option>
              ))}
            </select>
            
            <select
              value={appointmentForm.doctor_id}
              onChange={(e) => setAppointmentForm({...appointmentForm, doctor_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Выберите врача</option>
              {doctors.map(doctor => (
                <option key={doctor.id} value={doctor.id}>{doctor.full_name} - {doctor.specialty}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <input
              type="date"
              value={appointmentForm.appointment_date}
              onChange={(e) => setAppointmentForm({...appointmentForm, appointment_date: e.target.value})}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            
            <input
              type="time"
              placeholder="Время начала"
              value={appointmentForm.appointment_time}
              onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            
            <input
              type="time"
              placeholder="Время окончания"
              value={appointmentForm.end_time || ''}
              onChange={(e) => setAppointmentForm({...appointmentForm, end_time: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Номер кресла/станции"
              value={appointmentForm.chair_number || ''}
              onChange={(e) => setAppointmentForm({...appointmentForm, chair_number: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            
            <select
              value={appointmentForm.assistant_id || ''}
              onChange={(e) => setAppointmentForm({...appointmentForm, assistant_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Выберите ассистента</option>
              {doctors.map(doctor => (
                <option key={doctor.id} value={doctor.id}>{doctor.full_name} - {doctor.specialty}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <select
              value={appointmentForm.second_doctor_id || ''}
              onChange={(e) => setAppointmentForm({...appointmentForm, second_doctor_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Выберите второго врача</option>
              {doctors.map(doctor => (
                <option key={doctor.id} value={doctor.id}>{doctor.full_name} - {doctor.specialty}</option>
              ))}
            </select>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="extra_hours"
                checked={appointmentForm.extra_hours || false}
                onChange={(e) => setAppointmentForm({...appointmentForm, extra_hours: e.target.checked})}
                className="mr-2"
              />
              <label htmlFor="extra_hours" className="text-sm text-gray-700">
                Дополнительные часы
              </label>
            </div>
          </div>
          
          <input
            type="text"
            placeholder="Причина визита"
            value={appointmentForm.reason}
            onChange={(e) => setAppointmentForm({...appointmentForm, reason: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          
          <div className="grid grid-cols-2 gap-4">
            <textarea
              placeholder="Заметки о записи"
              value={appointmentForm.notes}
              onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
            
            <textarea
              placeholder="Заметки о пациенте"
              value={appointmentForm.patient_notes || ''}
              onChange={(e) => setAppointmentForm({...appointmentForm, patient_notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : (editingItem ? 'Обновить' : 'Создать')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentModal;