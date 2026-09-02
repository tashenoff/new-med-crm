import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Phone, Mail, Calendar, Clock, CheckCircle, AlertCircle,
  UserPlus, MessageSquare, PhoneCall, Eye, Edit, Trash2,
  Target, Plus, Filter, Search, MoreHorizontal, FileText,
  Star, Flag, ArrowRight, CheckSquare, PlayCircle, DollarSign,
  User, Building, Loader2, UserCheck, AlertTriangle
} from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { useCrm } from '../../../hooks/useCrm';
import { useTheme, themeClasses, cn } from '../../../hooks/useTheme';
import { useModal } from '../../../context/ModalContext';
import Modal from '../../modals/Modal';
import PanelHeader from '../../common/PanelHeader';
import WhatsAppSidebar from '../telephony/WhatsAppSidebar';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../../modals/modalUtils';

const EnhancedLeadsView = ({ user }) => {
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);
  const [leadTasks, setLeadTasks] = useState({});
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentForm, setAppointmentForm] = useState({});
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    type: 'call',
    status: 'new'
  });
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [newLead, setNewLead] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    phone: '',
    email: '',
    source: 'website',
    source_id: '',
    priority: 'medium',
    company: '',
    description: '',
    services_interested: []
  });
  const [newColumn, setNewColumn] = useState({
    title: '',
    status: '',
    color: 'bg-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-800'
  });

  // Состояния для модального окна HMS данных
  const [showHmsDataModal, setShowHmsDataModal] = useState(false);
  const [selectedLeadForHms, setSelectedLeadForHms] = useState(null);
  const [hmsData, setHmsData] = useState({ appointments: [], treatmentPlans: [] });
  const [loadingHmsData, setLoadingHmsData] = useState(false);

  // Состояния для WhatsApp сайдбара
  const [showWhatsAppSidebar, setShowWhatsAppSidebar] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState(null);
  const [whatsAppLeadName, setWhatsAppLeadName] = useState('');

  const { isDarkMode } = useTheme();
  const { openModal, closeModal } = useModal();

  const {
    leads,
    managers,
    sources,
    loading,
    error,
    fetchLeads,
    createLead,
    updateLeadStatus,
    convertLead,
    deleteLead,
    fetchAvailableManagers,
    fetchSources,
    clearError,
    checkPatientByPhone
  } = useCrm();

  // Состояния для проверки пациента по телефону
  const [foundPatient, setFoundPatient] = useState(null);
  const [foundActiveLead, setFoundActiveLead] = useState(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const phoneCheckTimeoutRef = useRef(null);

  // Статусы заявок с улучшенными цветами
  const leadStatuses = {
    new: { 
      label: 'Новая', 
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', 
      icon: <Target className="w-4 h-4" />,
      badge: 'bg-blue-500'
    },
    contacted: { 
      label: 'Связались', 
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', 
      icon: <PhoneCall className="w-4 h-4" />,
      badge: 'bg-yellow-500'
    },
    in_progress: { 
      label: 'В работе', 
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', 
      icon: <Clock className="w-4 h-4" />,
      badge: 'bg-orange-500'
    },
    converted: { 
      label: 'Конвертирована', 
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', 
      icon: <CheckCircle className="w-4 h-4" />,
      badge: 'bg-green-500'
    },
    rejected: { 
      label: 'Отказ', 
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', 
      icon: <AlertCircle className="w-4 h-4" />,
      badge: 'bg-red-500'
    },
    closed: { 
      label: 'Оплачено', 
      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', 
      icon: <DollarSign className="w-4 h-4" />,
      badge: 'bg-emerald-600'
    }
  };

  // Типы заданий
  const taskTypes = {
    call: { label: 'Звонок', icon: <PhoneCall className="w-4 h-4" />, color: 'bg-blue-500' },
    email: { label: 'Письмо', icon: <Mail className="w-4 h-4" />, color: 'bg-green-500' },
    meeting: { label: 'Встреча', icon: <Calendar className="w-4 h-4" />, color: 'bg-purple-500' },
    follow_up: { label: 'Дозвон', icon: <Clock className="w-4 h-4" />, color: 'bg-orange-500' },
    note: { label: 'Заметка', icon: <FileText className="w-4 h-4" />, color: 'bg-gray-500' }
  };

  // Загрузка врачей, пациентов, кабинетов и записей при монтировании
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
        
        const [doctorsResponse, patientsResponse, roomsResponse, appointmentsResponse] = await Promise.all([
          fetch(`${baseUrl}/api/doctors`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${baseUrl}/api/patients`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${baseUrl}/api/rooms`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${baseUrl}/api/appointments`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);
        
        if (doctorsResponse.ok) {
          const doctorsData = await doctorsResponse.json();
          setDoctors(doctorsData);
          console.log('✅ Загружено врачей:', doctorsData.length);
        }
        
        if (patientsResponse.ok) {
          const patientsData = await patientsResponse.json();
          setPatients(patientsData);
          console.log('✅ Загружено пациентов:', patientsData.length);
        }
        
        if (roomsResponse.ok) {
          const roomsData = await roomsResponse.json();
          setRooms(roomsData);
          console.log('✅ Загружено кабинетов:', roomsData.length);
        }
        
        if (appointmentsResponse.ok) {
          const appointmentsData = await appointmentsResponse.json();
          setAppointments(appointmentsData);
          console.log('✅ Загружено записей на прием:', appointmentsData.length);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, []);

  // Загрузка задач для заявки
  const loadLeadTasks = async (leadId) => {
    if (leadTasks[leadId]) return; // Уже загружены
    
    try {
      const tasksData = await fetchLeadTasks(leadId);
      setLeadTasks(prev => ({
        ...prev,
        [leadId]: tasksData.tasks || []
      }));
    } catch (error) {
      console.error('Error loading lead tasks:', error);
      setLeadTasks(prev => ({
        ...prev,
        [leadId]: []
      }));
    }
  };

  // Функция для получения задач (используем API)
  const fetchLeadTasks = async (leadId) => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/leads/${leadId}/tasks`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    if (!response.ok) throw new Error('Failed to fetch tasks');
    return await response.json();
  };

  // Источники заявок
  const leadSources = {
    website: 'Сайт',
    phone: 'Телефон',
    social: 'Соц. сети',
    referral: 'Рекомендация',
    advertising: 'Реклама',
    other: 'Другое'
  };

  // Загрузка статусов задач
  const fetchTaskStatuses = async () => {
    try {
      const token = localStorage.getItem('token');
      const baseUrl = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
      const response = await fetch(`${baseUrl}/api/crm/task-statuses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTaskStatuses(data.statuses || []);
        console.log('✅ Загружено статусов задач:', data.statuses?.length || 0);
      }
    } catch (error) {
      console.error('Error loading task statuses:', error);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchAvailableManagers();
    fetchSources();
    fetchTaskStatuses();
  }, []);

  useEffect(() => {
    filterLeads();
  }, [leads, statusFilter, searchTerm]);

  const filterLeads = () => {
    let filtered = leads;
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(lead => lead.status === statusFilter);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(lead => 
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone?.includes(searchTerm) ||
        lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.first_name + ' ' + lead.last_name).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredLeads(filtered);
  };

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      await updateLeadStatus(leadId, newStatus);
    } catch (error) {
      console.error('Error updating lead status:', error);
    }
  };

  const handleConvertToClient = async (lead) => {
    try {
      const conversionData = {
        create_hms_patient: false,
        create_appointment: false,
        notes: `Конвертирован из заявки ${lead.full_name || lead.first_name + ' ' + lead.last_name}`
      };
      await convertLead(lead.id, conversionData);
      alert('Заявка успешно конвертирована в клиента CRM!');
    } catch (error) {
      console.error('Error converting lead:', error);
      alert('Ошибка при конвертации заявки: ' + (error.message || error));
    }
  };

  // Функция для загрузки данных HMS по лиду (планы лечения и приемы)
  const handleShowLeadHmsData = async (lead) => {
    setSelectedLeadForHms(lead);
    setShowHmsDataModal(true);
    setLoadingHmsData(true);

    // Загружаем задачи для этого лида
    loadLeadTasks(lead.id);

    try {
      const API = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
      const token = localStorage.getItem('token');

      let patientId = lead.converted_to_client_id;

      // Если нет converted_to_client_id, ищем пациента по телефону
      if (!patientId && lead.phone) {
        const phoneDigits = lead.phone.replace(/\D/g, '');
        const searchPhone = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
        
        // Ищем среди пациентов
        const foundPatient = patients.find(p => {
          const pPhone = (p.phone || '').replace(/\D/g, '');
          return pPhone.endsWith(searchPhone) || searchPhone.endsWith(pPhone.slice(-10));
        });
        
        if (foundPatient) {
          patientId = foundPatient.id;
        }
      }

      if (patientId) {
        // Получаем данные HMS по patient_id
        const [appointmentsRes, plansRes] = await Promise.all([
          fetch(`${API}/api/appointments?patient_id=${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API}/api/patients/${patientId}/treatment-plans`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        const appointmentsData = appointmentsRes.ok ? await appointmentsRes.json() : [];
        const plansData = plansRes.ok ? await plansRes.json() : [];

        setHmsData({
          appointments: Array.isArray(appointmentsData) ? appointmentsData : [],
          treatmentPlans: Array.isArray(plansData) ? plansData : []
        });
      } else {
        // Пациент не найден - показываем пустые данные
        setHmsData({ appointments: [], treatmentPlans: [] });
      }
    } catch (error) {
      console.error('Error loading HMS data for lead:', error);
      setHmsData({ appointments: [], treatmentPlans: [] });
    } finally {
      setLoadingHmsData(false);
    }
  };

  // Функция для проверки пациента по телефону (только при полном номере - 10 цифр)
  const handlePhoneCheck = useCallback(async (phone) => {
    // Очищаем предыдущий таймер
    if (phoneCheckTimeoutRef.current) {
      clearTimeout(phoneCheckTimeoutRef.current);
    }
    
    // Получаем только цифры
    const digits = phone.replace(/\D/g, '');
    
    // Проверяем только если введён полный номер (11 цифр с +7)
    if (digits.length < 11) {
      setFoundPatient(null);
      setFoundActiveLead(null);
      setIsCheckingPhone(false);
      return;
    }
    
    setIsCheckingPhone(true);
    
    // Небольшая задержка для плавности UI
    phoneCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await checkPatientByPhone(phone);
        const patient = result?.patient || null;
        const activeLead = result?.active_lead || null;
        
        setFoundPatient(patient);
        setFoundActiveLead(activeLead);
        
        // Автоматически заполняем данные если найден пациент или активный лид
        if (patient) {
          const nameParts = (patient.full_name || '').trim().split(/\s+/);
          setNewLead(prev => ({
            ...prev,
            last_name: nameParts[0] || '',
            first_name: nameParts[1] || '',
            middle_name: nameParts[2] || '',
            email: patient.email || prev.email,
          }));
        } else if (activeLead) {
          const nameParts = (activeLead.full_name || '').trim().split(/\s+/);
          setNewLead(prev => ({
            ...prev,
            first_name: nameParts[0] || '',
            last_name: nameParts[1] || '',
          }));
        }
      } catch (error) {
        console.error('Error checking phone:', error);
        setFoundPatient(null);
        setFoundActiveLead(null);
      } finally {
        setIsCheckingPhone(false);
      }
    }, 300);
  }, [checkPatientByPhone]);

  // Форматирование телефона: просто добавляем + в начало
  const formatPhoneNumber = (value) => {
    // Убираем всё кроме цифр
    let digits = value.replace(/\D/g, '');
    
    // Ограничиваем 11 цифрами (код страны + 10 цифр)
    digits = digits.slice(0, 11);
    
    // Если нет цифр, возвращаем пустую строку
    if (digits.length === 0) {
      return '';
    }
    
    // Просто добавляем + в начало
    return '+' + digits;
  };

  // Обработчик изменения телефона
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setNewLead({ ...newLead, phone: formatted });
    handlePhoneCheck(formatted);
  };

  const handleCreateLead = async () => {
    try {
      // Подготавливаем данные для отправки
      const leadData = {
        ...newLead,
        // Убеждаемся что source имеет допустимое значение
        source: newLead.source || 'website',
        // Очищаем пустые значения
        email: newLead.email || null,
        source_id: newLead.source_id || null,
        company: newLead.company || null,
        description: newLead.description || null,
        middle_name: newLead.middle_name || null,
        services_interested: newLead.services_interested?.length > 0 ? newLead.services_interested : []
      };
      
      await createLead(leadData);
      setShowCreateModal(false);
      setNewLead({
        first_name: '',
        last_name: '',
        middle_name: '',
        phone: '',
        email: '',
        source: 'website',
        source_id: '',
        priority: 'medium',
        company: '',
        description: '',
        services_interested: []
      });
      // Очищаем найденные данные
      setFoundPatient(null);
      setFoundActiveLead(null);
      alert('Заявка успешно создана!');
    } catch (error) {
      console.error('Error creating lead:', error);
      alert('Ошибка при создании заявки: ' + (error.message || 'Неизвестная ошибка'));
    }
  };

  const handleCreateTask = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Подготовка данных задачи
      const taskData = {
        title: newTask.title,
        type: newTask.type,
        priority: newTask.priority,
        status: newTask.status,
        lead_id: selectedLead?.id
      };
      
      // Добавляем опциональные поля только если они заполнены
      if (newTask.description) taskData.description = newTask.description;
      if (newTask.due_date) taskData.due_date = newTask.due_date;
      
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(taskData)
        }
      );
      
      if (response.ok) {
        setShowTaskModal(false);
        setNewTask({
          title: '',
          description: '',
          priority: 'medium',
          due_date: '',
          type: 'call',
          status: 'new'
        });
        // Обновляем список задач для этой заявки
        if (selectedLead) {
          await loadLeadTasks(selectedLead.id);
        }
        alert('Задание успешно создано!');
      } else {
        const error = await response.json();
        alert('Ошибка при создании задания: ' + (error.detail || 'Неизвестная ошибка'));
      }
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Ошибка при создании задания');
    }
  };

  // Функции управления колонками
  const handleEditColumn = (column) => {
    setEditingColumn(column);
    setNewColumn({
      title: column.title,
      status: column.status,
      color: column.color,
      bgColor: column.bgColor
    });
    setShowColumnModal(true);
  };

  const handleCreateNewColumn = () => {
    setEditingColumn(null);
    setNewColumn({
      title: '',
      status: '',
      color: 'bg-gray-500',
      bgColor: 'bg-gray-50 dark:bg-gray-800'
    });
    setShowColumnModal(true);
  };

  const handleSaveColumn = () => {
    // В будущем здесь будет API вызов для сохранения колонки
    console.log('Saving column:', newColumn, 'editing:', editingColumn);
    alert(editingColumn ? 'Колонка обновлена!' : 'Новая колонка создана!');
    setShowColumnModal(false);
    setEditingColumn(null);
  };

  const handleDeleteColumn = (columnId) => {
    if (confirm('Вы уверены, что хотите удалить эту колонку?')) {
      // В будущем здесь будет API вызов для удаления колонки
      console.log('Deleting column:', columnId);
      alert('Колонка удалена!');
    }
  };

  const TaskList = ({ leadId }) => {
    const tasks = leadTasks[leadId] || [];
    
    // Загружаем задачи при первом рендере
    useEffect(() => {
      loadLeadTasks(leadId);
    }, [leadId]);
    
    if (tasks.length === 0) {
      return (
        <div className={cn("text-center py-4", themeClasses.text.muted)}>
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Заданий нет</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {tasks.map((task) => (
          <div 
            key={task.id}
            className={cn(
              "flex items-center space-x-3 p-3 rounded-lg border",
              task.completed 
                ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" 
                : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-600"
            )}
          >
            <div className={cn("p-2 rounded-lg", taskTypes[task.type].color)}>
              {taskTypes[task.type].icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <p className={cn("text-sm font-medium", task.completed ? "line-through text-gray-500" : themeClasses.text.primary)}>
                  {task.title}
                </p>
                <span className={cn(
                  "px-2 py-1 text-xs rounded-full",
                  task.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                )}>
                  {task.priority === 'high' ? 'Высокий' : task.priority === 'medium' ? 'Средний' : 'Низкий'}
                </span>
              </div>
              <p className={cn("text-xs mt-1", themeClasses.text.muted)}>{task.description}</p>
              <p className={cn("text-xs mt-1", themeClasses.text.muted)}>
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(task.due_date).toLocaleString('ru-RU')}
              </p>
            </div>
            {!task.completed && (
              <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                <CheckSquare className="w-4 h-4 text-green-600" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Канбан колонки с конфигурацией как в AmoCRM
  const kanbanColumns = [
    {
      id: 'new',
      title: 'НЕРАЗОБРАННЫЕ',
      status: 'new',
      color: 'bg-gray-500',
      bgColor: 'bg-gray-50 dark:bg-gray-800'
    },
    {
      id: 'contacted',
      title: 'ЗАПИСАН НА ПРИЕМ',
      status: 'contacted', 
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      id: 'in_progress',
      title: 'ЗАПИСЬ ПОДТВЕРЖДЕНА',
      status: 'in_progress',
      color: 'bg-yellow-500', 
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20'
    },
    {
      id: 'converted',
      title: 'ПАЦИЕНТ ПРИШЁЛ',
      status: 'converted',
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      id: 'closed',
      title: 'ОПЛАЧЕНО',
      status: 'closed',
      color: 'bg-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      id: 'rejected',
      title: 'ОТКЛОНЕНО',
      status: 'rejected',
      color: 'bg-red-500',
      bgColor: 'bg-red-50 dark:bg-red-900/20'
    }
  ];

  // Группировка заявок по статусам
  const groupedLeads = kanbanColumns.reduce((acc, column) => {
    acc[column.status] = filteredLeads.filter(lead => lead.status === column.status);
    return acc;
  }, {});

  // Получаем сумму из плана лечения (только план лечения, не budget/цену приёма)
  const getLeadAmount = (lead) => {
    // DEBUG: логируем данные для диагностики
    if (lead?.treatment_plan_total || lead?.budget || lead?.appointment_price) {
      console.log('🔍 Lead amounts:', {
        name: lead.full_name,
        treatment_plan_total: lead.treatment_plan_total,
        budget: lead.budget,
        appointment_price: lead.appointment_price
      });
    }
    // Показываем только сумму плана лечения, а не цену приёма или бюджет
    return lead?.treatment_plan_total || 0;
  };

  // Расчет сумм для каждой колонки
  const getColumnStats = (status) => {
    const leads = groupedLeads[status] || [];
    const count = leads.length;
    const totalAmount = leads.reduce((sum, lead) => {
      return sum + getLeadAmount(lead);
    }, 0);
    return { count, totalAmount };
  };

  // Назначить прием для заявки через API CRM
  const handleScheduleAppointment = async (lead) => {
    setSelectedLead(lead);
    
    // Поиск существующего пациента по телефону или email
    let existingPatient = null;
    if (lead.phone) {
      existingPatient = patients.find(p => 
        p.phone && p.phone.replace(/\D/g, '').includes(lead.phone.replace(/\D/g, ''))
      );
    }
    if (!existingPatient && lead.email) {
      existingPatient = patients.find(p => 
        p.email && p.email.toLowerCase() === lead.email.toLowerCase()
      );
    }

    // Если пациент уже конвертирован, используем его ID
    if (lead.converted_to_client_id) {
      existingPatient = patients.find(p => p.id === lead.converted_to_client_id);
    }

    // Если пациент не найден, покажем уведомление
    const patientNotFound = !existingPatient;
    if (patientNotFound) {
      console.log(`Пациент не найден для лида ${lead.first_name} ${lead.last_name}, будет предложено создать`);
    }
    
    // Открываем модальное окно записи на прием
    openModal('appointment', {
      appointmentForm: {
        patient_id: existingPatient?.id || '',
        doctor_id: '',
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: '10:00',
        end_time: '10:30',
        room_id: '',
        status: 'confirmed',
        reason: lead.description || 'Консультация',
        notes: `Запись из CRM. Заявка: ${lead.first_name} ${lead.last_name}${lead.phone ? `, тел: ${lead.phone}` : ''}`,
        patient_notes: '',
        price: 0,
        deposit_type: '',         // Без депозита по умолчанию
        deposit: 0,               // Без депозита по умолчанию
        // Источник из лида - для основной формы записи
        source: lead.source,
        source_id: lead.source_id,
        // Дополнительные данные для создания пациента если не найден
        lead_first_name: lead.first_name,
        lead_last_name: lead.last_name,
        lead_middle_name: lead.middle_name || '',
        lead_phone: lead.phone,
        lead_email: lead.email,
        // Источник из лида - для формы создания пациента
        lead_source: lead.source,
        lead_source_id: lead.source_id,
        // Флаг что пациент не найден - нужно сразу показать форму создания
        showNewPatientForm: patientNotFound
      },
      setAppointmentForm: setAppointmentForm,
      patients: patients,
      doctors: doctors,
      editingItem: null,
      loading: false,
      errorMessage: null,
      // Скрываем кнопку создания пациента - в CRM пациент создается автоматически через API
      hideCreatePatientButton: true,
      onSave: async (appointmentData) => {
        try {
          // Используем наш CRM API для назначения приема
          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/leads/${lead.id}/schedule-appointment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({
                doctor_id: appointmentData.doctor_id,
                appointment_date: appointmentData.appointment_date,
                appointment_time: appointmentData.appointment_time,
                end_time: appointmentData.end_time,
                room_id: appointmentData.room_id,
                service: appointmentData.service || appointmentData.reason || 'Консультация',
                notes: appointmentData.notes || `Запись из CRM. Заявка: ${lead.first_name} ${lead.last_name}`,
                price: appointmentData.price || 0,
                deposit: appointmentData.deposit || null,
                deposit_type: appointmentData.deposit_type || null
              })
            }
          );

          if (response.ok) {
            const result = await response.json();
            alert(`Прием успешно назначен!\nПациент: ${result.patient_id}\nЗапись: ${result.appointment_id}`);
            closeModal('appointment');
            // Обновляем список заявок
            await fetchLeads();
            // Обновляем список записей для корректной проверки конфликтов
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
            const appointmentsResponse = await fetch(`${baseUrl}/api/appointments`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (appointmentsResponse.ok) {
              const appointmentsData = await appointmentsResponse.json();
              setAppointments(appointmentsData);
            }
          } else {
            const error = await response.json();
            throw new Error(error.detail || 'Не удалось назначить прием');
          }
        } catch (error) {
          console.error('Error scheduling appointment:', error);
          alert(`Ошибка: ${error.message}`);
          throw error;
        }
      },
      onCreatePatient: async (newPatientData) => {
        // Создаем пациента из данных лида
        try {
          const patientData = {
            ...newPatientData,
            // Если форма не заполнена, используем данные из лида
            full_name: newPatientData.full_name || `${lead.first_name} ${lead.last_name}`.trim(),
            phone: newPatientData.phone || lead.phone,
            email: newPatientData.email || lead.email
          };
          
          const token = localStorage.getItem('token');
          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/patients`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(patientData)
            }
          );
          
          if (response.ok) {
            const newPatient = await response.json();
            // Обновляем список пациентов
            setPatients(prev => [newPatient, ...prev]);
            return newPatient;
          } else {
            const error = await response.json();
            throw new Error(error.detail || 'Не удалось создать пациента');
          }
        } catch (error) {
          console.error('Error creating patient from lead:', error);
          alert(`Ошибка создания пациента: ${error.message}`);
          throw error;
        }
      },
      appointments: appointments  // Передаем записи для проверки конфликтов времени на фронтенде
    });
  };

  // Компонент карточки заявки для канбана
  const LeadCard = ({ lead, onDragStart }) => {
    const leadAmount = getLeadAmount(lead);
    const depositAmount = lead.deposit_amount || 0;
    const extraDeposit = lead.extra_deposit || 0;
    const appointmentDeposit = depositAmount - extraDeposit;
    const depositBalance = lead.deposit_balance;
    const patientDebt = lead.patient_debt;
    const appointmentPrice = lead.appointment_price || 0;
    const tasks = leadTasks[lead.id] || [];
    const urgentTasks = tasks.filter(t => t.status !== 'completed' && t.priority === 'high').length;

    // Загружаем задачи при монтировании карточки
    useEffect(() => {
      loadLeadTasks(lead.id);
    }, [lead.id]);

    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, lead)}
        onClick={() => handleShowLeadHmsData(lead)}
        className={cn(
          "bg-white dark:bg-gray-800 rounded-lg p-4 mb-3 border border-gray-200 dark:border-gray-600",
          "hover:shadow-md transition-all cursor-pointer",
          themeClasses.shadow.sm
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h4 className={cn("font-medium text-sm truncate", themeClasses.text.primary)}>
              {lead.full_name || `${lead.first_name} ${lead.last_name}`}
            </h4>
            <p className={cn("text-xs mt-1", themeClasses.text.muted)}>
              {leadSources[lead.source] || 'Источник'}
            </p>
          </div>
          <div className="flex items-center space-x-1 ml-2">
            {urgentTasks > 0 && (
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            )}
            <button 
              onClick={(e) => e.stopPropagation()}
              className={cn("p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700")}
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Amount */}
        <div className="mb-3">
          <span className={cn("text-lg font-bold", themeClasses.text.primary)}>
            {leadAmount.toLocaleString()} ₸
          </span>
          {/* Показываем депозит если есть */}
          {depositAmount > 0 && (
            <div className="mt-1 space-y-0.5">
              <span className="text-sm font-medium text-blue-600">
                💰 Депозит: {appointmentDeposit.toLocaleString()} ₸
              </span>
              {extraDeposit > 0 && (
                <span className="text-xs font-medium text-green-600 block">
                  💳 +{extraDeposit.toLocaleString()} ₸ доплата
                </span>
              )}
              {(appointmentDeposit > 0 && extraDeposit > 0) && (
                <span className="text-xs text-gray-500 block">
                  Итого: {depositAmount.toLocaleString()} ₸
                </span>
              )}
              {/* Показываем остаток депозита или долг */}
              {depositBalance !== null && depositBalance !== undefined && depositBalance > 0 && (
                <div className="mt-1">
                  <span className="text-sm font-medium text-green-600">
                    💵 Остаток: {depositBalance.toLocaleString()} ₸
                  </span>
                </div>
              )}
              {/* Показываем долг если депозит < стоимости */}
              {patientDebt !== null && patientDebt !== undefined && patientDebt > 0 && (
                <div className="mt-1">
                  <span className="text-sm font-medium text-red-600">
                    ⚠️ Долг: {patientDebt.toLocaleString()} ₸
                  </span>
                </div>
              )}
              {/* Если депозит полностью использован (остаток = 0) */}
              {depositBalance === 0 && !patientDebt && (
                <div className="mt-1">
                  <span className="text-sm font-medium text-gray-500">
                    ✅ Использован
                  </span>
                </div>
              )}
            </div>
          )}
          {/* Показываем цену записи если есть */}
          {appointmentPrice > 0 && depositAmount === 0 && (
            <div className="mt-1">
              <span className="text-xs text-gray-500">
                Запись: {appointmentPrice.toLocaleString()} ₸
              </span>
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center space-x-2">
            <Phone className="w-3 h-3 text-blue-500" />
            <span className={cn("text-xs truncate", themeClasses.text.secondary)}>
              {lead.phone}
            </span>
            {lead.phone && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setWhatsAppPhone(lead.phone);
                  setWhatsAppLeadName(`${lead.first_name} ${lead.last_name}`);
                  setShowWhatsAppSidebar(true);
                }}
                className="text-green-500 hover:text-green-600 transition-colors"
                title="Открыть WhatsApp"
              >
                <FaWhatsapp className="w-4 h-4" />
              </button>
            )}
          </div>
          {lead.email && (
            <div className="flex items-center space-x-2">
              <Mail className="w-3 h-3 text-green-500" />
              <span className={cn("text-xs truncate", themeClasses.text.secondary)}>
                {lead.email}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        {lead.description && (
          <div className="mb-3">
            <p className={cn("text-xs", themeClasses.text.muted)} title={lead.description}>
              {lead.description.length > 50 ? lead.description.substring(0, 50) + '...' : lead.description}
            </p>
          </div>
        )}

        {/* Tasks and appointment button */}
        <div className="space-y-2">
          {tasks.length > 0 && (
            <div className="flex items-center space-x-2 text-xs">
              <CheckSquare className="w-3 h-3 text-gray-400" />
              <span className={themeClasses.text.muted}>
                {tasks.filter(t => t.status === 'completed').length}/{tasks.length} заданий
              </span>
            </div>
          )}
          
          {/* Кнопки действий */}
          <div className="space-y-1">
            {/* Кнопка назначения приема */}
            {lead.status === 'new' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleScheduleAppointment(lead);
                }}
                className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center space-x-1"
              >
                <Calendar className="w-3 h-3" />
                <span>Назначить прием</span>
              </button>
            )}
            
            {/* Кнопка создания задачи */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLead(lead);
                setShowTaskModal(true);
              }}
              className="w-full px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center justify-center space-x-1"
            >
              <CheckSquare className="w-3 h-3" />
              <span>Создать задачу</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <User className="w-3 h-3 text-gray-400" />
            <span className={cn("text-xs", themeClasses.text.muted)}>
              {lead.manager_name || 'Не назначен'}
            </span>
          </div>
          <span className={cn("text-xs", themeClasses.text.muted)}>
            {new Date(lead.created_at).toLocaleDateString('ru-RU')}
          </span>
        </div>
      </div>
    );
  };

  // Drag & Drop handlers
  const handleDragStart = (e, lead) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      leadId: lead.id,
      currentStatus: lead.status
    }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.currentStatus !== newStatus) {
        await handleStatusChange(data.leadId, newStatus);
      }
    } catch (error) {
      console.error('Error dropping lead:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl ${themeClasses.shadow.default}`}>
        <PanelHeader
          title="Сделки"
          subtitle="Управление заявками и сделками"
          onAction={() => setShowCreateModal(true)}
          actionLabel="+ Добавить"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button className="bg-green-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-green-700 transition-colors">
                создать
              </button>
              <button className={cn("px-4 py-2 text-sm rounded-lg border", themeClasses.border.default, themeClasses.text.secondary)}>
                общие
              </button>
              <button className={cn("px-4 py-2 text-sm rounded-lg border", themeClasses.border.default, themeClasses.text.secondary)}>
                сделки в работе
              </button>
              <span className={cn("text-sm px-2", themeClasses.text.muted)}>+ поиск</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn("pl-9 pr-4 py-2 text-sm rounded-lg w-64", themeClasses.input.default)}
                />
              </div>
            </div>
          </div>

          {/* Kanban Board */}
          <div className="flex overflow-x-auto h-screen">
        {kanbanColumns.map((column) => {
          const stats = getColumnStats(column.status);
          const columnLeads = groupedLeads[column.status] || [];
          
          return (
            <div 
              key={column.id}
              className="flex-shrink-0 w-80 h-full"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.status)}
            >
              {/* Column Header */}
              <div className={cn("p-4 border-r border-b", column.bgColor, themeClasses.border.default)}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={cn("font-medium", themeClasses.text.primary)}>
                    {column.title}
                  </h3>
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => handleEditColumn(column)}
                      className="p-1 hover:bg-white/50 dark:hover:bg-gray-600 rounded"
                      title="Редактировать колонку"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => handleDeleteColumn(column.id)}
                      className="p-1 hover:bg-white/50 dark:hover:bg-gray-600 rounded"
                      title="Удалить колонку"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button className="p-1 hover:bg-white/50 dark:hover:bg-gray-600 rounded">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className={cn("text-2xl font-bold mb-1", themeClasses.text.primary)}>
                  {stats.totalAmount.toLocaleString()} ₸
                </div>
                
                <div className={cn("text-sm", themeClasses.text.muted)}>
                  {stats.count} {stats.count === 1 ? 'сделка' : stats.count < 5 ? 'сделки' : 'сделок'}
                </div>
              </div>

              {/* Column Content */}
              <div className={cn("p-4 overflow-y-auto border-r", column.bgColor, themeClasses.border.default)} style={{ height: 'calc(100vh - 140px)' }}>
                {columnLeads.length === 0 ? (
                  <div className="text-center py-8">
                    <p className={cn("text-sm", themeClasses.text.muted)}>Пусто</p>
                  </div>
                ) : (
                  columnLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onDragStart={handleDragStart}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
        
        {/* Add New Column Button */}
        <div className="flex-shrink-0 w-80 h-full flex items-start justify-center pt-8">
          <button
            onClick={handleCreateNewColumn}
            className={cn(
              "w-64 p-6 border-2 border-dashed rounded-lg transition-colors",
              "hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20",
              themeClasses.border.default,
              themeClasses.text.muted
            )}
          >
            <Plus className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-medium">Добавить колонку</p>
          </button>
        </div>
      </div>

      {/* Create Lead Modal */}
      <Modal 
        show={showCreateModal} 
        onClose={() => {
          setShowCreateModal(false);
          setFoundPatient(null);
          setFoundActiveLead(null);
        }}
        title="Новая заявка"
        errorMessage={error}
        size="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>ФИО *</label>
            <input
              type="text"
              value={newLead.first_name}
              onChange={(e) => setNewLead({...newLead, first_name: e.target.value})}
              className={inputClasses}
              placeholder="Введите ФИО"
            />
          </div>
          
          <div>
            <label className={labelClasses}>Телефон *</label>
            <div className="relative">
              <input
                type="tel"
                value={newLead.phone}
                onChange={handlePhoneChange}
                className={inputClasses}
                placeholder="+7 (___) ___-__-__"
              />
              {isCheckingPhone && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                </div>
              )}
            </div>
          </div>

          {/* Блок с информацией о найденном пациенте */}
          {foundPatient && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-start gap-3">
                <UserCheck className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Пациент найден в базе! Данные подставлены автоматически.
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-green-700 dark:text-green-300">
                    <p><span className="font-medium">ФИО:</span> {foundPatient.full_name}</p>
                    <p><span className="font-medium">Телефон:</span> {foundPatient.phone}</p>
                    {foundPatient.email && <p><span className="font-medium">Email:</span> {foundPatient.email}</p>}
                    {foundPatient.birth_date && <p><span className="font-medium">Дата рождения:</span> {foundPatient.birth_date}</p>}
                    {foundPatient.iin && <p><span className="font-medium">ИИН:</span> {foundPatient.iin}</p>}
                    {foundPatient.appointments_count > 0 && (
                      <p><span className="font-medium">Приёмов:</span> {foundPatient.appointments_count}</p>
                    )}
                    {foundPatient.revenue > 0 && (
                      <p><span className="font-medium">Выручка:</span> {foundPatient.revenue?.toLocaleString('ru-RU')} ₸</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Предупреждение об активном лиде */}
          {foundActiveLead && !foundPatient && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Активная заявка с таким телефоном уже существует! Данные подставлены.
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
                    <p><span className="font-medium">ФИО:</span> {foundActiveLead.full_name}</p>
                    <p><span className="font-medium">Статус:</span> {
                      foundActiveLead.status === 'new' ? 'Новая' :
                      foundActiveLead.status === 'contacted' ? 'Связались' :
                      foundActiveLead.status === 'in_progress' ? 'В работе' : foundActiveLead.status
                    }</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div>
            <label className={labelClasses}>Email</label>
            <input
              type="email"
              value={newLead.email}
              onChange={(e) => setNewLead({...newLead, email: e.target.value})}
              className={inputClasses}
              placeholder="example@email.com"
            />
          </div>
          
          <div>
            <label className={labelClasses}>Источник</label>
            <select
              value={newLead.source_id || newLead.source}
              onChange={(e) => {
                const selectedValue = e.target.value;
                const selectedSource = sources.find(s => s.id === selectedValue);
                if (selectedSource) {
                  setNewLead({
                    ...newLead, 
                    source_id: selectedValue,
                    source: selectedSource.type
                  });
                } else {
                  setNewLead({
                    ...newLead, 
                    source: selectedValue,
                    source_id: ''
                  });
                }
              }}
              className={inputClasses}
            >
              {sources.length > 0 ? (
                <>
                  <option value="">Выберите источник</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} ({source.type})
                    </option>
                  ))}
                </>
              ) : (
                Object.entries(leadSources).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))
              )}
            </select>
          </div>
          
          <div>
            <label className={labelClasses}>Описание</label>
            <textarea
              value={newLead.description}
              onChange={(e) => setNewLead({...newLead, description: e.target.value})}
              className={inputClasses}
              rows="3"
              placeholder="Описание заявки..."
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              setShowCreateModal(false);
              setFoundPatient(null);
              setFoundActiveLead(null);
            }}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleCreateLead}
            disabled={!newLead.first_name || !newLead.phone}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Создать
          </button>
        </div>
      </Modal>

      {/* Create Task Modal */}
      <Modal 
        show={showTaskModal} 
        onClose={() => setShowTaskModal(false)}
        title={`Новое задание для ${selectedLead?.first_name} ${selectedLead?.last_name}`}
        size="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Тип задания</label>
            <select
              value={newTask.type}
              onChange={(e) => setNewTask({...newTask, type: e.target.value})}
              className={inputClasses}
            >
              {Object.entries(taskTypes).map(([key, type]) => (
                <option key={key} value={key}>{type.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className={labelClasses}>Название *</label>
            <input
              type="text"
              value={newTask.title}
              onChange={(e) => setNewTask({...newTask, title: e.target.value})}
              className={inputClasses}
              placeholder="Название задания"
            />
          </div>
          
          <div>
            <label className={labelClasses}>Описание</label>
            <textarea
              value={newTask.description}
              onChange={(e) => setNewTask({...newTask, description: e.target.value})}
              className={inputClasses}
              rows="3"
              placeholder="Описание задания..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Приоритет</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                className={inputClasses}
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
              </select>
            </div>
            
            <div>
              <label className={labelClasses}>Срок выполнения</label>
              <input
                type="datetime-local"
                value={newTask.due_date}
                onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                className={inputClasses}
              />
            </div>
          </div>

          {/* Выбор статуса задачи */}
          <div>
            <label className={labelClasses}>Статус задачи</label>
            <select
              value={newTask.status}
              onChange={(e) => setNewTask({...newTask, status: e.target.value})}
              className={inputClasses}
            >
              {taskStatuses.length > 0 ? (
                taskStatuses.map((status) => (
                  <option key={status.id} value={status.code}>
                    {status.icon} {status.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="new">📋 Новая</option>
                  <option value="in_progress">⏳ В работе</option>
                  <option value="completed">✅ Выполнена</option>
                  <option value="cancelled">❌ Отменена</option>
                </>
              )}
            </select>
            {taskStatuses.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Статусы настраиваются в разделе "Справочники → Статусы задач"
              </p>
            )}
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setShowTaskModal(false)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleCreateTask}
            disabled={!newTask.title}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Создать задание
          </button>
        </div>
      </Modal>

      {/* Column Edit Modal */}
      <Modal 
        show={showColumnModal} 
        onClose={() => setShowColumnModal(false)}
        title={editingColumn ? "Редактировать колонку" : "Новая колонка"}
        size="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Название колонки *</label>
            <input
              type="text"
              value={newColumn.title}
              onChange={(e) => setNewColumn({...newColumn, title: e.target.value})}
              className={inputClasses}
              placeholder="Введите название колонки"
            />
          </div>
          
          <div>
            <label className={labelClasses}>Статус (идентификатор) *</label>
            <input
              type="text"
              value={newColumn.status}
              onChange={(e) => setNewColumn({...newColumn, status: e.target.value})}
              className={inputClasses}
              placeholder="например: new_status"
              disabled={editingColumn} // Нельзя менять статус у существующей колонки
            />
            {editingColumn && (
              <p className={cn("text-xs mt-1", themeClasses.text.muted)}>
                Статус нельзя изменить у существующей колонки
              </p>
            )}
          </div>

          <div>
            <label className={labelClasses}>Цвет колонки</label>
            <div className="grid grid-cols-6 gap-2 mt-2">
              {[
                'bg-gray-500',
                'bg-blue-500', 
                'bg-green-500',
                'bg-yellow-500',
                'bg-red-500',
                'bg-purple-500',
                'bg-pink-500',
                'bg-indigo-500',
                'bg-teal-500',
                'bg-orange-500',
                'bg-emerald-500',
                'bg-cyan-500'
              ].map((color) => (
                <button
                  key={color}
                  onClick={() => setNewColumn({
                    ...newColumn, 
                    color: color,
                    bgColor: color.replace('500', '50') + ' dark:' + color.replace('500', '900/20')
                  })}
                  className={cn(
                    "w-8 h-8 rounded-full border-2",
                    color,
                    newColumn.color === color ? "border-gray-800 dark:border-white" : "border-gray-300"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
            <h4 className={cn("text-sm font-medium mb-2", themeClasses.text.primary)}>Предварительный просмотр</h4>
            <div className={cn("p-3 rounded border", newColumn.bgColor, themeClasses.border.default)}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={cn("font-medium", themeClasses.text.primary)}>
                  {newColumn.title || 'Название колонки'}
                </h3>
                <div className="flex items-center space-x-1">
                  <Edit className="w-3 h-3" />
                  <Trash2 className="w-3 h-3" />
                  <Plus className="w-4 h-4" />
                </div>
              </div>
              <div className={cn("text-xl font-bold mb-1", themeClasses.text.primary)}>
                0 ₸
              </div>
              <div className={cn("text-sm", themeClasses.text.muted)}>
                0 сделок
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setShowColumnModal(false)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSaveColumn}
            disabled={!newColumn.title || !newColumn.status}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {editingColumn ? 'Обновить' : 'Создать'}
          </button>
        </div>
      </Modal>

      {/* HMS Data Modal */}
      <Modal
        show={showHmsDataModal}
        onClose={() => { setShowHmsDataModal(false); setSelectedLeadForHms(null); setHmsData({ appointments: [], treatmentPlans: [] }); }}
        title={selectedLeadForHms ? `Данные HMS - ${selectedLeadForHms.first_name} ${selectedLeadForHms.last_name}` : 'Данные HMS'}
        size="max-w-4xl"
      >
        {loadingHmsData ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Загрузка...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">📋 Планы лечения</h3>
              {hmsData.treatmentPlans.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">План</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус плана</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус оплаты</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Стоимость</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Оплачено</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата создания</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-200">
                    {hmsData.treatmentPlans.map((plan, i) => (
                      <tr key={plan.id || i}>
                        <td className="px-4 py-3 text-sm"><div className="font-medium">{plan.title || `План ${i+1}`}</div>{plan.assigned_doctor && <div className="text-xs text-gray-500">Назначен врачом {plan.assigned_doctor}</div>}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${plan.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{plan.status === 'approved' ? 'Утвержден' : plan.status || '-'}</span></td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${plan.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{plan.payment_status === 'paid' ? 'Оплачен' : 'Не оплачен'}</span></td>
                        <td className="px-4 py-3 text-sm">{plan.total_cost?.toLocaleString() || 0} ₸</td>
                        <td className="px-4 py-3 text-sm">{plan.paid_amount?.toLocaleString() || 0} ₸</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{plan.created_at ? new Date(plan.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="text-gray-500 text-center py-4">Планы лечения не найдены</div>}
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">📅 Приемы</h3>
              {hmsData.appointments.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата и время</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Врач</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Заметки</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-200">
                    {hmsData.appointments.map((a, i) => (
                      <tr key={a.id || i}>
                        <td className="px-4 py-3 text-sm">{a.appointment_date ? new Date(a.appointment_date).toLocaleDateString('ru-RU') + ', ' + (a.appointment_time || a.start_time || '') : '-'}</td>
                        <td className="px-4 py-3 text-sm">{a.doctor_name || 'Не указан'}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${a.status === 'completed' ? 'bg-green-100 text-green-800' : a.status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{a.status === 'completed' ? 'Завершен' : a.status === 'confirmed' ? 'Подтвержден' : 'Запланирован'}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-500">{a.notes || 'Нет заметок'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="text-gray-500 text-center py-4">Приемы не найдены</div>}
            </div>

            {/* Раздел задач */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">✅ Задачи</h3>
                <button
                  onClick={() => {
                    setSelectedLead(selectedLeadForHms);
                    setShowTaskModal(true);
                  }}
                  className="bg-purple-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Создать задачу
                </button>
              </div>
              {selectedLeadForHms && leadTasks[selectedLeadForHms.id]?.length > 0 ? (
                <div className="space-y-2">
                  {leadTasks[selectedLeadForHms.id].map((task) => {
                    const statusInfo = taskStatuses.find(s => s.code === task.status) || { icon: '📋', name: task.status, color: '#6B7280' };
                    return (
                      <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{statusInfo.icon}</span>
                          <div>
                            <div className="font-medium text-sm">{task.title}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <span>{taskTypes[task.type]?.label || task.type}</span>
                              {task.due_date && (
                                <span className={task.status === 'overdue' ? 'text-red-500' : ''}>
                                  • До {new Date(task.due_date).toLocaleDateString('ru-RU')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span 
                            className="px-2 py-1 text-xs rounded-full text-white"
                            style={{ backgroundColor: statusInfo.color }}
                          >
                            {statusInfo.name}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            task.priority === 'high' || task.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {task.priority === 'high' ? 'Высокий' : task.priority === 'urgent' ? 'Срочный' : task.priority === 'medium' ? 'Средний' : 'Низкий'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  Задач пока нет. Нажмите "Создать задачу" чтобы добавить.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4"><button onClick={() => setShowHmsDataModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Закрыть</button></div>
          </div>
        )}
      </Modal>

      {/* WhatsApp Sidebar */}
      <WhatsAppSidebar
        phone={whatsAppPhone}
        patientName={whatsAppLeadName}
        isOpen={showWhatsAppSidebar}
        onClose={() => {
          setShowWhatsAppSidebar(false);
          setWhatsAppPhone(null);
          setWhatsAppLeadName('');
        }}
      />
        </div>
      </div>
    </div>
  );
};

export default EnhancedLeadsView;
