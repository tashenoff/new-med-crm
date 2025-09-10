import React from 'react';

const MedicalEntryModal = ({ 
  show, 
  onClose, 
  onSave, 
  medicalEntryForm, 
  setMedicalEntryForm, 
  loading, 
  errorMessage 
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-indigo-700">
          📝 Добавить запись о приеме
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <select
            value={medicalEntryForm.entry_type || 'visit'}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, entry_type: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="visit">Визит/Осмотр</option>
            <option value="treatment">Лечение</option>
            <option value="note">Заметка врача</option>
          </select>
          
          <input
            type="text"
            placeholder="Заголовок записи *"
            value={medicalEntryForm.title || ''}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, title: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            required
          />
          
          <textarea
            placeholder="Описание приема, симптомы, проведенные процедуры..."
            value={medicalEntryForm.description || ''}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, description: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            rows="4"
            required
          />
          
          <select
            value={medicalEntryForm.severity || ''}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, severity: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Без указания важности</option>
            <option value="low">Низкая важность</option>
            <option value="medium">Средняя важность</option>
            <option value="high">Высокая важность</option>
            <option value="critical">Критическая важность</option>
          </select>
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Добавление...' : 'Добавить запись'}
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

export default MedicalEntryModal;




