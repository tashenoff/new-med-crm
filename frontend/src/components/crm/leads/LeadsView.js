import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import Modal from '../../modals/Modal';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../../modals/modalUtils';

const LeadsView = ({ user }) => {
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  // Состояния для проверки пациента по телефону
  const [foundPatient, setFoundPatient] = useState(null);
  const [foundActiveLead, setFoundActiveLead] = useState(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const phoneCheckTimeoutRef = useRef(null);

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

  // Статусы заявок
  const leadStatuses = {
    new: { label: 'Новая', color: 'bg-blue-100 text-blue-800', icon: '🆕' },
    contacted: { label: 'Связались', color: 'bg-yellow-100 text-yellow-800', icon: '📞' },
    in_progress: { label: 'В работе', color: 'bg-orange-100 text-orange-800', icon: '⏳' },
    converted: { label: 'Конвертирована', color: 'bg-green-100 text-green-800', icon: '✅' },
    rejected: { label: 'Отказ', color: 'bg-red-100 text-red-800', icon: '❌' },
    closed: { label: 'Закрыта', color: 'bg-gray-100 text-gray-800', icon: '🔒' }
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

  useEffect(() => {
    fetchLeads();
    fetchAvailableManagers();
    fetchSources();
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
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase())
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
        create_hms_patient: false,  // Только клиент CRM, без HMS
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

  const handleCreateAppointment = async (lead) => {
    try {
      // TODO: Implement appointment creation with HMS integration
      console.log('Creating appointment for lead:', lead);
      alert('Функция создания записи будет реализована');
    } catch (error) {
      console.error('Error creating appointment:', error);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🎯 Заявки</h1>
          <p className="text-gray-600 mt-1">Управление входящими заявками</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Новая заявка
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className={labelClasses}>Статус</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">Все статусы</option>
              {Object.entries(leadStatuses).map(([key, status]) => (
                <option key={key} value={key}>{status.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1">
            <label className={labelClasses}>Поиск</label>
            <input
              type="text"
              placeholder="Поиск по имени, телефону или email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      {/* Leads List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {filteredLeads.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Заявки не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Заявка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Контакты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Менеджер
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата создания
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="font-medium text-gray-900">
                          {lead.full_name || `${lead.first_name} ${lead.last_name}`}
                        </div>
                        <div className="text-sm text-gray-500">{lead.description}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Источник: {leadSources[lead.source]}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{lead.phone}</div>
                      <div className="text-sm text-gray-500">{lead.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className={`px-2 py-1 text-xs rounded-full font-medium ${leadStatuses[lead.status].color}`}
                      >
                        {Object.entries(leadStatuses).map(([key, status]) => (
                          <option key={key} value={key}>{status.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {lead.manager_name || 'Не назначен'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(lead.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleConvertToClient(lead)}
                        className="text-green-600 hover:text-green-900"
                        title="Конвертировать в клиента"
                      >
                        👥
                      </button>
                      <button
                        onClick={() => handleCreateAppointment(lead)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Создать запись на прием"
                      >
                        📅
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Lead Modal */}
      <Modal 
        show={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
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
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Блок с информацией о найденном пациенте */}
              {foundPatient && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-green-600 text-xl">✅</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">
                        Пациент найден в базе! Данные подставлены автоматически.
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-green-700">
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
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-yellow-600 text-xl">⚠️</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800">
                        Активная заявка с таким телефоном уже существует! Данные подставлены.
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-yellow-700">
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
                    // Если выбран источник из CRM (есть ID), устанавливаем source_id
                    const selectedSource = sources.find(s => s.id === selectedValue);
                    if (selectedSource) {
                      setNewLead({
                        ...newLead, 
                        source_id: selectedValue,
                        source: selectedSource.type
                      });
                    } else {
                      // Фолбэк для старых источников
                      setNewLead({
                        ...newLead, 
                        source: selectedValue,
                        source_id: ''
                      });
                    }
                  }}
                  className={inputClasses}
                >
                  <option value="">Выберите источник</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} ({source.type})
                    </option>
                  ))}
                  {/* Фолбэк для старых данных */}
                  {sources.length === 0 && Object.entries(leadSources).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
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
                onClick={() => setShowCreateModal(false)}
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
    </div>
  );
};

export default LeadsView;
