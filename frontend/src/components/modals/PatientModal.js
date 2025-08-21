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
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать пациента' : 'Новый пациент'}
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="ИИН"
              value={patientForm.iin || ''}
              onChange={(e) => setPatientForm({...patientForm, iin: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
            
            <input
              type="date"
              placeholder="Дата рождения"
              value={patientForm.birth_date || ''}
              onChange={(e) => setPatientForm({...patientForm, birth_date: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <select
              value={patientForm.gender || ''}
              onChange={(e) => setPatientForm({...patientForm, gender: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="">Выберите пол</option>
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
              <option value="other">Другой</option>
            </select>
            
            <input
              type="text"
              placeholder="Кто направил пациента"
              value={patientForm.referrer || ''}
              onChange={(e) => setPatientForm({...patientForm, referrer: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          <select
            value={patientForm.source}
            onChange={(e) => setPatientForm({...patientForm, source: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="phone">Телефонный звонок</option>
            <option value="walk_in">Обращение в клинику</option>
            <option value="referral">Направление врача</option>
            <option value="website">Веб-сайт</option>
            <option value="social_media">Социальные сети</option>
            <option value="other">Другое</option>
          </select>

          {editingItem && (
            <div>
              <h4 className="text-md font-semibold mb-2">Финансовая информация</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Выручка (₸)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={patientForm.revenue || 0}
                    onChange={(e) => setPatientForm({...patientForm, revenue: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Долг (₸)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={patientForm.debt || 0}
                    onChange={(e) => setPatientForm({...patientForm, debt: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Переплата (₸)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={patientForm.overpayment || 0}
                    onChange={(e) => setPatientForm({...patientForm, overpayment: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Количество приемов</label>
                  <input
                    type="number"
                    min="0"
                    value={patientForm.appointments_count || 0}
                    onChange={(e) => setPatientForm({...patientForm, appointments_count: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Количество записей</label>
                  <input
                    type="number"
                    min="0"
                    value={patientForm.records_count || 0}
                    onChange={(e) => setPatientForm({...patientForm, records_count: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>
          )}
          
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