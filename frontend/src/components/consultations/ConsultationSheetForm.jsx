import React, { useState, useEffect } from 'react';
import { inputClasses, textareaClasses, buttonSuccessClasses, buttonSecondaryClasses } from '../modals/modalUtils';
import ServiceAutocomplete from './ServiceAutocomplete';

const ConsultationSheetForm = ({ patientId, onSave, onCancel, editingSheet = null }) => {
  const [doctors, setDoctors] = useState([]);
  const [icd10Query, setIcd10Query] = useState('');
  const [icd10Results, setIcd10Results] = useState([]);
  const [showIcd10Dropdown, setShowIcd10Dropdown] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [visibleFields, setVisibleFields] = useState({
    complaints: true,
    anamnesis_morbi: true,
    anamnesis_vitae: true,
    local_status: true,
    examination: true,
    icd10_codes: true,
    diagnosis: true,
    treatment: true,
    recommendations: true,
    notes: true
  });
  const [form, setForm] = useState({
    patient_id: patientId,
    doctor_id: '',
    complaints: '',
    anamnesis_morbi: '',
    anamnesis_vitae: '',
    local_status: '',
    examination: '',
    icd10_codes: [],
    diagnosis: '',
    recommendations: '',
    treatment_services: [],
    treatment: '',
    notes: ''
  });

  const toggleFieldVisibility = (fieldName) => {
    setVisibleFields({
      ...visibleFields,
      [fieldName]: !visibleFields[fieldName]
    });
  };

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    fetchDoctors();
    if (editingSheet) {
      setForm({
        patient_id: editingSheet.patient_id,
        doctor_id: editingSheet.doctor_id,
        complaints: editingSheet.complaints || '',
        anamnesis_morbi: editingSheet.anamnesis_morbi || '',
        anamnesis_vitae: editingSheet.anamnesis_vitae || '',
        local_status: editingSheet.local_status || '',
        examination: editingSheet.examination || '',
        icd10_codes: editingSheet.icd10_codes || [],
        diagnosis: editingSheet.diagnosis || '',
        recommendations: editingSheet.recommendations || '',
        treatment_services: editingSheet.treatment_services || [],
        treatment: editingSheet.treatment || '',
        notes: editingSheet.notes || ''
      });
    }
  }, [editingSheet]);

  const fetchDoctors = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDoctors(data);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const searchIcd10 = async (query) => {
    if (!query || query.length < 1) {
      setIcd10Results([]);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/icd10/search?query=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIcd10Results(data);
      }
    } catch (error) {
      console.error('Error searching ICD-10:', error);
    }
  };

  const handleIcd10QueryChange = (e) => {
    const query = e.target.value;
    setIcd10Query(query);
    setShowIcd10Dropdown(true);
    searchIcd10(query);
  };

  const addIcd10Code = (code) => {
    // Проверка, не добавлен ли уже этот код
    const alreadyAdded = form.icd10_codes.find(c => c.code === code.code);
    if (!alreadyAdded) {
      setForm({
        ...form,
        icd10_codes: [...form.icd10_codes, code]
      });
    }
    setIcd10Query('');
    setShowIcd10Dropdown(false);
    setIcd10Results([]);
  };

  const removeIcd10Code = (code) => {
    setForm({
      ...form,
      icd10_codes: form.icd10_codes.filter(c => c.code !== code)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Валидация: услуги обязательны
    if (form.treatment_services.length === 0) {
      setServicesError('Необходимо добавить хотя бы одну услугу из прайса');
      return;
    }
    
    setServicesError('');
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Врач */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Врач *
        </label>
        <select
          value={form.doctor_id}
          onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
          className={inputClasses}
          required
        >
          <option value="">Выберите врача</option>
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.full_name} - {doctor.specialty}
            </option>
          ))}
        </select>
      </div>

      {/* Жалобы */}
      {visibleFields.complaints && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Жалобы
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('complaints')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.complaints}
            onChange={(e) => setForm({ ...form, complaints: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="Опишите жалобы пациента..."
          />
        </div>
      )}

      {/* Анамнез заболевания */}
      {visibleFields.anamnesis_morbi && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Анамнез заболевания
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('anamnesis_morbi')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.anamnesis_morbi}
            onChange={(e) => setForm({ ...form, anamnesis_morbi: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="История развития заболевания..."
          />
        </div>
      )}

      {/* Анамнез жизни */}
      {visibleFields.anamnesis_vitae && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Анамнез жизни
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('anamnesis_vitae')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.anamnesis_vitae}
            onChange={(e) => setForm({ ...form, anamnesis_vitae: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="Условия жизни, перенесённые заболевания, вредные привычки..."
          />
        </div>
      )}

      {/* Локальный статус */}
      {visibleFields.local_status && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Локальный статус
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('local_status')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.local_status}
            onChange={(e) => setForm({ ...form, local_status: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="Описание локального статуса..."
          />
        </div>
      )}

      {/* Объективный осмотр */}
      {visibleFields.examination && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Объективный осмотр
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('examination')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.examination}
            onChange={(e) => setForm({ ...form, examination: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="Результаты осмотра..."
          />
        </div>
      )}

      {/* МКБ-10 */}
      {visibleFields.icd10_codes && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Коды МКБ-10
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('icd10_codes')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          
          {/* Добавленные коды */}
          {form.icd10_codes.length > 0 && (
            <div className="mb-2 space-y-1">
              {form.icd10_codes.map((code) => (
                <div 
                  key={code.code} 
                  className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2"
                >
                  <div>
                    <span className="font-medium text-blue-900">{code.code}</span>
                    <span className="text-gray-700 ml-2">{code.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeIcd10Code(code.code)}
                    className="text-red-600 hover:text-red-800 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Поле поиска */}
          <div className="relative">
            <input
              type="text"
              value={icd10Query}
              onChange={handleIcd10QueryChange}
              onFocus={() => setShowIcd10Dropdown(true)}
              className={inputClasses}
              placeholder="Введите код или название диагноза (например, K02 или кариес)..."
            />
            
            {/* Dropdown с результатами */}
            {showIcd10Dropdown && icd10Results.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {icd10Results.map((code) => (
                  <button
                    key={code.code}
                    type="button"
                    onClick={() => addIcd10Code(code)}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium text-blue-900">{code.code}</div>
                    <div className="text-sm text-gray-700">{code.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Начните вводить код или название для поиска в справочнике МКБ-10
          </p>
        </div>
      )}

      {/* Диагноз */}
      {visibleFields.diagnosis && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Диагноз
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('diagnosis')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.diagnosis}
            onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
            className={textareaClasses}
            rows="2"
            placeholder="Заключительный диагноз..."
          />
        </div>
      )}

      {/* Назначенные услуги из прайса */}
      <div className="border-t border-gray-200 pt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Назначить услуги из прайса <span className="text-red-500">*</span>
        </label>
        
        {/* Сообщение об ошибке */}
        {servicesError && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {servicesError}
          </div>
        )}
        
        {/* Добавленные услуги */}
        {form.treatment_services.length > 0 && (
          <div className="mb-3 bg-gray-50 rounded-lg p-3 space-y-2">
            {form.treatment_services.map((service, index) => (
              <div 
                key={index} 
                className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{service.service_name}</div>
                  <div className="text-sm text-gray-600">
                    {service.price_per_unit.toLocaleString()} ₸ × {service.quantity} = {service.total_price.toLocaleString()} ₸
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    value={service.quantity}
                    onChange={(e) => {
                      const newQuantity = parseInt(e.target.value) || 1;
                      const newServices = [...form.treatment_services];
                      newServices[index] = {
                        ...service,
                        quantity: newQuantity,
                        total_price: service.price_per_unit * newQuantity
                      };
                      setForm({ ...form, treatment_services: newServices });
                    }}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        ...form,
                        treatment_services: form.treatment_services.filter((_, i) => i !== index)
                      });
                    }}
                    className="text-red-600 hover:text-red-800 p-1"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            <div className="text-right font-semibold text-gray-900 pt-2 border-t border-gray-200">
              Итого: {form.treatment_services.reduce((sum, s) => sum + s.total_price, 0).toLocaleString()} ₸
            </div>
          </div>
        )}

        {/* Автодополнение для добавления услуг */}
        <ServiceAutocomplete
          onAddService={(service) => {
            setServicesError(''); // Сбрасываем ошибку при добавлении услуги
            setForm({
              ...form,
              treatment_services: [...form.treatment_services, service]
            });
          }}
        />
        <p className="text-xs text-gray-500 mt-1">
          Добавьте услуги, которые автоматически создадут план лечения
        </p>
      </div>

      {/* Текстовые рекомендации */}
      {visibleFields.recommendations && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Дополнительные рекомендации для пациента
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('recommendations')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.recommendations}
            onChange={(e) => setForm({ ...form, recommendations: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="Соблюдать постельный режим, пить много жидкости..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Рекомендации по образу жизни, режиму, питанию и т.д.
          </p>
        </div>
      )}

      {/* Назначенное лечение */}
      {visibleFields.treatment && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Назначенное лечение
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('treatment')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.treatment}
            onChange={(e) => setForm({ ...form, treatment: e.target.value })}
            className={textareaClasses}
            rows="3"
            placeholder="План лечения..."
          />
        </div>
      )}

      {/* Дополнительные заметки */}
      {visibleFields.notes && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              Дополнительные заметки
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('notes')}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Скрыть поле"
            >
              ✕
            </button>
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={textareaClasses}
            rows="2"
            placeholder="Заметки..."
          />
        </div>
      )}

      {/* Панель восстановления скрытых полей */}
      {(!visibleFields.complaints || !visibleFields.anamnesis_morbi || !visibleFields.anamnesis_vitae || !visibleFields.local_status || !visibleFields.examination || 
        !visibleFields.icd10_codes || !visibleFields.diagnosis || !visibleFields.treatment || 
        !visibleFields.recommendations || !visibleFields.notes) && (
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-700 mb-2">Скрытые поля:</div>
          <div className="flex flex-wrap gap-2">
            {!visibleFields.complaints && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('complaints')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Жалобы
              </button>
            )}
            {!visibleFields.anamnesis_morbi && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('anamnesis_morbi')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Анамнез заболевания
              </button>
            )}
            {!visibleFields.anamnesis_vitae && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('anamnesis_vitae')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Анамнез жизни
              </button>
            )}
            {!visibleFields.local_status && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('local_status')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Локальный статус
              </button>
            )}
            {!visibleFields.examination && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('examination')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Объективный осмотр
              </button>
            )}
            {!visibleFields.icd10_codes && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('icd10_codes')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Коды МКБ-10
              </button>
            )}
            {!visibleFields.diagnosis && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('diagnosis')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Диагноз
              </button>
            )}
            {!visibleFields.treatment && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('treatment')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Назначенное лечение
              </button>
            )}
            {!visibleFields.recommendations && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('recommendations')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Рекомендации
              </button>
            )}
            {!visibleFields.notes && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('notes')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                + Заметки
              </button>
            )}
          </div>
        </div>
      )}

      {/* Кнопки */}
      <div className="flex space-x-3 pt-4">
        <button
          type="submit"
          className={`flex-1 ${buttonSuccessClasses}`}
          data-guide="create-treatment-plan-btn"
        >
          {editingSheet ? 'Обновить' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 ${buttonSecondaryClasses}`}
        >
          Отмена
        </button>
      </div>
    </form>
  );
};

export default ConsultationSheetForm;
