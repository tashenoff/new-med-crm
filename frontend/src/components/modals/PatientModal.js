import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonSuccessClasses, buttonDangerClasses, cardHeaderClasses, tabClasses, tableClasses, tableHeaderClasses, tableRowClasses } from './modalUtils';
import ServiceSelector from '../treatment/ServiceSelector';
import ConsultationSheetForm from '../consultations/ConsultationSheetForm';
import TreatmentPlanView from '../treatment/TreatmentPlanView';
import ServicePaymentList from '../treatment/ServicePaymentList';
import AppointmentsSchedule from '../treatment/AppointmentsSchedule';
import WhatsAppSidebar from '../crm/telephony/WhatsAppSidebar';
import { FaWhatsapp, FaUser, FaStethoscope, FaFileAlt, FaClipboardList, FaCreditCard, FaCalendarAlt } from 'react-icons/fa';
import { useGlobalRefresh } from '../../hooks/useGlobalRefresh';

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
  
  // Фильтры для счетов
  const [paymentFilter, setPaymentFilter] = useState('all'); // all, paid, unpaid
  const [procedureFilter, setProcedureFilter] = useState('all'); // all, procedures, non_procedures

  const API = import.meta.env.VITE_BACKEND_URL;
  
  // Глобальное обновление для синхронизации со страницей пациентов
  const { refreshTreatmentPlans } = useGlobalRefresh();

  useEffect(() => {
    if (editingItem) {
      // Всегда загружаем планы при открытии, чтобы проверить наличие курсов
      fetchTreatmentPlans();
      
      if (activeTab === 'documents') {
        fetchDocuments();
      }
      if (activeTab === 'consultations') {
        fetchConsultationSheets();
      }
    }
  }, [editingItem, activeTab]);
  
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

        {/* Tab Content */}
        {activeTab === 'info' && (
          <form onSubmit={(e) => onSave(e, patientForm)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Полное имя *"
                value={patientForm.full_name || ''}
                onChange={(e) => setPatientForm({...patientForm, full_name: e.target.value})}
                className={inputClasses}
                required
              />
              
              <div className="relative">
                <input
                  type="tel"
                  placeholder="Телефон *"
                  value={patientForm.phone}
                  onChange={(e) => setPatientForm({...patientForm, phone: e.target.value})}
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="ИИН"
                value={patientForm.iin || ''}
                onChange={(e) => setPatientForm({...patientForm, iin: e.target.value})}
                className={inputClasses}
              />
              
              <input
                type="date"
                placeholder="Дата рождения"
                value={patientForm.birth_date || ''}
                onChange={(e) => setPatientForm({...patientForm, birth_date: e.target.value})}
                className={inputClasses}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                value={patientForm.gender || ''}
                onChange={(e) => setPatientForm({...patientForm, gender: e.target.value})}
                className={inputClasses}
              >
                <option value="">Выберите пол</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
                <option value="other">Другой</option>
              </select>
              
              <input
                type="text"
                placeholder="Кто направил пациента"
                value={patientForm.referrer || ''}
                onChange={(e) => setPatientForm({...patientForm, referrer: e.target.value})}
                className={inputClasses}
              />
            </div>
            
            <select
              value={patientForm.source}
              onChange={(e) => setPatientForm({...patientForm, source: e.target.value})}
              className={inputClasses}
            >
              <option value="phone">Телефонный звонок</option>
              <option value="walk_in">Обращение в клинику</option>
              <option value="referral">Направление врача</option>
              <option value="website">Веб-сайт</option>
              <option value="social_media">Социальные сети</option>
              <option value="other">Другое</option>
            </select>

            {editingItem && (
              <div>
                <h4 className="text-md font-semibold mb-2">Финансовая информация</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Выручка (₸)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={patientForm.revenue || 0}
                      onChange={(e) => setPatientForm({...patientForm, revenue: parseFloat(e.target.value) || 0})}
                      className={inputClasses}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Долг (₸)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={patientForm.debt || 0}
                      onChange={(e) => setPatientForm({...patientForm, debt: parseFloat(e.target.value) || 0})}
                      className={inputClasses}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Переплата (₸)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={patientForm.overpayment || 0}
                      onChange={(e) => setPatientForm({...patientForm, overpayment: parseFloat(e.target.value) || 0})}
                      className={inputClasses}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Количество приемов</label>
                    <input
                      type="number"
                      min="0"
                      value={patientForm.appointments_count || 0}
                      onChange={(e) => setPatientForm({...patientForm, appointments_count: parseInt(e.target.value) || 0})}
                      className={inputClasses}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Количество записей</label>
                    <input
                      type="number"
                      min="0"
                      value={patientForm.records_count || 0}
                      onChange={(e) => setPatientForm({...patientForm, records_count: parseInt(e.target.value) || 0})}
                      className={inputClasses}
                    />
                  </div>
                </div>
              </div>
            )}
            
            <textarea
              placeholder="Заметки"
              value={patientForm.notes}
              onChange={(e) => setPatientForm({...patientForm, notes: e.target.value})}
              className={inputClasses}
              rows="3"
            />
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 ${buttonSuccessClasses}`}
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
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          onClick={() => handleEditTreatmentPlan(plan)}
                          className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteTreatmentPlan(plan.id)}
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
                    {consultationSheets.map((sheet) => (
                      <div key={sheet.id} className="border rounded-lg p-4 bg-white shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-sm text-gray-500">
                              {new Date(sheet.consultation_date).toLocaleDateString('ru-RU')}
                            </div>
                            <div className="font-medium text-gray-900">
                              Врач: {sheet.doctor_name}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setEditingConsultation(sheet);
                                setShowConsultationForm(true);
                              }}
                              className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm"
                            >
                              Редактировать
                            </button>
                            <button
                              onClick={() => handleDeleteConsultation(sheet.id)}
                              className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50 text-sm"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>

                        {/* ICD-10 Codes */}
                        {sheet.icd10_codes && sheet.icd10_codes.length > 0 && (
                          <div className="mb-3">
                            <div className="text-xs font-medium text-gray-700 mb-1">МКБ-10:</div>
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

                        {/* Content Fields */}
                        {sheet.complaints && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-gray-700">Жалобы:</div>
                            <div className="text-sm text-gray-600">{sheet.complaints}</div>
                          </div>
                        )}
                        
                        {sheet.diagnosis && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-gray-700">Диагноз:</div>
                            <div className="text-sm text-gray-900 font-medium">{sheet.diagnosis}</div>
                          </div>
                        )}

                        {sheet.treatment && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-gray-700">Назначенное лечение:</div>
                            <div className="text-sm text-gray-600">{sheet.treatment}</div>
                          </div>
                        )}

                        {sheet.recommendations && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-gray-700">Рекомендации:</div>
                            <div className="text-sm text-gray-600">{sheet.recommendations}</div>
                          </div>
                        )}

                        <div className="text-xs text-gray-400 mt-2">
                          Создано {new Date(sheet.created_at).toLocaleString('ru-RU')} 
                          {' '}пользователем {sheet.created_by_name}
                        </div>
                      </div>
                    ))}
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
