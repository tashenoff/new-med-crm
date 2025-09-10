import React from 'react';
import Modal from './Modal';
import { inputClasses, textareaClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';

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
    <Modal 
      show={show} 
      onClose={onClose}
      title="✏️ Редактирование медицинской карты"
      errorMessage={errorMessage}
      size="max-w-md"
    >
        
        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Обновите медицинские данные пациента. Все поля необязательны для заполнения.
          </p>
        </div>
        
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Группа крови (например: A+)"
              value={medicalRecordForm.blood_type || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, blood_type: e.target.value})}
              className={inputClasses}
            />
            <input
              type="number"
              placeholder="Рост (см)"
              value={medicalRecordForm.height || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, height: e.target.value})}
              className={inputClasses}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <input
              type="number"
              placeholder="Вес (кг)"
              value={medicalRecordForm.weight || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, weight: e.target.value})}
              className={inputClasses}
            />
            <input
              type="text"
              placeholder="Номер страховки"
              value={medicalRecordForm.insurance_number || ''}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, insurance_number: e.target.value})}
              className={inputClasses}
            />
          </div>
          
          <input
            type="text"
            placeholder="Экстренный контакт (ФИО)"
            value={medicalRecordForm.emergency_contact || ''}
            onChange={(e) => setMedicalRecordForm({...medicalRecordForm, emergency_contact: e.target.value})}
            className={textareaClasses}
          />
          
          <input
            type="tel"
            placeholder="Телефон экстренного контакта"
            value={medicalRecordForm.emergency_phone || ''}
            onChange={(e) => setMedicalRecordForm({...medicalRecordForm, emergency_phone: e.target.value})}
            className={textareaClasses}
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 ${buttonSecondaryClasses}`}
            >
              Отмена
            </button>
          </div>
        </form>
    </Modal>
  );
};

export default MedicalRecordModal;


