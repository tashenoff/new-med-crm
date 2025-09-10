import React from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';

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
    <Modal 
      show={show} 
      onClose={onClose}
      title="💊 Назначить лекарство"
      errorMessage={errorMessage}
      size="max-w-md"
    >
        
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            placeholder="Название лекарства *"
            value={medicationForm.medication_name || ''}
            onChange={(e) => setMedicationForm({...medicationForm, medication_name: e.target.value})}
            className={inputClasses}
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Дозировка (например: 10 мг)"
              value={medicationForm.dosage || ''}
              onChange={(e) => setMedicationForm({...medicationForm, dosage: e.target.value})}
              className={inputClasses}
            />
            <input
              type="text"
              placeholder="Частота (например: 2 раза в день)"
              value={medicationForm.frequency || ''}
              onChange={(e) => setMedicationForm({...medicationForm, frequency: e.target.value})}
              className={inputClasses}
            />
          </div>
          
          <input
            type="date"
            placeholder="Окончание приема"
            value={medicationForm.end_date || ''}
            onChange={(e) => setMedicationForm({...medicationForm, end_date: e.target.value})}
            className={inputClasses}
          />
          
          <textarea
            placeholder="Инструкции по применению"
            value={medicationForm.instructions || ''}
            onChange={(e) => setMedicationForm({...medicationForm, instructions: e.target.value})}
            className={inputClasses}
            rows="3"
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Назначение...' : 'Назначить лекарство'}
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

export default MedicationModal;




