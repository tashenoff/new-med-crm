import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonSuccessClasses, buttonDangerClasses, cardHeaderClasses, tabClasses, tableClasses, tableHeaderClasses, tableRowClasses } from './modalUtils';
import ServiceSelector from '../treatment/ServiceSelector';
import ConsultationSheetForm from '../consultations/ConsultationSheetForm';
import TreatmentPlanView from '../treatment/TreatmentPlanView';
import ServicePaymentList from '../treatment/ServicePaymentList';
import AppointmentsSchedule from '../treatment/AppointmentsSchedule';
import WhatsAppSidebar from '../crm/telephony/WhatsAppSidebar';
import { FaWhatsapp, FaUser, FaStethoscope, FaFileAlt, FaClipboardList, FaCreditCard, FaCalendarAlt, FaChevronDown, FaChevronRight, FaNotesMedical, FaUserMd, FaFileMedical } from 'react-icons/fa';
import { useGlobalRefresh } from '../../hooks/useGlobalRefresh';
import { usePhoneInput } from '../../hooks/usePhoneInput';

const PatientModal = ({
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
  const [consultationSheets, setConsultationSheets] = useState([]);
  const [showConsultationForm, setShowConsultationForm] = useState(false);
  const [editingConsultation, setEditingConsultation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentDescription, setDocumentDescription] = useState('');
  
  // Сохраняем ID редактируемого пациента в локальном состоянии для надёжности
  const [currentPatientId, setCurrentPatientId] = useState(null);
  
  // Обновляем ID когда меняется editingItem
  React.useEffect(() => {
    if (editingItem) {
      const id = editingItem.id || editingItem._id;
      setCurrentPatientId(id);
    } else if (!show) {
      // Сбрасываем только когда модалка закрывается
      setCurrentPatientId(null);
    }
  }, [editingItem, show]);
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
  
  // Безопасная функция обновления формы, которая всегда сохраняет ID пациента
  const safeSetPatientForm = (updates) => {
    const patientId = currentPatientId || patientForm.id || patientForm._id || editingItem?.id || editingItem?._id;
    const updatedForm = typeof updates === 'function' 
      ? updates(patientForm) 
      : { ...patientForm, ...updates };
    
    // Всегда сохраняем ID если он есть
    if (patientId && !updatedForm.id) {
      updatedForm.id = patientId;
    }
    
    // Диагностика
    console.log('🔄 safeSetPatientForm:', {
      'patientId сохранён': patientId,
      'updates': updates,
      'updatedForm.id': updatedForm.id
    });
    
    setPatientForm(updatedForm);
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
    checkPatientByPhone
  );
  
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
  }, [show]); // Только при открытии/закрытии модалки
  
  // Загрузка данных при переключении вкладок
  useEffect(() => {
    if (editingItem && show) {
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
      setPageLoading(false);
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

      if (response.ok) {
        setShowConsultationForm(false);
        setEditingConsultation(null);
        fetchConsultationSheets();
        // Обновляем локальные планы лечения
        fetchTreatmentPlans();
        // Триггерим глобальное обновление для страницы пациентов
        console.log('🔄 Консультация сохранена, обновляем планы лечения на странице пациентов');
        refreshTreatmentPlans();
      }
    } catch (error) {
      console.error('Error saving consultation sheet:', error);
    }
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

    const servicesList = (sheet.treatment_services || []).map((s) => (
      `<tr>
        <td class="txt">${escapeHtml(s.service_name)}</td>
        <td class="num">${Number(s.quantity || 1)}</td>
        <td class="num">${Number(s.price_per_unit || 0).toLocaleString('ru-RU')}</td>
        <td class="num">${Number(s.total_price || 0).toLocaleString('ru-RU')}</td>
      </tr>`
    )).join('');

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
  const PaymentSummary = ({ plans }) => {
    // Расчёт общих сумм по всем планам
    const totalAmount = plans.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    const paidAmount = plans.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
    const totalServices = plans.reduce((sum, p) => sum + (p.services?.length || 0), 0);
    const paidServices = plans.reduce((sum, p) => sum + (p.services?.filter(s => s.payment_status === 'paid').length || 0), 0);
    const remainingToPay = Math.max(0, totalAmount - paidAmount);
    const paymentProgress = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
    
    // Депозит
    const depositAmount = plans.reduce((sum, p) => sum + (p.deposit_amount || 0), 0);
    const extraDeposit = plans.reduce((sum, p) => sum + (p.extra_deposit || 0), 0);
    const appointmentDeposit = depositAmount - extraDeposit;
    const depositBalance = depositAmount > totalAmount ? depositAmount - totalAmount : 0;
    const depositDebt = depositAmount < totalAmount ? totalAmount - depositAmount : 0;
    const actualRemainingToPay = depositAmount > 0
      ? Math.max(0, totalAmount - paidAmount - depositAmount)
      : remainingToPay;

    return (
      <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Всего к оплате</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{totalAmount.toLocaleString()} ₸</div>
            {totalServices > 0 && <div className="text-xs text-gray-400 mt-1">{totalServices} услуг</div>}
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-xs text-green-600 uppercase tracking-wide font-medium">✅ Оплачено</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{paidAmount.toLocaleString()} ₸</div>
            {paidAmount > 0 && (
              <div className="text-xs text-green-500 mt-1">{paidServices} из {totalServices} услуг</div>
            )}
          </div>
          <div className={`text-center p-3 rounded-lg border ${actualRemainingToPay > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className={`text-xs uppercase tracking-wide font-medium ${actualRemainingToPay > 0 ? 'text-red-600' : 'text-green-600'}`}>
              К оплате
            </div>
            <div className={`text-2xl font-bold mt-1 ${actualRemainingToPay > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {actualRemainingToPay.toLocaleString()} ₸
            </div>
            {actualRemainingToPay > 0 && (
              <div className="text-xs text-red-500 mt-1">{totalServices - paidServices} услуг не оплачено</div>
            )}
          </div>
        </div>

        {totalAmount > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Прогресс оплаты</span>
              <span className="font-semibold">{paymentProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-500 ${
                  paymentProgress === 100
                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                    : 'bg-gradient-to-r from-blue-400 to-blue-600'
                }`}
                style={{ width: `${paymentProgress}%` }}
              />
            </div>
          </div>
        )}

        {depositAmount > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
            <span className="font-medium text-gray-700">💳 Депозит:</span>
            {appointmentDeposit > 0 && <span className="text-blue-600">💰 {appointmentDeposit.toLocaleString()} ₸</span>}
            {extraDeposit > 0 && <span className="text-green-600">➕ Доплата: {extraDeposit.toLocaleString()} ₸</span>}
            <span className="font-medium">Итого: {depositAmount.toLocaleString()} ₸</span>
            {depositBalance > 0 && <span className="text-green-600 font-medium">✓ Остаток: {depositBalance.toLocaleString()} ₸</span>}
            {depositDebt > 0 && <span className="text-red-600 font-medium">✗ Непокрыто: {depositDebt.toLocaleString()} ₸</span>}
          </div>
        )}

        {remainingToPay === 0 && paidAmount > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 text-center">
            <div className="inline-flex items-center px-6 py-3 bg-green-100 text-green-700 rounded-lg font-semibold">
              <span className="text-2xl mr-2">✅</span>
              <span>Все планы лечения полностью оплачены</span>
            </div>
          </div>
        )}
      </div>
    );
  };

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
        fetchTreatmentPlans(); // Refresh plans list
      } else {
        console.error('Error saving treatment plan');
      }
    } catch (error) {
      console.error('Error saving treatment plan:', error);
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
      onClose={onClose}
      title={editingItem ? 'Редактировать пациента' : 'Новый пациент'}
      errorMessage={errorMessage}
    >

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
          <nav className="-mb-px flex flex-wrap gap-x-8 gap-y-2">
            <button
              onClick={() => setActiveTab('info')}
              className={tabClasses(activeTab === 'info')}
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
                  className={tabClasses(activeTab === 'consultations')}
                  data-guide="consultations-tab"
                >
                  <span className="flex items-center gap-2">
                    <FaStethoscope className="text-sm" />
                    <span>Консультации</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={tabClasses(activeTab === 'documents')}
                >
                  <span className="flex items-center gap-2">
                    <FaFileAlt className="text-sm" />
                    <span>Документы</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('treatment')}
                  className={tabClasses(activeTab === 'treatment')}
                >
                  <span className="flex items-center gap-2">
                    <FaClipboardList className="text-sm" />
                    <span>Планы лечения</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('payment')}
                  className={tabClasses(activeTab === 'payment')}
                >
                  <span className="flex items-center gap-2">
                    <FaCreditCard className="text-sm" />
                    <span>Оплата</span>
                  </span>
                </button>
                {hasCourseServices && (
                  <button
                    onClick={() => setActiveTab('appointments')}
                    className={tabClasses(activeTab === 'appointments')}
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
        </div>

        {/* Прелоадер при загрузке данных пациента */}
        {pageLoading && editingItem ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 text-sm">Загрузка данных пациента...</p>
          </div>
        ) : (
          <>
        {/* Tab Content */}
        {activeTab === 'info' && (
          <form onSubmit={(e) => {
            // Используем currentPatientId из локального состояния - он надёжнее
            const patientIdToUse = currentPatientId || editingItem?.id || editingItem?._id;
            
            // Передаём ID напрямую вместе с patientForm для надёжности
            const formDataWithId = {
              ...patientForm,
              _editingItemId: patientIdToUse
            };
            onSave(e, formDataWithId);
          }} className="space-y-4">
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
                    className="absolute right-3 top-3 text-green-600 cursor-pointer"
                    style={{ width: '20px', height: '20px' }}
                    title="Открыть WhatsApp"
                  >
                    <FaWhatsapp style={{ width: '20px', height: '20px', display: 'block' }} />
                  </div>
                )}
                {phoneHook.isChecking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Блок с информацией о найденном пациенте/лиде */}
            {phoneHook.hasMatch && phoneHook.foundData && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                {phoneHook.foundData.patient ? (
                  <div className="flex items-center gap-2 text-orange-700">
                    <span>⚠️</span>
                    <span>
                      Пациент <strong>{phoneHook.foundData.patient.full_name}</strong> уже существует с таким номером телефона
                    </span>
                  </div>
                ) : phoneHook.foundData.active_lead && (
                  <div className="flex items-center gap-2 text-orange-700">
                    <span>ℹ️</span>
                    <span>
                      Активная заявка с таким номером: <strong>{phoneHook.foundData.active_lead.full_name}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-600 mb-1">Канал привлечения клиента</label>
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
              {loadingSources && <span className="text-xs text-gray-400 ml-2">Загрузка...</span>}
            </div>

            {editingItem && (
              <div>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Количество приемов</label>
                    <input
                      type="number"
                      min="0"
                      value={patientForm.appointments_count || 0}
                      onChange={(e) => safeSetPatientForm({ appointments_count: parseInt(e.target.value) || 0 })}
                      className={inputClasses}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Количество записей</label>
                    <input
                      type="number"
                      min="0"
                      value={patientForm.records_count || 0}
                      onChange={(e) => safeSetPatientForm({ records_count: parseInt(e.target.value) || 0 })}
                      className={inputClasses}
                    />
                  </div>
                </div>
              </div>
            )}
            
            <textarea
              placeholder="Заметки"
              value={patientForm.notes}
              onChange={(e) => safeSetPatientForm({ notes: e.target.value })}
              className={inputClasses}
              rows="3"
            />
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading || phoneHook.hasMatch}
                className={`flex-1 ${buttonSuccessClasses} ${phoneHook.hasMatch ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={phoneHook.hasMatch ? 'Пациент с таким номером уже существует' : ''}
              >
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
                  <p className="text-sm text-gray-500 mt-1">
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Загрузка...' : 'Загрузить документ'}
                </button>
              </div>
            </div>

            {/* Documents List */}
            <div>
              <h4 className="font-medium mb-3">Загруженные документы</h4>
              {documents.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Документы не найдены
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{doc.original_filename}</div>
                        <div className="text-sm text-gray-500">
                          Загружен {new Date(doc.created_at).toLocaleDateString('ru-RU')} 
                          {' '}пользователем {doc.uploaded_by_name}
                        </div>
                        {doc.description && (
                          <div className="text-sm text-gray-600">{doc.description}</div>
                        )}
                        <div className="text-xs text-gray-400">
                          Размер: {(doc.file_size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <a
                          href={`${API}/api/uploads/${doc.filename}`}
                          download={doc.original_filename}
                          className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm"
                        >
                          Скачать
                        </a>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50 text-sm"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        {/* Treatment Plans Tab - управление планами */}
        {activeTab === 'treatment' && editingItem && (
          <div className="space-y-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <h4 className="font-medium text-green-800">
                Планы лечения для пациента: {editingItem.full_name}
              </h4>
              <p className="text-sm text-green-600 mt-1">
                Создаются автоматически при заполнении консультационного листа или вручную
              </p>
            </div>

            {/* Add/Edit Plan Form */}
            {!editingPlan && (
              <div className="bg-white p-3 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500 text-center">
                  Планы лечения создаются автоматически при заполнении консультационного листа
                </p>
                <p className="text-sm text-gray-400 text-center mt-2">
                  Или нажмите "Редактировать" на существующем плане для изменения
                </p>
              </div>
            )}

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
                    onChange={(e) => setPlanForm({...planForm, execution_status: e.target.value})}
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
                  onServiceAdd={(serviceItem) => {
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
                            appointment_date: serviceItem.scheduling.date,
                            appointment_time: slot.time,
                            service_id: slot.service_id,
                            complex_id: serviceItem.service_id,
                            complex_name: serviceItem.service_name,
                            price: slot.price || null
                          })
                        }).catch((err) => console.error('Ошибка создания записи на комплекс:', err));
                      });
                    }
                  }}
                  selectedPatient={editingItem}
                />

                {/* Services Table */}
                {planForm.services.length > 0 && (
                  <div className="mt-4">
                    <h5 className="font-medium mb-2">Выбранные услуги:</h5>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full">
                        <thead className="bg-gray-100">
                          <tr className="text-xs text-gray-600">
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
                                  <div className="text-gray-500">{service.category}</div>
                                )}
                                {service.teeth_numbers && service.teeth_numbers.length > 0 && (
                                  <div className="text-blue-600">
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
                                  className="text-red-500 hover:text-red-700"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
                rows="2"
              />
              
              {/* Form Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTreatmentPlan}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
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
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Отмена
                  </button>
                )}
              </div>
            </div>
            )}

            {/* Treatment Plans List with Payment Tracking */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Счета к оплате</h4>
              </div>
              
              {/* Фильтры */}
              {treatmentPlans.length > 0 && (
                <div className="mb-4 space-y-3">
                  {/* Фильтр по оплате */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Статус оплаты:</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentFilter('all')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          paymentFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Все
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentFilter('paid')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          paymentFilter === 'paid'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        ✓ Оплачено
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentFilter('unpaid')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          paymentFilter === 'unpaid'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        ✗ Не оплачено
                      </button>
                    </div>
                  </div>

                  {/* Фильтр по типу услуг */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Тип услуг:</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setProcedureFilter('all')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          procedureFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Все
                      </button>
                      <button
                        type="button"
                        onClick={() => setProcedureFilter('procedures')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          procedureFilter === 'procedures'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        🔬 Процедуры
                      </button>
                      <button
                        type="button"
                        onClick={() => setProcedureFilter('non_procedures')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          procedureFilter === 'non_procedures'
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        🦷 Не процедуры
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {treatmentPlans.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Счета не найдены
                </p>
              ) : (
                <div className="space-y-4">
                  {treatmentPlans
                    .filter(plan => {
                      // Проверяем, есть ли в плане услуги, соответствующие фильтрам
                      if (!plan.services || plan.services.length === 0) return false;

                      // Применяем фильтры к услугам
                      const filteredServices = plan.services.filter(service => {
                        // Фильтр по оплате
                        if (paymentFilter === 'paid') {
                          const isPaid = service.is_paid || (service.paid_amount && service.paid_amount >= service.total_price);
                          if (!isPaid) return false;
                        } else if (paymentFilter === 'unpaid') {
                          const isPaid = service.is_paid || (service.paid_amount && service.paid_amount >= service.total_price);
                          if (isPaid) return false;
                        }

                        // Фильтр по типу услуг
                        if (procedureFilter === 'procedures') {
                          if (!service.is_course) return false;
                        } else if (procedureFilter === 'non_procedures') {
                          if (service.is_course) return false;
                        }

                        return true;
                      });

                      // Показываем план только если есть услуги после фильтрации
                      return filteredServices.length > 0;
                    })
                    .map((plan) => (
                    <div key={plan.id}>
                      <ServicePaymentList 
                        plan={plan}
                        paymentFilter={paymentFilter}
                        procedureFilter={procedureFilter}
                        onUpdate={(updatedPlan) => {
                          // Обновить план в списке
                          setTreatmentPlans(plans => 
                            plans.map(p => p.id === updatedPlan.id ? updatedPlan : p)
                          );
                        }}
                        onEdit={handleEditTreatmentPlan}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        {/* Payment Tab - поэтапная оплата */}
        {activeTab === 'payment' && editingItem && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-medium text-blue-800">
                Оплата услуг для пациента: {editingItem.full_name}
              </h4>
              <p className="text-sm text-blue-600 mt-1">
                Здесь можно отметить оплату отдельных услуг. Нажмите кнопку "Оплатить" рядом с услугой.
              </p>
            </div>

            {/* Сводка оплаты по всем планам лечения */}
            {treatmentPlans.length > 0 && (
              <PaymentSummary plans={treatmentPlans} />
            )}

            {treatmentPlans.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-2">Планы лечения не найдены</p>
                <button
                  onClick={() => setActiveTab('treatment')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Создать план лечения
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {treatmentPlans.map((plan) => (
                  <ServicePaymentList 
                    key={plan.id}
                    plan={plan} 
                    onUpdate={(updatedPlan) => {
                      setTreatmentPlans(plans => 
                        plans.map(p => p.id === updatedPlan.id ? updatedPlan : p)
                      );
                    }}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        {/* Consultations Tab */}
        {activeTab === 'consultations' && editingItem && (
          <div className="space-y-4">
            {!showConsultationForm ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-gray-900">Консультационные листы пациента: {editingItem.full_name}</h4>
                  <button
                    onClick={() => setShowConsultationForm(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                    data-guide="new-consultation-btn"
                  >
                    Добавить
                  </button>
                </div>

                {/* Consultation Sheets List */}
                {consultationSheets.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Консультационные листы не найдены
                  </p>
                ) : (
                  <div className="space-y-3">
                    {consultationSheets.map((sheet) => {
                      const isExpanded = expandedConsultations[sheet.id] !== false; // по умолчанию развёрнуто
                      return (
                        <div key={sheet.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                          {/* Заголовок карточки - всегда видимый */}
                          <button
                            onClick={() => toggleConsultation(sheet.id)}
                            className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-colors border-b border-gray-200"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                <FaChevronRight className="text-gray-400 text-sm" />
                              </div>
                              <FaFileMedical className="text-blue-500" />
                              <div className="text-left min-w-0">
                                <h3 className="text-sm font-semibold text-gray-900 truncate">
                                  Консультация от {new Date(sheet.consultation_date).toLocaleDateString('ru-RU')}
                                </h3>
                                <div className="flex items-center space-x-2 text-xs text-gray-500 mt-0.5">
                                  <span className="flex items-center">
                                    <FaUserMd className="mr-1 text-gray-400" />
                                    {sheet.doctor_name}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePrintConsultation(sheet); }}
                                className="px-2 py-1 text-gray-700 border border-gray-500 rounded hover:bg-gray-100 text-xs whitespace-nowrap"
                                title="Печать консультационного листа"
                              >
                                Печать
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingConsultation(sheet);
                                  setShowConsultationForm(true);
                                }}
                                className="px-2 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-xs whitespace-nowrap"
                              >
                                Редактировать
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteConsultation(sheet.id); }}
                                className="px-2 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50 text-xs whitespace-nowrap"
                              >
                                Удалить
                              </button>
                              {isExpanded ? <FaChevronDown className="text-gray-400" /> : <FaChevronDown className="text-gray-400 rotate-180" />}
                            </div>
                          </button>

                          {/* Детальное содержимое - отображается только при раскрытии */}
                          {isExpanded && (
                            <div className="p-4">
                              {/* МКБ-10 коды */}
                              {sheet.icd10_codes && sheet.icd10_codes.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-xs font-medium text-gray-700 mb-1">МКБ-10 коды:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {sheet.icd10_codes.map((code) => (
                                      <span 
                                        key={code.code}
                                        className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                                      >
                                        <span className="font-medium">{code.code}</span>
                                        <span className="ml-1 text-blue-600">- {code.name}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Все поля консультации */}
                              <div className="grid grid-cols-1 gap-3">
                                {sheet.complaints && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaClipboardList className="mr-1 text-blue-500" />
                                      Жалобы
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.complaints}</div>
                                  </div>
                                )}

                                {sheet.anamnesis && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaNotesMedical className="mr-1 text-green-500" />
                                      Анамнез
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.anamnesis}</div>
                                  </div>
                                )}

                                {sheet.anamnesis_morbi && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaNotesMedical className="mr-1 text-green-500" />
                                      Анамнез заболевания
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.anamnesis_morbi}</div>
                                  </div>
                                )}

                                {sheet.anamnesis_vitae && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaNotesMedical className="mr-1 text-green-500" />
                                      Анамнез жизни
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.anamnesis_vitae}</div>
                                  </div>
                                )}

                                {sheet.local_status && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaStethoscope className="mr-1 text-purple-500" />
                                      Локальный статус
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.local_status}</div>
                                  </div>
                                )}

                                {sheet.examination && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaStethoscope className="mr-1 text-indigo-500" />
                                      Объективный осмотр
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.examination}</div>
                                  </div>
                                )}

                        {sheet.diagnosis && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaUserMd className="mr-1 text-orange-500" />
                                      Диагноз
                                    </div>
                                    <div className="text-sm text-gray-900 font-medium whitespace-pre-wrap">{sheet.diagnosis}</div>
                                  </div>
                                )}

                                {/* Назначенные услуги из прайса */}
                                {sheet.treatment_services && sheet.treatment_services.length > 0 && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaCreditCard className="mr-1 text-teal-500" />
                                      Назначенные услуги
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-gray-300">
                                            <th className="text-left py-1 px-2 text-gray-600">Услуга</th>
                                            <th className="text-center py-1 px-2 text-gray-600">Кол-во</th>
                                            <th className="text-right py-1 px-2 text-gray-600">Цена</th>
                                            <th className="text-right py-1 px-2 text-gray-600">Сумма</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sheet.treatment_services.map((service, idx) => (
                                            <tr key={idx} className="border-b border-gray-200 last:border-b-0">
                                              <td className="py-1 px-2 text-gray-800">{service.service_name}</td>
                                              <td className="text-center py-1 px-2 text-gray-800">{service.quantity}</td>
                                              <td className="text-right py-1 px-2 text-gray-800">{Number(service.price_per_unit).toLocaleString('ru-RU')} ₸</td>
                                              <td className="text-right py-1 px-2 text-gray-800 font-medium">{Number(service.total_price).toLocaleString('ru-RU')} ₸</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {sheet.treatment && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaFileMedical className="mr-1 text-red-500" />
                                      Назначенное лечение
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.treatment}</div>
                                  </div>
                                )}

                                {sheet.recommendations && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaClipboardList className="mr-1 text-yellow-600" />
                                      Рекомендации
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.recommendations}</div>
                                  </div>
                                )}

                                {sheet.notes && (
                                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                                      <FaFileAlt className="mr-1 text-gray-500" />
                                      Дополнительные заметки
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{sheet.notes}</div>
                                  </div>
                                )}
                              </div>

                              <div className="text-xs text-gray-400 mt-3 pt-2 border-t border-gray-100">
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
                <h4 className="font-medium mb-3">
                  {editingConsultation ? 'Редактировать консультационный лист' : 'Новый консультационный лист'}
                </h4>
                <ConsultationSheetForm
                  patientId={editingItem.id}
                  editingSheet={editingConsultation}
                  onSave={handleSaveConsultation}
                  onCancel={() => {
                    setShowConsultationForm(false);
                    setEditingConsultation(null);
                  }}
                />
              </>
            )}

            {!showConsultationForm && (
              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        )}

        {/* Appointments Tab - Календарная сетка назначений */}
        {activeTab === 'appointments' && editingItem && (
          <div className="space-y-4">
            <div className="bg-purple-50 p-3 rounded-lg">
              <h4 className="font-medium text-purple-800">
                Назначения для пациента: {editingItem.full_name}
              </h4>
              <p className="text-sm text-purple-600 mt-1">
                Календарная сетка курсовых процедур. Нажимайте на ячейки для отметки выполнения.
              </p>
            </div>

            <AppointmentsSchedule patientId={editingItem.id} />

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
          </>
        )}
    </Modal>
    
    {/* WhatsApp Sidebar */}
    <WhatsAppSidebar 
      phone={editingItem?.phone}
      patientName={editingItem?.full_name}
      isOpen={showWhatsAppHistory}
      onClose={() => setShowWhatsAppHistory(false)}
    />
    </>
  );
};

export default PatientModal;
