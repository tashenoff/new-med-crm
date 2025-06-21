import React from 'react';

const DiagnosisModal = ({ 
  show, 
  onClose, 
  onSave, 
  diagnosisForm, 
  setDiagnosisForm, 
  loading, 
  errorMessage 
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-purple-700">
          🩺 Добавить диагноз
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            placeholder="Название диагноза *"
            value={diagnosisForm.diagnosis_name}
            onChange={(e) => setDiagnosisForm({...diagnosisForm, diagnosis_name: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            required
          />
          
          <input
            type="text"
            placeholder="Код МКБ-10 (например: I10)"
            value={diagnosisForm.diagnosis_code}
            onChange={(e) => setDiagnosisForm({...diagnosisForm, diagnosis_code: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          />
          
          <textarea
            placeholder="Описание диагноза"
            value={diagnosisForm.description}
            onChange={(e) => setDiagnosisForm({...diagnosisForm, description: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            rows="3"
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Добавление...' : 'Добавить диагноз'}
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

export default DiagnosisModal;