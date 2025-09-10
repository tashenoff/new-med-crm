import React from 'react';
import Modal from './Modal';
import { inputClasses, textareaClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';

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
    <Modal 
      show={show} 
      onClose={onClose}
      title="🩺 Добавить диагноз"
      errorMessage={errorMessage}
      size="max-w-md"
    >
        
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            placeholder="Название диагноза *"
            value={diagnosisForm.diagnosis_name || ''}
            onChange={(e) => setDiagnosisForm({...diagnosisForm, diagnosis_name: e.target.value})}
            className={inputClasses}
            required
          />
          
          <input
            type="text"
            placeholder="Код МКБ-10 (например: I10)"
            value={diagnosisForm.diagnosis_code || ''}
            onChange={(e) => setDiagnosisForm({...diagnosisForm, diagnosis_code: e.target.value})}
            className={inputClasses}
          />
          
          <textarea
            placeholder="Описание диагноза"
            value={diagnosisForm.description || ''}
            onChange={(e) => setDiagnosisForm({...diagnosisForm, description: e.target.value})}
            className={inputClasses}
            rows="3"
          />
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Добавление...' : 'Добавить диагноз'}
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

export default DiagnosisModal;




