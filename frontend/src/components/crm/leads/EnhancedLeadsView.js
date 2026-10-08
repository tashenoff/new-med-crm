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
import { normalizeIdentityPhone } from '../../../utils/leadIdentity';
import { loadLeadHmsData } from '../../../utils/leadHmsData';
import LeadHistory from './LeadHistoryTimeline';
import { historyStatusLabel } from '../../../utils/leadHistory';
import { useKanbanColumns } from '../../../hooks/useKanbanColumns';
import { cardColumnId, canMoveCard, manualColumn } from '../../../utils/kanbanColumns';
import FirstTouchDateFilter from './FirstTouchDateFilter';
import { firstTouchDateRange, matchesFirstTouchDate } from '../../../utils/firstTouchDateFilter';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../../modals/modalUtils';

const fetchHistoryCalls = async ({ phone, limit, offset }) => {
  const API = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
  const query = new URLSearchParams({ phone, limit, offset });
  const response = await fetch(`${API}/api/telephony/calls?${query}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  if (!response.ok) throw new Error('Не удалось загрузить звонки');
  return response.json();
};

const EnhancedLeadsView = ({ user }) => {
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ preset: 'all', from: '', to: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);
  const [columnEditMode, setColumnEditMode] = useState(false);
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
  const [newColumnName, setNewColumnName] = useState('');

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
    applyLeadKanbanMove,
    createLead,
    convertLead,
    deleteLead,
    fetchAvailableManagers,
    fetchSources,
    clearError,
    checkPatientByPhone
  } = useCrm({ kanban: true });

  const columnConfig = useKanbanColumns(fetchLeads, applyLeadKanbanMove);
  const kanbanColumns = columnConfig.columns;

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
    },
    qualified: {
      label: 'Квалифицирован',
      color: 'bg-indigo-100 text-indigo-800',
      icon: <UserCheck className="w-4 h-4" />,
      badge: 'bg-indigo-500'
    },
    lost: {
      label: 'Потерян',
      color: 'bg-gray-100 text-gray-800',
      icon: <AlertCircle className="w-4 h-4" />,
      badge: 'bg-gray-500'
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

  useEffect(() => {
    filteredLeads.forEach(lead => loadLeadTasks(lead.id));
  }, [filteredLeads]);

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
  }, [leads, searchTerm, dateFilter]);

  const filterLeads = () => {
    const dateRange = firstTouchDateRange(dateFilter.preset, dateFilter);
    let filtered = leads.filter(lead => matchesFirstTouchDate(lead, dateRange));
    
    if (searchTerm) {
      filtered = filtered.filter(lead => [lead, ...(lead.linked_inquiries || [])].some(touch =>
        touch.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        touch.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        touch.phone?.includes(searchTerm) ||
        touch.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (touch.first_name + ' ' + (touch.last_name || '')).toLowerCase().includes(searchTerm.toLowerCase())
      ));
    }
    
    setFilteredLeads(filtered);
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

      setHmsData(await loadLeadHmsData(lead, patients, API, token));
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
    if (column.is_system) return;
    setEditingColumn(column);
    setNewColumnName(column.name);
    setShowColumnModal(true);
  };

  const handleCreateNewColumn = () => {
    setEditingColumn(null);
    setNewColumnName('');
    setShowColumnModal(true);
  };

  const handleSaveColumn = async event => {
    event.preventDefault();
    const name = newColumnName.trim();
    if (!name || columnConfig.busy) return;
    const path = editingColumn ? `/kanban/columns/${encodeURIComponent(editingColumn.id)}` : '/kanban/columns';
    if (await columnConfig.mutate(path, editingColumn ? 'PATCH' : 'POST', { name })) {
      setShowColumnModal(false);
      setEditingColumn(null);
    }
  };

  const handleReorderColumn = (column, direction) => {
    if (!columnEditMode || columnConfig.loading || columnConfig.busy || column.is_system || ![-1, 1].includes(direction)) return;
    const current = kanbanColumns.find(item => item.id === column.id);
    if (!current || current.is_system) return;
    const columnIds = kanbanColumns.map(item => item.id);
    const index = columnIds.indexOf(column.id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= columnIds.length) return;
    [columnIds[index], columnIds[destination]] = [columnIds[destination], columnIds[index]];
    columnConfig.mutate('/kanban/columns/order', 'PUT', { column_ids: columnIds });
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

  const groupedLeads = kanbanColumns.reduce((acc, column) => {
    acc[column.id] = filteredLeads.filter(lead => cardColumnId(lead) === column.id);
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
  const renderLeadCard = (lead) => {
    const leadAmount = getLeadAmount(lead);
    const depositAmount = lead.deposit_amount || 0;
    const extraDeposit = lead.extra_deposit || 0;
    const appointmentDeposit = depositAmount - extraDeposit;
    const depositBalance = lead.deposit_balance;
    const patientDebt = lead.patient_debt;
    const appointmentPrice = lead.appointment_price || 0;
    const tasks = leadTasks[lead.id] || [];
    const urgentTasks = tasks.filter(t => t.status !== 'completed' && t.priority === 'high').length;

    return (
      <div
        key={lead.id}
        data-lead-id={lead.id}
        draggable={!columnConfig.busy && !columnConfig.loading && lead.status === 'new' && manualColumn(kanbanColumns.find(column => column.id === cardColumnId(lead)))}
        onDragStart={(e) => handleDragStart(e, lead)}
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
            {lead.linked_inquiries?.length > 0 && (
              <p className="text-xs mt-1 text-blue-600 dark:text-blue-400">
                Связанных обращений: {lead.linked_inquiries.length} · {[...new Set(lead.linked_inquiries.map(touch => leadSources[touch.source] || touch.source))].join(', ')}
              </p>
            )}
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

  const handleDragStart = (event, lead) => {
    const source = kanbanColumns.find(column => column.id === cardColumnId(lead));
    if (columnConfig.busy || columnConfig.loading || lead.status !== 'new' || !manualColumn(source)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({ leadId: lead.id }));
  };

  const handleDrop = async (event, destination) => {
    event.preventDefault();
    if (columnConfig.busy || columnConfig.loading || !manualColumn(destination)) return;
    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));
      const lead = leads.find(item => item.id === data.leadId);
      if (lead && canMoveCard(lead, destination, kanbanColumns)) {
        await columnConfig.moveCard(lead, destination);
      }
    } catch {
      return;
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
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <div className="w-full min-w-0 sm:w-auto">
                <FirstTouchDateFilter value={dateFilter} onChange={setDateFilter} />
              </div>
              <button type="button" aria-pressed={columnEditMode}
                onClick={() => { if (!columnConfig.loading && !columnConfig.busy) setColumnEditMode(value => !value); }}
                disabled={columnConfig.loading || columnConfig.busy}
                className={cn(buttonSecondaryClasses, "text-sm disabled:opacity-50")}>
                {columnEditMode ? 'Готово' : 'Редактировать колонки'}
              </button>
              <button type="button" onClick={handleCreateNewColumn} disabled={columnConfig.loading || columnConfig.busy}
                className={cn(buttonSecondaryClasses, "inline-flex items-center gap-2 text-sm disabled:opacity-50")}>
                <Plus className="w-4 h-4" /> Добавить колонку
              </button>
            </div>

            <div className="flex min-w-0 items-center">
              {/* Search */}
              <div className="relative w-full lg:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn("pl-9 pr-4 py-2 text-sm rounded-lg w-full", themeClasses.input.default)}
                />
              </div>
            </div>
          </div>

      {/* Kanban Board */}
      <section aria-label="Колонки Канбан" className="min-w-0">
        <p className={cn("text-sm mb-3", themeClasses.text.muted)}>Общие колонки для всех сотрудников клиники</p>
        {columnEditMode && <p className={cn("text-sm mb-3", themeClasses.text.muted)}>Перемещать можно только пользовательские колонки. Системные колонки сохраняют свой относительный порядок.</p>}
        {columnConfig.loading && <p role="status" className={themeClasses.text.secondary}>Загрузка колонок…</p>}
        {columnConfig.busy && <p role="status" className={themeClasses.text.secondary}>Сохранение изменений…</p>}
        {columnConfig.error && <div role="alert" className="mb-3 p-3 rounded-lg bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {columnConfig.error}
          <button type="button" onClick={columnConfig.reload} disabled={columnConfig.busy} className="ml-3 underline">Обновить колонки</button>
        </div>}
        {columnConfig.notice && <p role="status" className={themeClasses.text.secondary}>{columnConfig.notice}</p>}
      <div className="flex overflow-x-auto items-stretch pb-3" tabIndex={0} aria-label="Доска сделок">
        {kanbanColumns.map((column, index) => {
          const stats = getColumnStats(column.id);
          const columnLeads = groupedLeads[column.id] || [];
          const background = column.is_system
            ? { new: 'bg-gray-50 dark:bg-gray-800', contacted: 'bg-blue-50 dark:bg-blue-900/20',
                in_progress: 'bg-yellow-50 dark:bg-yellow-900/20', converted: 'bg-purple-50 dark:bg-purple-900/20',
                closed: 'bg-green-50 dark:bg-green-900/20' }[column.id]
            : 'bg-slate-50 dark:bg-slate-900/30';
          
          return (
            <div 
              key={column.id}
              data-column-id={column.id}
              className="flex-shrink-0 w-72 sm:w-80 flex flex-col"
              onDragOver={event => {
                if (!columnConfig.busy && !columnConfig.loading && manualColumn(column)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => handleDrop(event, column)}
            >
              {/* Column Header */}
              <div className={cn("p-4 border-r border-b min-h-40", background, themeClasses.border.default)}>
                <div className="mb-2">
                  <h3 className={cn("font-medium break-words", themeClasses.text.primary)}>
                    {column.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1 my-2">
                    {column.is_system && <span className="text-xs px-2 py-1 rounded bg-white/70 dark:bg-gray-700">Системная</span>}
                    {columnEditMode && !column.is_system && <>
                    <button type="button" aria-label={`Переместить «${column.name}» влево`} disabled={index === 0 || columnConfig.busy || columnConfig.loading}
                      onClick={() => handleReorderColumn(column, -1)} className="p-1 rounded hover:bg-white/50 dark:hover:bg-gray-600 disabled:opacity-30">←</button>
                    <button type="button" aria-label={`Переместить «${column.name}» вправо`} disabled={index === kanbanColumns.length - 1 || columnConfig.busy || columnConfig.loading}
                      onClick={() => handleReorderColumn(column, 1)} className="p-1 rounded hover:bg-white/50 dark:hover:bg-gray-600 disabled:opacity-30">→</button>
                    </>}
                    {!column.is_system && <>
                    <button 
                      type="button"
                      aria-label={`Переименовать «${column.name}»`}
                      disabled={columnConfig.busy || columnConfig.loading}
                      onClick={() => handleEditColumn(column)}
                      className="p-1 hover:bg-white/50 dark:hover:bg-gray-600 rounded"
                      title="Редактировать колонку"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button 
                      type="button"
                      aria-label={`Удалить «${column.name}»`}
                      disabled={columnConfig.busy || columnConfig.loading}
                      onClick={() => columnConfig.remove(column)}
                      className="p-1 hover:bg-white/50 dark:hover:bg-gray-600 rounded"
                      title="Удалить колонку"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    </>}
                  </div>
                </div>
                
                <div className={cn("text-2xl font-bold mb-1", themeClasses.text.primary)}>
                  {stats.totalAmount.toLocaleString()} ₸
                </div>
                
                <div className={cn("text-sm", themeClasses.text.muted)}>
                  Карточек: {stats.count}
                </div>
                {!manualColumn(column) && <p className={cn("text-xs mt-1", themeClasses.text.muted)}>Обновляется автоматически</p>}
              </div>

              {/* Column Content */}
              <div className={cn("p-4 overflow-y-auto border-r flex-1", background, themeClasses.border.default)} style={{ maxHeight: '70vh', minHeight: '16rem' }}>
                {columnLeads.length === 0 ? (
                  <div className="text-center py-8">
                    <p className={cn("text-sm", themeClasses.text.muted)}>Пусто</p>
                  </div>
                ) : (
                  columnLeads.map(renderLeadCard)
                )}
              </div>
            </div>
          );
        })}
        
      </div>
      </section>

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
        onClose={() => { if (!columnConfig.busy) setShowColumnModal(false); }}
        title={editingColumn ? "Переименовать колонку" : "Новая колонка"}
        size="max-w-md"
      >
        <form onSubmit={handleSaveColumn} className="space-y-4">
          <p className={cn("text-sm", themeClasses.text.muted)}>Изменения видны всем сотрудникам клиники.</p>
          <div>
            <label htmlFor="kanban-column-name" className={labelClasses}>Название колонки *</label>
            <input
              id="kanban-column-name"
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              maxLength={100}
              required
              autoFocus
              disabled={columnConfig.busy}
              className={inputClasses}
              placeholder="Введите название колонки"
            />
          </div>
          
          {columnConfig.error && <p role="alert" className="text-red-600 dark:text-red-300">{columnConfig.error}</p>}
        
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            disabled={columnConfig.busy}
            onClick={() => setShowColumnModal(false)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={columnConfig.busy || !newColumnName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {columnConfig.busy ? 'Сохранение…' : editingColumn ? 'Сохранить' : 'Создать'}
          </button>
        </div>
        </form>
      </Modal>

      {/* HMS Data Modal */}
      <Modal
        show={showHmsDataModal}
        onClose={() => { setShowHmsDataModal(false); setSelectedLeadForHms(null); setHmsData({ appointments: [], treatmentPlans: [] }); }}
        title={selectedLeadForHms ? `История и данные - ${selectedLeadForHms.full_name}` : 'История и данные'}
        size="max-w-4xl"
      >
        {loadingHmsData ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Загрузка...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <LeadHistory lead={selectedLeadForHms} fetchCalls={fetchHistoryCalls} />
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
                        <td className="px-4 py-3 text-sm"><div className="font-medium">{plan.title || `План ${i+1}`}</div>{plan.doctor_name && <div className="text-xs text-gray-500">Врач: {plan.doctor_name}</div>}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${plan.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{historyStatusLabel('plan', plan.status)}</span></td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${plan.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{historyStatusLabel('payment', plan.payment_status)}</span></td>
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
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${a.status === 'completed' ? 'bg-green-100 text-green-800' : a.status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{historyStatusLabel('appointment', a.status)}</span></td>
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
