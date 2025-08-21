import React, { useState } from 'react';

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
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    full_name: '',
    phone: '',
    iin: '',
    birth_date: '',
    gender: '',
    source: 'walk_in',
    referrer: '',
    notes: ''
  });

  if (!show) return null;

  const handleCreateNewPatient = async (e) => {
    e.preventDefault();
    try {
      // Here we would call the API to create a new patient
      // For now, let's simulate this
      console.log('Creating new patient:', newPatientForm);
      // After creating, we should update the patients list and select the new patient
      setShowNewPatientForm(false);
      setNewPatientForm({
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: 'walk_in',
        referrer: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error creating patient:', error);
    }
  };

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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пациент *</label>
            <div className="flex gap-2">
              <select
                value={appointmentForm.patient_id}
                onChange={(e) => setAppointmentForm({...appointmentForm, patient_id: e.target.value})}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
                disabled={showNewPatientForm}
              >
                <option value="">Выберите пациента</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>{patient.full_name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewPatientForm(!showNewPatientForm)}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                {showNewPatientForm ? 'Отмена' : '+ Новый'}
              </button>
            </div>
          </div>

          {showNewPatientForm && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="font-medium mb-3">Создать нового пациента</h4>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="ФИО *"
                  value={newPatientForm.full_name}
                  onChange={(e) => setNewPatientForm({...newPatientForm, full_name: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="tel"
                  placeholder="Телефон *"
                  value={newPatientForm.phone}
                  onChange={(e) => setNewPatientForm({...newPatientForm, phone: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="text"
                  placeholder="ИИН"
                  value={newPatientForm.iin}
                  onChange={(e) => setNewPatientForm({...newPatientForm, iin: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="date"
                  placeholder="Дата рождения"
                  value={newPatientForm.birth_date}
                  onChange={(e) => setNewPatientForm({...newPatientForm, birth_date: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <select
                  value={newPatientForm.gender}
                  onChange={(e) => setNewPatientForm({...newPatientForm, gender: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Пол</option>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
                <select
                  value={newPatientForm.source}
                  onChange={(e) => setNewPatientForm({...newPatientForm, source: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="walk_in">Обращение в клинику</option>
                  <option value="phone">Телефонный звонок</option>
                  <option value="referral">Направление врача</option>
                  <option value="website">Веб-сайт</option>
                  <option value="social_media">Социальные сети</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Кто направил"
                  value={newPatientForm.referrer}
                  onChange={(e) => setNewPatientForm({...newPatientForm, referrer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateNewPatient}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Создать пациента
              </button>
            </div>
          )}
          
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата приема *</label>
              <input
                type="date"
                value={appointmentForm.appointment_date}
                onChange={(e) => setAppointmentForm({...appointmentForm, appointment_date: e.target.value})}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Время начала *</label>
              <input
                type="time"
                value={appointmentForm.appointment_time}
                onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Время окончания</label>
              <input
                type="time"
                value={appointmentForm.end_time || ''}
                onChange={(e) => setAppointmentForm({...appointmentForm, end_time: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Кресло</label>
              <input
                type="text"
                placeholder="Номер кресла"
                value={appointmentForm.chair_number || ''}
                onChange={(e) => setAppointmentForm({...appointmentForm, chair_number: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₸)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={appointmentForm.price || ''}
                onChange={(e) => setAppointmentForm({...appointmentForm, price: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Причина обращения</label>
            <input
              type="text"
              placeholder="Причина визита"
              value={appointmentForm.reason}
              onChange={(e) => setAppointmentForm({...appointmentForm, reason: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Заметки о записи</label>
              <textarea
                placeholder="Заметки о записи"
                value={appointmentForm.notes}
                onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows="3"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Заметки о пациенте</label>
              <textarea
                placeholder="Заметки о пациенте"
                value={appointmentForm.patient_notes || ''}
                onChange={(e) => setAppointmentForm({...appointmentForm, patient_notes: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows="3"
              />
            </div>
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