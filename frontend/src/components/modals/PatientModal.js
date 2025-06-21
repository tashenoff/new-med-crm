import React from 'react';

const PatientModal = ({ 
  show, 
  onClose, 
  onSave, 
  patientForm, 
  setPatientForm, 
  editingItem, 
  loading, 
  errorMessage 
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать пациента' : 'Новый пациент'}
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            placeholder="Полное имя *"
            value={patientForm.full_name}
            onChange={(e) => setPatientForm({...patientForm, full_name: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            required
          />
          
          <input
            type="tel"
            placeholder="Телефон *"
            value={patientForm.phone}
            onChange={(e) => setPatientForm({...patientForm, phone: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            required
          />
          
          <input
            type="text"
            placeholder="ИИН"
            value={patientForm.iin}
            onChange={(e) => setPatientForm({...patientForm, iin: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          />
          
          <select
            value={patientForm.source}
            onChange={(e) => setPatientForm({...patientForm, source: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="phone">Телефонный звонок</option>
            <option value="walk_in">Обращение в клинику</option>
            <option value="referral">Направление врача</option>
            <option value="other">Другое</option>
          </select>
          
          <textarea
            placeholder="Заметки"
            value={patientForm.notes}
            onChange={(e) => setPatientForm({...patientForm, notes: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            rows="3"
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
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

export default PatientModal;