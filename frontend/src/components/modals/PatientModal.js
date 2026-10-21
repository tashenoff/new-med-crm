import { downloadPatientDocument } from '../../utils/documentDownload';
import { canAction, permissionProps as documentPermissionProps } from '../../utils/permissions';
import PatientTermsStatus from '../patients/PatientTermsStatus';
import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonSuccessClasses, buttonDangerClasses, cardHeaderClasses, tabClasses, tableClasses, tableHeaderClasses, tableRowClasses } from './modalUtils';
import ServiceSelector from '../treatment/ServiceSelector';
import ConsultationSheetForm from '../consultations/ConsultationSheetForm';
import TreatmentPlanView from '../treatment/TreatmentPlanView';
import ServicePaymentList from '../treatment/ServicePaymentList';
import PatientPaymentWorkspace from '../treatment/PatientPaymentWorkspace';
import PatientTreatmentWorkspace from '../treatment/PatientTreatmentWorkspace';
import AppointmentsSchedule from '../treatment/AppointmentsSchedule';
import LabAnalysisPicker from '../patients/LabAnalysisPicker';
import WhatsAppSidebar from '../crm/telephony/WhatsAppSidebar';
import { FaWhatsapp, FaUser, FaStethoscope, FaFileAlt, FaClipboardList, FaCreditCard, FaCalendarAlt, FaChevronDown, FaChevronRight, FaNotesMedical, FaUserMd, FaFileMedical, FaPuzzlePiece, FaFlask } from 'react-icons/fa';
import { useGlobalRefresh } from '../../hooks/useGlobalRefresh';
import { usePhoneInput } from '../../hooks/usePhoneInput';
import { formatPatientPhone } from '../../utils/patientPhone';
import { patientOriginLabel, visiblePatientNotes } from '../../utils/patientOrigin';

