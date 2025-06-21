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
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать запись' : 'Новая запись на прием'}
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
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
            value={appointmentForm.appointment_time}
            onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
          
          <input
            type="text"
            placeholder="Причина визита"
            value={appointmentForm.reason}
            onChange={(e) => setAppointmentForm({...appointmentForm, reason: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          
          <textarea
            placeholder="Заметки"
            value={appointmentForm.notes}
            onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows="3"
          />
          
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