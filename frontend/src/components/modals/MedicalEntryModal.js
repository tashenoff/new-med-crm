import React from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';

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
    <Modal 
      show={show} 
      onClose={onClose}
      title="📝 Добавить запись о приеме"
      errorMessage={errorMessage}
      size="max-w-md"
    >
        
        <form onSubmit={onSave} className="space-y-4">
          <select
            value={medicalEntryForm.entry_type || 'visit'}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, entry_type: e.target.value})}
            className={selectClasses}
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
            className={selectClasses}
            required
          />
          
          <textarea
            placeholder="Описание приема, симптомы, проведенные процедуры..."
            value={medicalEntryForm.description || ''}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, description: e.target.value})}
            className={selectClasses}
            rows="4"
            required
          />
          
          <select
            value={medicalEntryForm.severity || ''}
            onChange={(e) => setMedicalEntryForm({...medicalEntryForm, severity: e.target.value})}
            className={selectClasses}
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
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Добавление...' : 'Добавить запись'}
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

export default MedicalEntryModal;




