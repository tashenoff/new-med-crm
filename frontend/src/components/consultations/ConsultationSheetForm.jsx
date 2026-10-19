import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { inputClasses, textareaClasses, buttonSuccessClasses, buttonSecondaryClasses } from '../modals/modalUtils';
import Modal from '../modals/Modal';
import ServiceCheckboxSelector from './ServiceCheckboxSelector';

const ConsultationSheetForm = ({ patientId, onSave, onSaved, onCancel, editingSheet = null }) => {
  const [showServicePicker, setShowServicePicker] = useState(false);
  const servicePickerRef = useRef(null);
  const servicePickerButtonRef = useRef(null);
  const closeServicePicker = () => { setShowServicePicker(false); servicePickerButtonRef.current?.focus(); };
  useEffect(() => {
    if (showServicePicker) servicePickerRef.current?.querySelector('input,button,select')?.focus();
  }, [showServicePicker]);
  const [doctors, setDoctors] = useState([]);
  const [icd10Query, setIcd10Query] = useState('');
  const [icd10Results, setIcd10Results] = useState([]);
  const [showIcd10Dropdown, setShowIcd10Dropdown] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [persisted, setPersisted] = useState(false);
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

  const alreadyAddedServiceIds = useMemo(
    () => form.treatment_services.map((s) => s.service_id),
    [form.treatment_services]
  );

  const handleAddServices = useCallback((services) => {
    setServicesError('');
    setForm((prev) => ({
      ...prev,
      treatment_services: [...prev.treatment_services, ...services]
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || persisted) return;

    // Валидация: услуги обязательны
    if (form.treatment_services.length === 0) {
      setServicesError('Необходимо добавить хотя бы одну услугу из прайса');
      return;
    }

    setServicesError('');

    setSubmitError('');
    setSaving(true);
    let planSaved = false;
    try {
      const saved = await onSave(form);
      if (saved === false) throw new Error('Не удалось сохранить консультацию и план лечения');
      planSaved = true;
      setPersisted(true);
      const token = localStorage.getItem('token');
      for (const svc of form.treatment_services) {
        for (const slot of svc.scheduling?.slots || []) {
          const response = await fetch(`${API}/api/appointments`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_id: form.patient_id,
              doctor_id: slot.doctor_id,
              appointment_date: slot.date,
              appointment_time: slot.start_time,
              end_time: slot.end_time || null,
              service_id: slot.service_id,
              complex_id: svc.service_id,
              complex_name: svc.service_name,
              price: slot.price || null
            })
          });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail || response.status));
          }
        }
      }
      await onSaved?.();
    } catch (error) {
      setSubmitError((planSaved
        ? 'Консультация и план сохранены, но создание записей не завершено. Проверьте календарь перед повторной записью. '
        : 'Не удалось сохранить консультацию и план лечения. ') + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="curai-consultation-form space-y-4" data-optional-fields-hidden={!visibleFields.recommendations && !visibleFields.treatment && !visibleFields.notes}>
<div className="curai-consultation-fields-scroll"><div className="curai-consultation-form-body space-y-4">
      {submitError && <div role="alert" className="text-curai-negative text-sm">{submitError}</div>}
      {/* Врач */}
      <div>
        <label className="block text-sm font-medium text-curai-ink mb-1">
          Врач и специальность *
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
      <section className="curai-consultation-clinical"><h4>Клинические данные</h4><div className="curai-consultation-form-grid">
{visibleFields.complaints && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Жалобы
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('complaints')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
{visibleFields.anamnesis_morbi && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Анамнез заболевания
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('anamnesis_morbi')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
{visibleFields.anamnesis_vitae && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Анамнез жизни
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('anamnesis_vitae')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
{visibleFields.examination && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Объективный осмотр
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('examination')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
{visibleFields.local_status && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Локальный статус
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('local_status')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
{visibleFields.diagnosis && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Диагноз
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('diagnosis')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
</div></section>

      {/* Анамнез заболевания */}


      {/* Анамнез жизни */}


      {/* Объективный осмотр */}


      {/* Локальный статус */}


      {/* МКБ-10 */}
      {visibleFields.icd10_codes && (
        <div className="curai-consultation-icd">
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Коды МКБ-10
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('icd10_codes')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
                  className="flex items-center justify-between bg-curai-selected border border-curai-control rounded px-3 py-2"
                >
                  <div>
                    <span className="font-medium text-curai-blue">{code.code}</span>
                    <span className="text-curai-ink ml-2">{code.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeIcd10Code(code.code)}
                    className="text-curai-negative hover:text-curai-negative ml-2"
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
              <div className="absolute z-10 w-full mt-1 bg-curai-surface border border-curai-control rounded-md shadow-none max-h-60 overflow-y-auto">
                {icd10Results.map((code) => (
                  <button
                    key={code.code}
                    type="button"
                    onClick={() => addIcd10Code(code)}
                    className="w-full text-left px-4 py-2 hover:bg-curai-selected border-b border-curai-border last:border-b-0"
                  >
                    <div className="font-medium text-curai-blue">{code.code}</div>
                    <div className="text-sm text-curai-ink">{code.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-curai-muted mt-1">
            Начните вводить код или название для поиска в справочнике МКБ-10
          </p>
        </div>
      )}

      {/* Диагноз */}


      {/* Назначенные услуги из прайса */}
      <div className="curai-consultation-service-picker border-t border-curai-border pt-4">
        <label className="block text-sm font-medium text-curai-ink mb-2">
          Назначить услуги из прайса <span className="text-curai-negative">*</span>
        </label>

        {/* Сообщение об ошибке */}
        {servicesError && (
          <div className="mb-2 p-2 bg-curai-negativeBg border border-curai-negative rounded text-sm text-curai-negative">
            {servicesError}
          </div>
        )}

        {/* Добавленные услуги */}
        {form.treatment_services.length > 0 && (<div className="curai-consultation-selected-services"><div className="overflow-x-auto"><table><thead><tr><th>Услуга</th><th>Количество</th><th>Цена</th><th>Сумма</th><th aria-label="Действия" /></tr></thead><tbody>{form.treatment_services.map((service, index) => (<tr key={index}><td>{service.service_name}</td><td><input
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
                    className="w-16 px-2 py-1 border border-curai-control rounded text-center"
                  /></td><td>{service.price_per_unit.toLocaleString()} ₸</td><td>{service.total_price.toLocaleString()} ₸</td><td><button
                    type="button"
                    onClick={() => {
                      setForm({
                        ...form,
                        treatment_services: form.treatment_services.filter((_, i) => i !== index)
                      });
                    }}
                    className="text-curai-negative hover:text-curai-negative p-1"
                  >
                    🗑️
                  </button></td></tr>))}</tbody></table></div><div className="text-right font-semibold text-curai-ink pt-2 border-t border-curai-border">
              Итого: {form.treatment_services.reduce((sum, s) => sum + s.total_price, 0).toLocaleString()} ₸
            </div></div>)}
{form.treatment_services.length === 0 && <p className="curai-consultation-services-empty">Услуги пока не выбраны. Выберите их из прайс-листа.</p>}

        <button ref={servicePickerButtonRef} type="button" className="curai-button curai-button-secondary curai-open-service-picker" onClick={() => setShowServicePicker(true)}>+ Выбрать услуги</button>
        <Modal show={showServicePicker} title="Выбор услуг из прайс-листа" onClose={closeServicePicker} size="max-w-[992px]" className="curai-clinical-service-dialog" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeServicePicker(); } }}><div ref={servicePickerRef}><ServiceCheckboxSelector
          alreadyAddedIds={alreadyAddedServiceIds}
          onAddServices={services => { handleAddServices(services); closeServicePicker(); }}
          onCancel={closeServicePicker}
        /></div></Modal>
        <p className="text-xs text-curai-muted mt-1">
          Отметьте галочками услуги — они автоматически создадут план лечения
        </p>
      </div>

      {/* Текстовые рекомендации */}
      {visibleFields.recommendations && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Дополнительные рекомендации для пациента
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('recommendations')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
          <p className="text-xs text-curai-muted mt-1">
            Рекомендации по образу жизни, режиму, питанию и т.д.
          </p>
        </div>
      )}

      {/* Назначенное лечение */}
      {visibleFields.treatment && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-curai-ink">
              Назначенное лечение
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('treatment')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
            <label className="text-sm font-medium text-curai-ink">
              Дополнительные заметки
            </label>
            <button
              type="button"
              onClick={() => toggleFieldVisibility('notes')}
              className="text-curai-muted hover:text-curai-negative transition-colors"
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
        <div className="bg-curai-subtle border border-curai-control rounded-md p-3">
          <div className="text-sm font-medium text-curai-ink mb-2">Скрытые поля:</div>
          <div className="flex flex-wrap gap-2">
            {!visibleFields.complaints && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('complaints')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Жалобы
              </button>
            )}
            {!visibleFields.anamnesis_morbi && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('anamnesis_morbi')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Анамнез заболевания
              </button>
            )}
            {!visibleFields.anamnesis_vitae && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('anamnesis_vitae')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Анамнез жизни
              </button>
            )}
            {!visibleFields.examination && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('examination')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Объективный осмотр
              </button>
            )}
            {!visibleFields.local_status && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('local_status')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Локальный статус
              </button>
            )}
            {!visibleFields.icd10_codes && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('icd10_codes')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Коды МКБ-10
              </button>
            )}
            {!visibleFields.diagnosis && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('diagnosis')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Диагноз
              </button>
            )}
            {!visibleFields.treatment && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('treatment')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Назначенное лечение
              </button>
            )}
            {!visibleFields.recommendations && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('recommendations')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Рекомендации
              </button>
            )}
            {!visibleFields.notes && (
              <button
                type="button"
                onClick={() => toggleFieldVisibility('notes')}
                className="px-3 py-1 bg-curai-selected text-curai-blue rounded hover:bg-curai-selected text-sm"
              >
                + Заметки
              </button>
            )}
          </div>
        </div>
      )}

      {/* Кнопки */}
      <button type="button" className="curai-toggle-optional-fields" onClick={() => setVisibleFields(prev => { const show = !prev.recommendations && !prev.treatment && !prev.notes; return {...prev, recommendations:show, treatment:show, notes:show}; })}>{!visibleFields.recommendations && !visibleFields.treatment && !visibleFields.notes ? 'Показать дополнительные поля' : 'Скрыть дополнительные поля'}</button></div></div>
<div className="curai-consultation-form-footer flex space-x-3 pt-4">
        <button
          type="submit"
          disabled={saving || persisted || form.treatment_services.length === 0}
          className={`flex-1 ${buttonSuccessClasses} ${form.treatment_services.length === 0 ? 'cursor-not-allowed' : ''}`}
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
