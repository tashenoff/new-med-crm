import React, { useState, useEffect } from 'react';
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
    clearError
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

  const handleCreateLead = async () => {
    try {
      await createLead(newLead);
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
      alert('Заявка успешно создана!');
    } catch (error) {
      console.error('Error creating lead:', error);
      alert('Ошибка при создании заявки');
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Имя *</label>
                  <input
                    type="text"
                    value={newLead.first_name}
                    onChange={(e) => setNewLead({...newLead, first_name: e.target.value})}
                    className={inputClasses}
                    placeholder="Введите имя"
                  />
                </div>
                <div>
                  <label className={labelClasses}>Фамилия *</label>
                  <input
                    type="text"
                    value={newLead.last_name}
                    onChange={(e) => setNewLead({...newLead, last_name: e.target.value})}
                    className={inputClasses}
                    placeholder="Введите фамилию"
                  />
                </div>
              </div>
              
              <div>
                <label className={labelClasses}>Телефон *</label>
                <input
                  type="tel"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                  className={inputClasses}
                  placeholder="+7 (___) ___-__-__"
                />
              </div>
              
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
                disabled={!newLead.first_name || !newLead.last_name || !newLead.phone}
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
