import React from 'react';

const MedicationModal = ({ 
  show, 
  onClose, 
  onSave, 
  medicationForm, 
  setMedicationForm, 
  loading, 
  errorMessage 
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-green-700">
          💊 Назначить лекарство
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            placeholder="Название лекарства *"
            value={medicationForm.medication_name || ''}
            onChange={(e) => setMedicationForm({...medicationForm, medication_name: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Дозировка (например: 10 мг)"
              value={medicationForm.dosage || ''}
              onChange={(e) => setMedicationForm({...medicationForm, dosage: e.target.value})}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
            <input
              type="text"
              placeholder="Частота (например: 2 раза в день)"
              value={medicationForm.frequency || ''}
              onChange={(e) => setMedicationForm({...medicationForm, frequency: e.target.value})}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          <input
            type="date"
            placeholder="Окончание приема"
            value={medicationForm.end_date || ''}
            onChange={(e) => setMedicationForm({...medicationForm, end_date: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          />
          
          <textarea
            placeholder="Инструкции по применению"
            value={medicationForm.instructions || ''}
            onChange={(e) => setMedicationForm({...medicationForm, instructions: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            rows="3"
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Назначение...' : 'Назначить лекарство'}
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

export default MedicationModal;