const PatientModal = ({
  user,
  show,
  onClose,
  onSave,
  patientForm = {},
  setPatientForm = () => {},
  editingItem = null,
  loading = false,
  errorMessage = null
}) => {
  const [activeTab, setActiveTab] = useState('info');
  const [documents, setDocuments] = useState([]);
  const [treatmentPlans, setTreatmentPlans] = useState([]);
  const [treatmentPatientId, setTreatmentPatientId] = useState(null);
  const [consultationSheets, setConsultationSheets] = useState([]);
  const [showConsultationForm, setShowConsultationForm] = useState(false);
  const [editingConsultation, setEditingConsultation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentDescription, setDocumentDescription] = useState('');

  // Identity belongs to this opening's explicit edit target, never a previous form.
  const currentPatientId = editingItem ? (editingItem.id || editingItem._id) : null;
  const treatmentPatientRef = React.useRef(currentPatientId);
  treatmentPatientRef.current = currentPatientId;
  const currentTreatmentPlans = treatmentPatientId === currentPatientId ? treatmentPlans : [];

    // При создании нового пациента (нет editingItem) всегда начинаем с вкладки "Информация",
    // иначе застрявшая с прошлого открытия вкладка (напр. "Оплата") даёт пустое окно
    React.useEffect(() => {
      if (show && !editingItem) {
        setActiveTab('info');
      }
    }, [show, editingItem]);
    const [planForm, setPlanForm] = useState({
    title: '',
    description: '',
    services: [],
    total_cost: 0,
    status: 'draft',
    notes: '',
    payment_status: 'unpaid',
    paid_amount: 0,
    execution_status: 'pending',
    appointment_ids: []
  });
  const [editingPlan, setEditingPlan] = useState(null);
  const [hasCourseServices, setHasCourseServices] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showWhatsAppHistory, setShowWhatsAppHistory] = useState(false);

  // Состояние загрузки страницы пациента (прелоадер при открытии)
  const [pageLoading, setPageLoading] = useState(false);

  // Состояние для сворачивания/разворачивания консультаций (по умолчанию все развёрнуты)
  const [expandedConsultations, setExpandedConsultations] = useState({});

  // Фильтры для счетов
  const [paymentFilter, setPaymentFilter] = useState('all'); // all, paid, unpaid
  const [procedureFilter, setProcedureFilter] = useState('all'); // all, procedures, non_procedures

  // Источники (каналы привлечения)
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const API = import.meta.env.VITE_BACKEND_URL;

  const patientFormForSession = (form) => {
    const { id, _id, _editingItemId, ...fields } = form;
    return currentPatientId ? { ...fields, id: currentPatientId } : fields;
  };

  const safeSetPatientForm = (updates) => {
    const updatedForm = typeof updates === 'function'
      ? updates(patientForm)
      : { ...patientForm, ...updates };
    setPatientForm(patientFormForSession(updatedForm));
  };

  // Глобальное обновление для синхронизации со страницей пациентов
  const { refreshTreatmentPlans } = useGlobalRefresh();

  // Функция проверки — есть ли пациент с таким номером в базе (как в CRM)
  const checkPatientByPhone = useCallback(async (phone) => {
    console.log('🔍 checkPatientByPhone called with:', phone);
    try {
      const token = localStorage.getItem('token');
      const encodedPhone = encodeURIComponent(phone);
      const url = `${API}/api/crm/leads/check-phone/${encodedPhone}`;
      console.log('🔍 Checking URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      console.log('🔍 Response status:', response.status);
      if (!response.ok) {
        console.log('❌ Response not OK');
        return { patient: null, active_lead: null };
      }

      const result = await response.json();
      console.log('✅ Check result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error checking patient by phone:', error);
      return { patient: null, active_lead: null };
    }
  }, [API]);

  // Хук для форматирования и валидации телефона (с проверкой дубликата в БД)
  const phoneHook = usePhoneInput(
    patientForm.phone,
    (formattedPhone) => {
      safeSetPatientForm({ phone: formattedPhone });
    },
    checkPatientByPhone,
    show ? setPatientForm : null,
    formatPatientPhone
  );

  const hasPhoneMatch = phoneHook.hasMatch && (!currentPatientId ||
    (phoneHook.foundData?.patient?.id || phoneHook.foundData?.patient?._id) !== currentPatientId);

  // Синхронизация хука телефона с внешним patientForm.phone (при редактировании)
  useEffect(() => {
    phoneHook.syncValue(patientForm.phone || '');
  }, [patientForm.phone]);

  // Загрузка данных при открытии модального окна с существующим пациентом
  useEffect(() => {
    if (editingItem && show) {
      setPageLoading(true);
      // Всегда загружаем планы при открытии
      fetchTreatmentPlans();

      if (activeTab === 'documents') {
        fetchDocuments();
      }
      if (activeTab === 'consultations') {
        fetchConsultationSheets();
      }
    } else if (!show) {
      setPageLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, currentPatientId]); // Только при открытии/закрытии модалки

  // Загрузка данных при переключении вкладок
  useEffect(() => {
    if (editingItem && show) {
      if (activeTab === 'payment') {
        fetchTreatmentPlans();
      }
      if (activeTab === 'documents') {
        fetchDocuments();
      }
      if (activeTab === 'consultations') {
        fetchConsultationSheets();
      }
    }
  }, [activeTab, editingItem, show]);

  // Перезагрузить планы когда переключаемся на вкладку консультаций (могли создать новую)
  useEffect(() => {
    if (editingItem && activeTab === 'consultations') {
      // Малая задержка чтобы дать время серверу сохранить план
      const timer = setTimeout(() => {
        fetchTreatmentPlans();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [consultationSheets.length]);

  const fetchDocuments = async () => {
    if (!editingItem) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${editingItem.id}/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const docs = await response.json();
        setDocuments(docs);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchTreatmentPlans = async () => {
    if (!editingItem) return;
    const requestedPatientId = currentPatientId;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${editingItem.id}/treatment-plans`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const plans = await response.json();
        if (treatmentPatientRef.current !== requestedPatientId) return;
        setTreatmentPatientId(requestedPatientId);
        setTreatmentPlans(plans);

        // Проверить наличие курсовых услуг
        const hasCourses = plans.some(plan =>
          plan.services && plan.services.some(service => service.is_course)
        );
        setHasCourseServices(hasCourses);
      }
    } catch (error) {
      console.error('Error fetching treatment plans:', error);
    } finally {
      if (treatmentPatientRef.current === requestedPatientId) setPageLoading(false);
    }
  };

  const fetchConsultationSheets = async () => {
    if (!editingItem) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${editingItem.id}/consultation-sheets`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const sheets = await response.json();
        setConsultationSheets(sheets);
      }
    } catch (error) {
      console.error('Error fetching consultation sheets:', error);
    }
  };

  // Функция для загрузки источников (каналов привлечения)
  const fetchSources = async () => {
    try {
      setLoadingSources(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API}/api/crm/sources/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const sourcesData = await response.json();
        setSources(sourcesData);
      }
    } catch (error) {
      console.error('Error fetching sources:', error);
    } finally {
      setLoadingSources(false);
    }
  };

  // Загрузка источников при открытии модала
  useEffect(() => {
    if (show) {
      fetchSources();
    }
  }, [show]);

  const handleSaveConsultation = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      const url = editingConsultation
        ? `${API}/api/consultation-sheets/${editingConsultation.id}`
        : `${API}/api/patients/${editingItem.id}/consultation-sheets`;

      const response = await fetch(url, {
        method: editingConsultation ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail || response.status));
      }
    } catch (error) {
      console.error('Error saving consultation sheet:', error);
      throw error;
    }
  };

  const handleConsultationSaved = () => {
    setShowConsultationForm(false);
    setEditingConsultation(null);
    fetchConsultationSheets();
    fetchTreatmentPlans();
    refreshTreatmentPlans();
  };

  const handleDeleteConsultation = async (sheetId) => {
    if (!window.confirm('Удалить этот консультационный лист?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/consultation-sheets/${sheetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchConsultationSheets();
      }
    } catch (error) {
      console.error('Error deleting consultation sheet:', error);
    }
  };

  // Печать консультационного листа: открывает новое окно с готовым к печати A4 документом
  const handlePrintConsultation = (sheet) => {
    const patient = editingItem || {};
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    const nl2br = (str) => {
      if (!str) return '';
      return escapeHtml(str).replace(/\n/g, '<br/>');
    };

    const dateStr = sheet.consultation_date
      ? new Date(sheet.consultation_date).toLocaleDateString('ru-RU', {
          year: 'numeric', month: 'long', day: 'numeric'
        })
      : '';

    const icdList = (sheet.icd10_codes || [])
      .map((c) => `<div class="value">${escapeHtml(c.code)} — ${escapeHtml(c.name)}</div>`)
      .join('');

    const servicesList = (sheet.treatment_services || []).map((s) => {
      const main = `<tr>
        <td class="txt">${escapeHtml(s.service_name)}</td>
        <td class="num">${Number(s.quantity || 1)}</td>
        <td class="num">${Number(s.price_per_unit || 0).toLocaleString('ru-RU')}</td>
        <td class="num">${Number(s.total_price || 0).toLocaleString('ru-RU')}</td>
      </tr>`;
      // Для комплекса — состав: перечень услуг с ценой, количеством и скидкой
      let extra = '';
      if (s.is_complex && s.components && s.components.length) {
        const comps = s.components.map((c) => {
          const unit = Number(c.price || 0);
          const qty = Number(c.quantity || 1);
          const sum = unit * qty;
          const disc = (c.discount && c.discount > 0)
            ? `${Number(c.discount)}%`
            : (c.discount_amount && c.discount_amount > 0 ? `−${Number(c.discount_amount).toLocaleString('ru-RU')} ₸` : '');
          return `<div class="comp">
              <span>− ${escapeHtml(c.service_name)}</span>
              <span class="comp-meta">×${qty} · ${sum.toLocaleString('ru-RU')} ₸${disc ? `<i> · скидка ${disc}</i>` : ''}</span>
            </div>`;
        }).join('');
        extra = `<tr><td colspan="4"><div class="comp-list">${comps}</div></td></tr>`;
      }
      return main + extra;
    }).join('');

    const section = (title, content) => {
      if (!content) return '';
      return `
        <div class="section">
          <div class="section-title">${escapeHtml(title)}</div>
          <div class="value">${content}</div>
        </div>`;
    };

    const birthDate = patient.birth_date
      ? new Date(patient.birth_date).toLocaleDateString('ru-RU')
      : '';

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) {
      alert('Разрешите всплывающие окна для печати документа');
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<title>Консультационный лист</title>
<style>
 * { box-sizing: border-box; }
 body {
 font-family: 'Times New Roman', 'Arial', sans-serif;
 font-size: 14px;
 color: #000;
 background: #fff;
 margin: 0;
 padding: 32px;
 }
 @page { size: A4; margin: 20mm; }
 .header {
 text-align: center;
 border-bottom: 2px solid #000;
 padding-bottom: 12px;
 margin-bottom: 18px;
 }
 .header .clinic { font-size: 16px; font-weight: bold; }
 .header .doc-title { font-size: 18px; font-weight: bold; margin-top: 6px; }
 .header .doc-date { font-size: 12px; color: #444; margin-top: 4px; }
 .info-table { width: 100%; margin-bottom: 16px; }
 .info-table td { padding: 4px 10px; vertical-align: top; }
 .info-table .label { font-weight: bold; color: #222; }
 .info-table .label::after { content: ':'; }
 .section { margin-bottom: 10px; page-break-inside: avoid; }
 .section-title {
 font-weight: bold;
 font-size: 14px;
 text-transform: uppercase;
 letter-spacing: 0.3px;
 margin-bottom: 4px;
 border-bottom: 1px solid #999;
 padding-bottom: 2px;
 }
 .value { white-space: normal; line-height: 1.5; margin-bottom: 6px; }
 .comp-list { padding: 4px 6px; background: #f7f7f7; border: 1px dashed #aaa; }
 .comp { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; padding: 2px 0; }
 .comp-meta { color: #333; font-weight: normal; }
 .comp-meta i { color: #b00; font-style: italic; }
 .services-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
 .services-table th, .services-table td {
 border: 1px solid #333;
 padding: 5px 8px;
 font-size: 13px;
 }
 .services-table th { background: #eee; text-align: left; }
 .num { text-align: right; }
 .txt { text-align: left; }
 .icd-item { border: 1px solid #333; padding: 4px 8px; margin: 3px 0; }
 .signature { margin-top: 30px; }
 .signature .line { border-bottom: 1px solid #000; width: 320px; height: 22px; display: inline-block; }
 .signature .caption { font-size: 12px; margin-top: 4px; }
 @media print {
 body { padding: 0; }
 }
</style>
</head>
<body>
 <div class="header">
 <div class="clinic">Медицинский центр</div>
 <div class="doc-title">Консультационный лист</div>
 <div class="doc-date">Дата консультации: ${escapeHtml(dateStr)}</div>
  </div>

  <table class="info-table">
    <tr>
      <td class="label">Пациент</td>
      <td>${escapeHtml(patient.full_name || '')}</td>
      <td class="label">Дата рождения</td>
      <td>${escapeHtml(birthDate)}</td>
    </tr>
    <tr>
      <td class="label">Телефон</td>
      <td>${escapeHtml(patient.phone || '')}</td>
      <td class="label">Врач</td>
      <td>${escapeHtml(sheet.doctor_name || '')}</td>
    </tr>
  </table>

  ${section('Жалобы', nl2br(sheet.complaints))}
  ${section('Анамнез заболевания', nl2br(sheet.anamnesis_morbi || sheet.anamnesis))}
  ${section('Анамнез жизни', nl2br(sheet.anamnesis_vitae))}
  ${section('Объективный осмотр', nl2br(sheet.examination))}
  ${section('Локальный статус', nl2br(sheet.local_status))}
  ${icdList ? `<div class="section"><div class="section-title">МКБ-10</div>${icdList}</div>` : ''}
  ${section('Диагноз', nl2br(sheet.diagnosis))}
  ${section('Назначенное лечение', nl2br(sheet.treatment))}
  ${servicesList ? `
    <div class="section">
      <div class="section-title">Назначенные услуги</div>
      <table class="services-table">
        <thead>
          <tr>
            <th>Услуга</th>
            <th class="num">Кол-во</th>
            <th class="num">Цена</th>
            <th class="num">Сумма</th>
          </tr>
        </thead>
        <tbody>${servicesList}</tbody>
      </table>
    </div>` : ''}
  ${section('Рекомендации', nl2br(sheet.recommendations))}
  ${section('Дополнительные заметки', nl2br(sheet.notes))}

  <div class="section signature">
    <div class="section-title">Подпись врача</div>
    <div class="line"></div>
    <div class="caption">${escapeHtml(sheet.doctor_name || '')}</div>
  </div>
</body>
</html>`);
    printWindow.document.close();

    // Ждём полной отрисовки и открываем диалог печати
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  // Переключение сворачивания/разворачивания карточки консультации
  const toggleConsultation = (sheetId) => {
    setExpandedConsultations(prev => ({
      ...prev,
      [sheetId]: !prev[sheetId]
    }));
  };

  // Компонент сводки оплаты по всем планам лечения
  

  const handleFileUpload = async () => {
    if (!selectedFile || !editingItem) return;

    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (documentDescription) {
        formData.append('description', documentDescription);
      }

      console.log('Uploading file for patient:', editingItem.id);
      console.log('API endpoint:', `${API}/api/patients/${editingItem.id}/documents`);
      console.log('File:', selectedFile);

      const response = await fetch(`${API}/api/patients/${editingItem.id}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Don't set Content-Type - let browser set it automatically for FormData
        },
        body: formData
      });

      console.log('Upload response status:', response.status);

      if (response.ok) {
        setSelectedFile(null);
        setDocumentDescription('');
        fetchDocuments(); // Refresh documents list
        document.getElementById('file-input').value = ''; // Clear file input
        console.log('File uploaded successfully');
      } else {
        const errorText = await response.text();
        console.error('Error uploading file:', response.status, errorText);
        alert(`Ошибка загрузки файла: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Ошибка загрузки файла: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    if (!window.confirm('Удалить этот документ?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchDocuments(); // Refresh documents list
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  // Добавить услугу в план лечения + для комплекса создать записи в календаре
    // (общий обработчик для вкладок «Планы лечения» и «Комплексные услуги»)
    const handleAddServiceToPlan = (serviceItem) => {
      const updatedServices = [...planForm.services, serviceItem];
      const totalCost = updatedServices.reduce((sum, service) => sum + (service.total_price || 0), 0);
      setPlanForm(prev => ({
        ...prev,
        services: updatedServices,
        total_cost: totalCost
      }));

      // Комплексная услуга: создаём записи к специалистам состава
      // на выбранную дату/время (каждая запись связана с компонентом)
      if (editingItem && serviceItem.scheduling && serviceItem.scheduling.slots.length > 0) {
        const token = localStorage.getItem('token');
        const patientId = editingItem.id || editingItem._id;
        serviceItem.scheduling.slots.forEach((slot) => {
          fetch(`${API}/api/appointments`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_id: patientId,
              doctor_id: slot.doctor_id,
              appointment_date: slot.date,
              appointment_time: slot.start_time,
              end_time: slot.end_time,
              service_id: slot.service_id,
              complex_id: serviceItem.service_id,
              complex_name: serviceItem.service_name,
              price: slot.price || null
            })
          }).then((r) => {
            if (!r.ok) { r.json().then((d) => alert('Не удалось создать запись: ' + (d.detail || r.status))).catch(() => alert('Ошибка создания записи: ' + r.status)); }
          }).catch((err) => alert('Ошибка создания записи на комплекс: ' + err.message));
        });
      }
    };

    // Добавить КОМПЛЕКСНУЮ услугу из вкладки «Комплексные услуги»:
    // сразу создаёт счёт (план лечения) в БД + записи в календаре + обновляет списки.
    const handleAddComplexService = async (serviceItem) => {
      if (!editingItem) return;
      const token = localStorage.getItem('token');
      const patientId = editingItem.id || editingItem._id;

      // Сначала создаём записи в календаре (по выбранным слотам специалистов)
      let appointmentCreated = false;
      if (serviceItem.scheduling && serviceItem.scheduling.slots.length > 0) {
        const results = await Promise.all(serviceItem.scheduling.slots.map(async (slot) => {
          try {
            const r = await fetch(`${API}/api/appointments`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                patient_id: patientId,
                doctor_id: slot.doctor_id,
                appointment_date: slot.date,
                appointment_time: slot.start_time,
                end_time: slot.end_time,
                service_id: slot.service_id,
                complex_id: serviceItem.service_id,
                complex_name: serviceItem.service_name,
                price: slot.price || null
              })
            });
            if (!r.ok) { const d = await r.json().catch(() => null); throw new Error((d && d.detail) || r.status); }
            return true;
          } catch (err) {
            alert('Не удалось создать запись: ' + err.message);
            return false;
          }
        }));
        appointmentCreated = results.some(Boolean);
      }

      // Создаём счёт (план лечения) с этой комплексной услугой одной строкой
      const planData = {
        patient_id: patientId,
        title: `Комплексная услуга: ${serviceItem.service_name}`,
        description: '',
        services: [serviceItem],
        total_cost: serviceItem.total_price || 0,
        status: 'draft',
        notes: '',
        payment_status: 'unpaid',
        paid_amount: 0,
        execution_status: 'pending',
        appointment_ids: []
      };

      try {
        const r = await fetch(`${API}/api/patients/${patientId}/treatment-plans`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(planData)
        });
        if (!r.ok) {
                  const d = await r.json().catch(() => null);
                  alert('Не удалось создать счёт: ' + ((d && d.detail) || r.status));
                } else {
                  fetchTreatmentPlans();
                  refreshTreatmentPlans();
                  showSuccess('✅ Комплексная услуга добавлена в план лечения');
                }
              } catch (err) {
                console.error('Ошибка создания счёта:', err);
                alert('Ошибка создания счёта: ' + err.message);
              }
            };

    // Добавить лабораторные анализы из вкладки «Анализы»: сразу создаёт счёт (план лечения)
      // со всеми выбранными анализами и обновляет списки (Планы лечения + Оплата).
      const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 4000);
      };

      const handleAddLabAnalyzes = async (items) => {
    if (!editingItem || !items || items.length === 0) return;
    const token = localStorage.getItem('token');
    const patientId = editingItem.id || editingItem._id;

    const services = items.map(a => ({
      service_id: a.id,
      service_name: a.service_name,
      category: a.category || a.laboratory_name || 'Лаборатория',
      unit: a.unit || 'анализ',
      unit_price: a.price || 0,
      price: a.price || 0,
      quantity: a.quantity || 1,
      total_price: a.price || 0,
      laboratory_id: a.laboratory_id,
      laboratory_name: a.laboratory_name
    }));

    const planData = {
      patient_id: patientId,
      title: `Анализы (${items.length}): ${new Date().toLocaleDateString('ru-RU')}`,
      description: '',
      services,
      total_cost: services.reduce((s, x) => s + (x.total_price || 0), 0),
      status: 'draft',
      notes: '',
      payment_status: 'unpaid',
      paid_amount: 0,
      execution_status: 'pending',
      appointment_ids: []
    };

    try {
      const r = await fetch(`${API}/api/patients/${patientId}/treatment-plans`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(planData)
      });
      if (!r.ok) {
              const d = await r.json().catch(() => null);
              alert('Не удалось создать счёт: ' + ((d && d.detail) || r.status));
            } else {
              fetchTreatmentPlans();
              refreshTreatmentPlans();
              showSuccess('✅ Анализы добавлены в план лечения');
            }
          } catch (err) {
            console.error('Ошибка создания счёта анализов:', err);
            alert('Ошибка создания счёта: ' + err.message);
          }
        };

  const handleSaveTreatmentPlan = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const token = localStorage.getItem('token');
      const url = editingPlan
        ? `${API}/api/treatment-plans/${editingPlan.id}`
        : `${API}/api/patients/${editingItem.id}/treatment-plans`;

      const response = await fetch(url, {
        method: editingPlan ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(planForm)
      });

      if (response.ok) {
        setPlanForm({
          title: '',
          description: '',
          services: [],
          total_cost: 0,
          status: 'draft',
          notes: '',
          payment_status: 'unpaid',
          paid_amount: 0,
          execution_status: 'pending',
          appointment_ids: []
        });
        setEditingPlan(null);
        await fetchTreatmentPlans();
        refreshTreatmentPlans();
      } else {
        const error = await response.json().catch(() => ({}));
        const detail = typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail || error);
        throw new Error(`HTTP ${response.status}: ${detail || 'Не удалось сохранить план'}`);
      }
    } catch (error) {
      console.error('Error saving treatment plan:', error);
      alert('Ошибка сохранения плана: ' + error.message);
    }
  };

  const handleEditTreatmentPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      title: plan.title,
      description: plan.description || '',
      services: plan.services || [],
      total_cost: plan.total_cost || 0,
      status: plan.status,
      notes: plan.notes || '',
      payment_status: plan.payment_status || 'unpaid',
      paid_amount: plan.paid_amount || 0,
      execution_status: plan.execution_status || 'pending',
      appointment_ids: plan.appointment_ids || []
    });
  };

  const handleDeleteTreatmentPlan = async (planId) => {
    if (!window.confirm('Удалить этот счет?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/treatment-plans/${planId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchTreatmentPlans(); // Refresh plans list
      }
    } catch (error) {
      console.error('Error deleting treatment plan:', error);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!editingItem || !editingItem.phone) {
      alert('У пациента не указан номер телефона');
      return;
    }

    if (!whatsAppMessage.trim()) {
      alert('Введите текст сообщения');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/wazzup/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: editingItem.phone,
          text: whatsAppMessage
        })
      });

      if (response.ok) {
        alert('✅ Сообщение отправлено успешно!');
        setWhatsAppMessage('');
      } else {
        const error = await response.json();
        alert(`❌ Ошибка: ${error.detail || 'Не удалось отправить сообщение'}`);
      }
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      alert(`❌ Ошибка: ${error.message}`);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  if (!show) return null;

  return (
    <>
    <Modal
      show={show}
      size={['payment','treatment'].includes(activeTab) ? 'max-w-[1240px]' : 'max-w-[1040px]'}
      className={`curai-patient-dialog${['payment','treatment'].includes(activeTab) ? ' curai-patient-workspace-dialog' : ''}${activeTab === 'payment' ? ' curai-patient-payment-dialog' : ''}${activeTab === 'treatment' ? ' curai-patient-treatment-dialog' : ''}`}
      onClose={onClose}
      title={editingItem ? (editingItem.full_name?.trim() || 'Карточка пациента') : 'Новый пациент'}
      errorMessage={errorMessage}
    subheader={activeTab === 'consultations' && showConsultationForm ? null : (<div className="curai-patient-tabbar">
          <nav className="curai-patient-tabs" role="tablist" aria-label="Разделы карточки пациента">
            <button
              onClick={() => setActiveTab('info')}
              className={tabClasses(activeTab === 'info')} role="tab" aria-selected={activeTab === 'info'}
            >
              <span className="flex items-center gap-2">
                <FaUser className="text-sm" />
                <span>Информация</span>
              </span>
            </button>
            {editingItem && (
              <>
                <button
                  onClick={() => setActiveTab('consultations')}
                  className={tabClasses(activeTab === 'consultations')} role="tab" aria-selected={activeTab === 'consultations'}
                  data-guide="consultations-tab"
                >
                  <span className="flex items-center gap-2">
                    <FaStethoscope className="text-sm" />
                    <span>Консультации</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={tabClasses(activeTab === 'documents')} role="tab" aria-selected={activeTab === 'documents'}
                >
                  <span className="flex items-center gap-2">
                    <FaFileAlt className="text-sm" />
                    <span>Документы</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('treatment')}
                  className={tabClasses(activeTab === 'treatment')} role="tab" aria-selected={activeTab === 'treatment'}
                >
                  <span className="flex items-center gap-2">
                    <FaClipboardList className="text-sm" />
                    <span>Планы лечения</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('complex')}
                  className={tabClasses(activeTab === 'complex')} role="tab" aria-selected={activeTab === 'complex'}
                >
                  <span className="flex items-center gap-2">
                    <FaPuzzlePiece className="text-sm" />
                    <span>Комплексные услуги</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('analyzes')}
                  className={tabClasses(activeTab === 'analyzes')} role="tab" aria-selected={activeTab === 'analyzes'}
                >
                  <span className="flex items-center gap-2">
                    <FaFlask className="text-sm" />
                    <span>Анализы</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('payment')}
                  className={tabClasses(activeTab === 'payment')} role="tab" aria-selected={activeTab === 'payment'}
                >
                  <span className="flex items-center gap-2">
                    <FaCreditCard className="text-sm" />
                    <span>Оплата</span>
                  </span>
                </button>
                {hasCourseServices && (
                  <button
                    onClick={() => setActiveTab('appointments')}
                    className={tabClasses(activeTab === 'appointments')} role="tab" aria-selected={activeTab === 'appointments'}
                  >
                    <span className="flex items-center gap-2">
                      <FaCalendarAlt className="text-sm" />
                      <span>Назначения</span>
                    </span>
                  </button>
                )}
              </>
            )}
          </nav>
        </div>)}
    
>

        {/* Tabs */}


        {activeTab === 'info' && <PatientTermsStatus key={currentPatientId || "new"} patientId={currentPatientId} active={show}/>}

        {/* Прелоадер при загрузке данных пациента */}
        {pageLoading && editingItem ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-curai-control border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-curai-muted text-sm">Загрузка данных пациента...</p>
          </div>
        ) : (
          <>
        {/* Tab Content */}
        {activeTab === 'info' && (
          <form onSubmit={event => { if (!canAction(user, "patients_view", "patients_edit")) {event.preventDefault();return;} return ((e) => {
            onSave(e, patientFormForSession(patientForm));
          })(event); }} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="ФИО *"
                value={patientForm.full_name || ''}
                onChange={(e) => safeSetPatientForm({ full_name: e.target.value })}
                className={inputClasses}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="ИИН"
                value={patientForm.iin || ''}
                onChange={(e) => safeSetPatientForm({ iin: e.target.value })}
                className={inputClasses}
              />

              <input
                type="date"
                placeholder="Дата рождения"
                value={patientForm.birth_date || ''}
                onChange={(e) => safeSetPatientForm({ birth_date: e.target.value })}
                className={inputClasses}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                value={patientForm.gender || ''}
                onChange={(e) => safeSetPatientForm({ gender: e.target.value })}
                className={inputClasses}
              >
                <option value="">Выберите пол</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
                <option value="other">Другой</option>
              </select>

              <div className="relative">
                <input
                  {...phoneHook.phoneInputProps}
                  placeholder="Телефон *"
                  className={inputClasses}
                  required
                />
                {editingItem && editingItem.phone && (
                  <div
                    onClick={() => setShowWhatsAppHistory(true)}
                    className="absolute right-3 top-3 text-curai-positive cursor-pointer"
                    style={{ width: '20px', height: '20px' }}
                    title="Открыть WhatsApp"
                  >
                    <FaWhatsapp style={{ width: '20px', height: '20px', display: 'block' }} />
                  </div>
                )}
                {phoneHook.isChecking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-curai-control border-t-transparent"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Блок с информацией о найденном пациенте/лиде */}
            {hasPhoneMatch && phoneHook.foundData && (
              <div className="p-3 bg-curai-warningBg border border-curai-warning rounded-md text-sm">
                {phoneHook.foundData.patient ? (
                  <div className="flex items-center gap-2 text-curai-warning">
                    <span>⚠️</span>
                    <span>
                      Пациент <strong>{phoneHook.foundData.patient.full_name}</strong> уже существует с таким номером телефона
                    </span>
                  </div>
                ) : phoneHook.foundData.active_lead && (
                  <div className="flex items-center gap-2 text-curai-warning">
                    <span>ℹ️</span>
                    <span>
                      Активная заявка с таким номером: <strong>{phoneHook.foundData.active_lead.full_name}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-curai-muted mb-1">Канал привлечения клиента</label>
              <select
                value={patientForm.source_id || ''}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  const selectedSource = sources.find(s => s.id === selectedValue);
                  if (selectedSource) {
                    safeSetPatientForm({
                      source_id: selectedValue,
                      source: selectedSource.type
                    });
                  } else {
                    safeSetPatientForm({
                      source_id: selectedValue,
                      source: ''
                    });
                  }
                }}
                className={inputClasses}
                disabled={loadingSources}
              >
                <option value="">Выберите источник</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              {loadingSources && <span className="text-xs text-curai-muted ml-2">Загрузка...</span>}
            </div>

            {patientOriginLabel(editingItem || patientForm, sources) && (
              <p className="text-sm text-curai-muted">{patientOriginLabel(editingItem || patientForm, sources)}</p>
            )}
            <textarea
              placeholder="Заметки"
              value={visiblePatientNotes(editingItem || patientForm, patientForm.notes || '')}
              onChange={(e) => safeSetPatientForm({ notes: e.target.value })}
              className={inputClasses}
              rows="3"
            />

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading || hasPhoneMatch}
                className={`flex-1 ${buttonSuccessClasses} ${hasPhoneMatch ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={hasPhoneMatch ? 'Пациент с таким номером уже существует' : ''}
               {...documentPermissionProps(user, "patients_view", "patients_edit")}>
                {loading ? 'Сохранение...' : (editingItem ? 'Обновить' : 'Создать')}
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
        )}

        {/* Documents Tab - только файлы */}
        {activeTab === 'documents' && editingItem && (
          <div className="space-y-4">
            {/* Upload Section */}
            <div className={cardHeaderClasses}>
              <h4 className="font-medium mb-3">Загрузить новый документ</h4>
              <div className="space-y-3">
                <div>
                  <input
                    id="file-input"
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className={inputClasses}
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  />
                  <p className="text-sm text-curai-muted mt-1">
                    Поддерживаются файлы: PDF, Word, текст, изображения
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Описание документа (опционально)"
                  value={documentDescription}
                  onChange={(e) => setDocumentDescription(e.target.value)}
                  className={inputClasses}
                />
                <button
                  onClick={handleFileUpload}
                  disabled={!selectedFile || uploading}
                  className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue disabled:opacity-50"
                 {...documentPermissionProps(user, "patients_view", "patients_edit")}>
                  {uploading ? 'Загрузка...' : 'Загрузить документ'}
                </button>
              </div>
            </div>

            {/* Documents List */}
            <div>
              <h4 className="font-medium mb-3">Загруженные документы</h4>
              {documents.length === 0 ? (
                <p className="text-curai-muted text-center py-4">
                  Документы не найдены
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-md gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={doc.original_filename}>{doc.original_filename}</div>
                        <div className="text-sm text-curai-muted">
                          Загружен {new Date(doc.created_at).toLocaleDateString('ru-RU')}
                          {' '}пользователем {doc.uploaded_by_name}
                        </div>
                        {doc.description && (
                          <div className="text-sm text-curai-muted truncate" title={doc.description}>{doc.description}</div>
                        )}
                        <div className="text-xs text-curai-muted">
                          Размер: {(doc.file_size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex space-x-2 flex-shrink-0">
                        <a
                          href="#" onClick={event => { event.preventDefault(); downloadPatientDocument(doc, user).catch(error => window.alert(error.message)); }}
                          {...documentPermissionProps(user, 'patients_view', 'patients_export')}
                          download={doc.original_filename}
                          title={doc.original_filename}
                          className="px-3 py-1 text-curai-blue border border-curai-control rounded hover:bg-curai-selected text-sm whitespace-nowrap"
                        >
                          Скачать
                        </a>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="px-3 py-1 text-curai-negative border border-curai-negative rounded hover:bg-curai-negativeBg text-sm whitespace-nowrap"
                         {...documentPermissionProps(user, "patients_view", "patients_delete")}>
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            
          </div>
        )}

        {/* Treatment Plans Tab - управление планами */}
        {activeTab === 'treatment' && editingItem && (<>
{editingPlan && (
              <div className={cardHeaderClasses}>
              <h4 className="font-medium mb-3">
                {editingPlan ? 'Редактировать счет' : 'Добавить счет на оплату'}
              </h4>

              {/* Basic Plan Information */}
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  placeholder="Название счета *"
                  value={planForm.title}
                  onChange={(e) => setPlanForm({...planForm, title: e.target.value})}
                  className={inputClasses}
                  required
                />
                <textarea
                  placeholder="Описание"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({...planForm, description: e.target.value})}
                  className={inputClasses}
                  rows="2"
                />

                {/* Plan Status and Payment Info */}
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={planForm.status}
                    onChange={(e) => setPlanForm({...planForm, status: e.target.value})}
                    className={selectClasses}
                  >
                    <option value="draft">Черновик</option>
                    <option value="approved">Утвержден</option>
                    <option value="completed">Завершен</option>
                    <option value="cancelled">Отменен</option>
                  </select>

                  <select
                    value={planForm.execution_status}
                    disabled
                    className={selectClasses}
                  >
                    <option value="pending">Ожидает</option>
                    <option value="in_progress">В процессе</option>
                    <option value="completed">Завершено</option>
                    <option value="no_show">Не пришел</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={planForm.payment_status}
                    onChange={(e) => setPlanForm({...planForm, payment_status: e.target.value})}
                    className={selectClasses}
                  >
                    <option value="unpaid">Не оплачено</option>
                    <option value="partially_paid">Частично оплачено</option>
                    <option value="paid">Оплачено</option>
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Оплачено (₸)"
                    value={planForm.paid_amount}
                    onChange={(e) => setPlanForm({...planForm, paid_amount: parseFloat(e.target.value) || 0})}
                    className={selectClasses}
                  />
                </div>
              </div>

              {/* Service Selector */}
              <div className="mb-4">
                <h5 className="font-medium mb-2">Услуги к оплате:</h5>
                <ServiceSelector
                  onServiceAdd={handleAddServiceToPlan}
                  selectedPatient={editingItem}
                />

                {/* Services Table */}
                {planForm.services.length > 0 && (
                  <div className="mt-4">
                    <h5 className="font-medium mb-2">Выбранные услуги:</h5>
                    <div className="border rounded-md overflow-hidden">
                      <table className="min-w-full">
                        <thead className="bg-curai-subtle">
                          <tr className="text-xs text-curai-muted">
                            <th className="py-2 px-3 text-left">Услуга</th>
                            <th className="py-2 px-2 text-center">Кол-во</th>
                            <th className="py-2 px-2 text-center">Цена за ед.</th>
                            <th className="py-2 px-2 text-right">Итого</th>
                            <th className="py-2 px-2 text-center">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planForm.services.map((service, index) => (
                            <tr key={index} className="text-xs border-t">
                              <td className="py-2 px-3">
                                <div className="font-medium">{service.service_name}</div>
                                {service.category && (
                                  <div className="text-curai-muted">{service.category}</div>
                                )}
                                {service.teeth_numbers && service.teeth_numbers.length > 0 && (
                                  <div className="text-curai-blue">
                                    🦷 Зубы: {service.teeth_numbers.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {service.quantity} {service.unit}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {(service.unit_price || 0).toFixed(0)} ₸
                              </td>
                              <td className="py-2 px-2 text-right font-medium">
                                {(service.total_price || 0).toFixed(0)} ₸
                              </td>
                              <td className="py-2 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedServices = planForm.services.filter((_, i) => i !== index);
                                    const totalCost = updatedServices.reduce((sum, svc) => sum + (svc.total_price || 0), 0);
                                    setPlanForm(prev => ({
                                      ...prev,
                                      services: updatedServices,
                                      total_cost: totalCost
                                    }));
                                  }}
                                  className="text-curai-negative hover:text-curai-negative"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-curai-subtle">
                          <tr className="text-sm font-medium">
                            <td colSpan="3" className="py-2 px-3 text-right">Общая стоимость:</td>
                            <td className="py-2 px-2 text-right">
                              {(planForm.total_cost || 0).toFixed(0)} ₸
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <textarea
                placeholder="Дополнительные заметки"
                value={planForm.notes}
                onChange={(e) => setPlanForm({...planForm, notes: e.target.value})}
                className="w-full px-3 py-2 border border-curai-control rounded-md mb-3"
                rows="2"
              />

              {/* Form Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTreatmentPlan}
                  className="px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive"
                 {...documentPermissionProps(user, "patients_view", "patients_edit")}>
                  {editingPlan ? 'Обновить счет' : 'Создать счет'}
                </button>
                {editingPlan && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlan(null);
                      setPlanForm({
                        title: '',
                        description: '',
                        services: [],
                        total_cost: 0,
                        status: 'draft',
                        notes: '',
                        payment_status: 'unpaid',
                        paid_amount: 0,
                        execution_status: 'pending',
                        appointment_ids: []
                      });
                    }}
                    className="px-4 py-2 bg-curai-control text-curai-ink rounded-md hover:bg-curai-disabled"
                  >
                    Отмена
                  </button>
                )}
              </div>
            </div>
            )}
<PatientTreatmentWorkspace allowPayment={canAction(user, 'patients_view', 'finance_view', 'finance_edit')} allowCompletion={canAction(user, 'patients_view', 'patients_edit')} plans={currentTreatmentPlans} patientId={currentPatientId} paymentFilter={paymentFilter} onPaymentFilter={setPaymentFilter} procedureFilter={procedureFilter} onProcedureFilter={setProcedureFilter}
onUpdate={(updatedPlan) => {
                          // Обновить план в списке
                          setTreatmentPlans(plans =>
                            plans.map(p => p.id === updatedPlan.id ? updatedPlan : p)
                          );
                          refreshTreatmentPlans();
                        }} onCreatePlan={!canAction(user, 'patients_view', 'patients_edit') ? undefined : () => { setEditingConsultation(null); setShowConsultationForm(true); setActiveTab('consultations'); }}/></>)}

                  {/* Complex Services Tab - быстрый выбор комплексной услуги и разброс по календарю */}
                  {activeTab === 'complex' && editingItem && (
  <div className="curai-patient-complex">
    
    <div className="curai-patient-complex-intro"><h4>Комплексные услуги для пациента</h4><p>Выберите комплексную услугу, назначьте врача и расписание — записи появятся в календаре, счёт создастся сразу в «Планах лечения» и «Оплате».</p></div>
    <ServiceSelector
                                                      onServiceAdd={handleAddComplexService}
                                                      selectedPatient={editingItem}
                                                      onlyComplex
                                                    />
    {successMessage && (
                                                                            <div className="px-4 py-3 bg-curai-positiveBg border border-curai-positive rounded-md text-curai-positive text-sm font-medium">
                                                                              {successMessage}
                                                                            </div>
                                                                          )}
    
  </div>
)}

                                          {/* Analyzes Tab - выбор и добавление лабораторных анализов */}
                  {activeTab === 'analyzes' && editingItem && (
                    <div className="space-y-4">
                      <div className="bg-curai-selected p-3 rounded-md">
                        <h4 className="font-medium text-curai-blue">
                          Анализы
                        </h4>
                        <p className="text-sm text-curai-blue mt-1">
                          Выберите несколько лабораторных анализов с поиском — они создадут счёт в «Планах лечения» и «Оплате»
                        </p>
                      </div>

                      <div className="bg-curai-surface p-4 rounded-md border border-curai-border shadow-none">
                        <LabAnalysisPicker
                                                  onAdd={handleAddLabAnalyzes}
                                                  patientName={editingItem.full_name}
                                                />
                                              </div>

                                                                    {successMessage && (
                                                                      <div className="px-4 py-3 bg-curai-positiveBg border border-curai-positive rounded-md text-curai-positive text-sm font-medium">
                                                                        {successMessage}
                                                                      </div>
                                                                    )}

                                                                    
                    </div>
                  )}

                  {/* Payment Tab - поэтапная оплата */}
        {activeTab === 'payment' && editingItem && (<PatientPaymentWorkspace allowPayment={canAction(user, 'patients_view', 'finance_view', 'finance_edit')} allowCompletion={canAction(user, 'patients_view', 'patients_edit')} patientId={currentPatientId} plans={currentTreatmentPlans} onUpdate={(updatedPlan) => {
                      setTreatmentPlans(plans =>
                        plans.map(p => p.id === updatedPlan.id ? updatedPlan : p)
                      );
                      // после оплаты обновляем планы/статистику в списке пациентов
                      refreshTreatmentPlans();
                    }} onCreatePlan={!canAction(user, 'patients_view', 'patients_edit') ? undefined : () => setActiveTab('treatment')} />)}

        {/* Consultations Tab */}
        {activeTab === 'consultations' && editingItem && (
          <div className="curai-patient-consultations space-y-4">
            {!showConsultationForm ? (
              <>
                <div className="curai-consultations-heading flex justify-between items-center mb-4">
                  <h4 className="font-medium text-curai-ink">Консультационные листы</h4>
                  <button
                    onClick={() => setShowConsultationForm(true)}
                    className="curai-button curai-button-primary"
                    data-guide="new-consultation-btn"
                   {...documentPermissionProps(user, "patients_view", "patients_edit")}>
                    + Добавить
                  </button>
                </div>

                {/* Consultation Sheets List */}
                {consultationSheets.length === 0 ? (
                  <p className="text-curai-muted text-center py-8">
                    Консультационные листы не найдены
                  </p>
                ) : (
                  <div className="space-y-3">
                    {consultationSheets.map((sheet) => {
                      const isExpanded = expandedConsultations[sheet.id] !== false; // по умолчанию развёрнуто
                      return (
                        <div key={sheet.id} className="curai-consultation-card bg-curai-surface rounded-md shadow-none border border-curai-border overflow-hidden">
                          {/* Заголовок карточки - всегда видимый */}
                          <div
                            
                            className="curai-consultation-card-header w-full px-4 py-3 flex items-center justify-between bg-curai-subtle transition-colors border-b border-curai-border"
                          >
                            <button type="button" onClick={() => toggleConsultation(sheet.id)} className="flex items-center space-x-3 min-w-0">
                              <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                <FaChevronRight className="text-curai-muted text-sm" />
                              </div>
                              <FaFileMedical className="text-curai-blue" />
                              <div className="text-left min-w-0">
                                <h3 className="text-sm font-semibold text-curai-ink truncate">
                                  Консультация от {new Date(sheet.consultation_date).toLocaleDateString('ru-RU')}
                                </h3>
                                <div className="flex items-center space-x-2 text-xs text-curai-muted mt-0.5">
                                  <span className="flex items-center">
                                    <FaUserMd className="mr-1 text-curai-muted" />
                                    {sheet.doctor_name}
                                  </span>
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); handlePrintConsultation(sheet); }}
                                className="px-2 py-1 text-curai-ink border border-curai-control rounded hover:bg-curai-subtle text-xs whitespace-nowrap"
                                title="Печать консультационного листа"
                               {...documentPermissionProps(user, "patients_view", "patients_export")}>
                                Печать
                              </button>
                              <button type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingConsultation(sheet);
                                  setShowConsultationForm(true);
                                }}
                                className="px-2 py-1 text-curai-blue border border-curai-control rounded hover:bg-curai-selected text-xs whitespace-nowrap"
                               {...documentPermissionProps(user, "patients_view", "patients_edit")}>
                                Редактировать
                              </button>
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteConsultation(sheet.id); }}
                                className="px-2 py-1 text-curai-negative border border-curai-negative rounded hover:bg-curai-negativeBg text-xs whitespace-nowrap"
                               {...documentPermissionProps(user, "patients_view", "patients_delete")}>
                                Удалить
                              </button>
                              {isExpanded ? <FaChevronDown className="text-curai-muted" /> : <FaChevronDown className="text-curai-muted rotate-180" />}
                            </div>
                          </div>

                          {/* Детальное содержимое - отображается только при раскрытии */}
                          {isExpanded && (
                            <div className="p-4">
                              {/* МКБ-10 коды */}
                              {sheet.icd10_codes && sheet.icd10_codes.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-xs font-medium text-curai-ink mb-1">МКБ-10 коды:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {sheet.icd10_codes.map((code) => (
                                      <span
                                        key={code.code}
                                        className="inline-flex items-center px-2 py-1 bg-curai-selected text-curai-blue rounded text-xs"
                                      >
                                        <span className="font-medium">{code.code}</span>
                                        <span className="ml-1 text-curai-blue">- {code.name}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Все поля консультации */}
                              <div className="curai-consultation-fields grid grid-cols-1 gap-3">
{sheet.complaints && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaClipboardList className="mr-1 text-curai-blue" />
                                      Жалобы
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.complaints}</div>
                                  </div>
                                )}
{sheet.anamnesis && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaNotesMedical className="mr-1 text-curai-positive" />
                                      Анамнез
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.anamnesis}</div>
                                  </div>
                                )}
{sheet.anamnesis_morbi && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaNotesMedical className="mr-1 text-curai-positive" />
                                      Анамнез заболевания
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.anamnesis_morbi}</div>
                                  </div>
                                )}
{sheet.anamnesis_vitae && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaNotesMedical className="mr-1 text-curai-positive" />
                                      Анамнез жизни
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.anamnesis_vitae}</div>
                                  </div>
                                )}
{sheet.local_status && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaStethoscope className="mr-1 text-curai-blue" />
                                      Локальный статус
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.local_status}</div>
                                  </div>
                                )}
{sheet.examination && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaStethoscope className="mr-1 text-curai-blue" />
                                      Объективный осмотр
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.examination}</div>
                                  </div>
                                )}
{sheet.diagnosis && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaUserMd className="mr-1 text-curai-warning" />
                                      Диагноз
                                    </div>
                                    <div className="text-sm text-curai-ink font-medium whitespace-pre-wrap">{sheet.diagnosis}</div>
                                  </div>
                                )}
{sheet.treatment && (
                                  <div className="bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaFileMedical className="mr-1 text-curai-negative" />
                                      Назначенное лечение
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.treatment}</div>
                                  </div>
                                )}
{sheet.treatment_services && sheet.treatment_services.length > 0 && (
                                  <div className="curai-consultation-wide bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaCreditCard className="mr-1 text-curai-positive" />
                                      Назначенные услуги
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-curai-control">
                                            <th className="text-left py-1 px-2 text-curai-muted">Услуга</th>
                                            <th className="text-center py-1 px-2 text-curai-muted">Кол-во</th>
                                            <th className="text-right py-1 px-2 text-curai-muted">Цена</th>
                                            <th className="text-right py-1 px-2 text-curai-muted">Сумма</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sheet.treatment_services.map((service, idx) => (
                                            <React.Fragment key={idx}>
                                              <tr className="border-b border-curai-border last:border-b-0">
                                                <td className="py-1 px-2 text-curai-ink">
                                                  {service.service_name}
                                                  {service.is_complex && <span className="ml-1 text-[10px] bg-curai-selected text-curai-blue px-1 rounded align-middle">Комплекс</span>}
                                                </td>
                                                <td className="text-center py-1 px-2 text-curai-ink">{service.quantity}</td>
                                                <td className="text-right py-1 px-2 text-curai-ink">{Number(service.price_per_unit).toLocaleString('ru-RU')} ₸</td>
                                                <td className="text-right py-1 px-2 text-curai-ink font-medium">
                                                  {Number(service.total_price).toLocaleString('ru-RU')} ₸
                                                  {service.discount_amount > 0 && (
                                                    <div className="text-[10px] text-curai-negative font-normal">скидка −{Number(service.discount_amount).toLocaleString('ru-RU')} ₸</div>
                                                  )}
                                                </td>
                                              </tr>
                                              {service.is_complex && service.components && service.components.length > 0 && (
                                                <tr key={`${idx}-comps`} className="bg-curai-selected border-b border-curai-border">
                                                  <td colSpan={4} className="py-1 px-2">
                                                    <div className="text-[11px] text-curai-muted mb-0.5">Что входит:</div>
                                                    {service.components.map((c, ci) => {
                                                      const unit = Number(c.price || 0);
                                                      const qty = Number(c.quantity || 1);
                                                      const sum = unit * qty;
                                                      const d = c.discount_amount ? `−${Number(c.discount_amount).toLocaleString('ru-RU')} ₸` : (c.discount ? `${Number(c.discount)}%` : '');
                                                      return (
                                                        <div key={ci} className="flex justify-between text-xs py-0.5">
                                                          <span className="text-curai-ink">− {c.service_name} ×{qty}</span>
                                                          <span className="text-curai-muted">{sum.toLocaleString('ru-RU')} ₸{d ? <span className="text-curai-negative"> · скидка {d}</span> : ''}</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
{sheet.recommendations && (
                                  <div className="curai-consultation-wide bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaClipboardList className="mr-1 text-curai-warning" />
                                      Рекомендации
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.recommendations}</div>
                                  </div>
                                )}
{sheet.notes && (
                                  <div className="curai-consultation-wide bg-curai-subtle rounded-md p-3 border border-curai-border">
                                    <div className="text-xs font-medium text-curai-ink mb-1 flex items-center">
                                      <FaFileAlt className="mr-1 text-curai-muted" />
                                      Дополнительные заметки
                                    </div>
                                    <div className="text-sm text-curai-ink whitespace-pre-wrap">{sheet.notes}</div>
                                  </div>
                                )}
</div>

                              <div className="text-xs text-curai-muted mt-3 pt-2 border-t border-curai-border">
                                Создано {new Date(sheet.created_at).toLocaleString('ru-RU')}
                                {' '}пользователем {sheet.created_by_name}
                                {sheet.updated_at && (
                                  <> · Обновлено {new Date(sheet.updated_at).toLocaleString('ru-RU')}</>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                
                <ConsultationSheetForm
                  patientId={editingItem.id}
                  editingSheet={editingConsultation}
                  onSave={handleSaveConsultation}
                  onSaved={handleConsultationSaved}
                  onCancel={() => {
                    setShowConsultationForm(false);
                    setEditingConsultation(null);
                  }}
                />
              </>
            )}

            
          </div>
        )}

        {/* Appointments Tab - Календарная сетка назначений */}
        {activeTab === 'appointments' && editingItem && (
          <div className="space-y-4">
            <div className="bg-curai-selected p-3 rounded-md">
              <h4 className="font-medium text-curai-blue">
                Назначения
              </h4>
              <p className="text-sm text-curai-blue mt-1">
                Календарная сетка курсовых процедур. Нажимайте на ячейки для отметки выполнения.
              </p>
            </div>

            <AppointmentsSchedule patientId={editingItem.id} onUpdate={async () => {
              await fetchTreatmentPlans();
              refreshTreatmentPlans();
            }} />

            
          </div>
        )}
          </>
        )}
    </Modal>

    {/* WhatsApp Sidebar */}
    <WhatsAppSidebar
        user={user}
      phone={editingItem?.phone}
      patientName={editingItem?.full_name}
      isOpen={showWhatsAppHistory}
      onClose={() => setShowWhatsAppHistory(false)}
    />
    </>
  );
};

export default PatientModal;
