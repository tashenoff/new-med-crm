import React from 'react';

const MedicalRecordModal = ({ 
  show, 
  onClose, 
  onSave, 
  medicalRecordForm, 
  setMedicalRecordForm, 
  loading, 
  errorMessage 
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-blue-700">
          ✏️ Редактирование медицинской карты
        </h3>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-800">
            Обновите медицинские данные пациента. Все поля необязательны для заполнения.
          </p>
        </div>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Группа крови (например: A+)"
              value={medicalRecordForm.blood_type || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, blood_type: e.target.value})}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Рост (см)"
              value={medicalRecordForm.height || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, height: e.target.value})}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <input
              type="number"
              placeholder="Вес (кг)"
              value={medicalRecordForm.weight || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, weight: e.target.value})}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Номер страховки"
              value={medicalRecordForm.insurance_number || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, insurance_number: e.target.value})}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <input
            type="text"
            placeholder="Экстренный контакт (ФИО)"
            value={medicalRecordForm.emergency_contact || ''}
            onChange={(e) => setMedicalRecordForm({...medicalRecordForm, emergency_contact: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          
          <input
            type="tel"
            placeholder="Телефон экстренного контакта"
            value={medicalRecordForm.emergency_phone || ''}
            onChange={(e) => setMedicalRecordForm({...medicalRecordForm, emergency_phone: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить изменения'}
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

export default MedicalRecordModal;


