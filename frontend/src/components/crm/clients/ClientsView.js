import React, { useState, useEffect, useMemo } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import { useCrmApi } from '../../../hooks/useCrmApi';
import { useGlobalRefresh } from '../../../hooks/useGlobalRefresh';
import { useTreatmentPlanSync } from '../../../hooks/useTreatmentPlanSync';
import { useLastAppointments } from '../../../hooks/useLastAppointments';
import { usePatients } from '../../../hooks/usePatients';
import TreatmentPlanInfo from './TreatmentPlanInfo';
import Modal from '../../modals/Modal';
import { tableClasses, tableHeaderClasses, tableRowClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../../modals/modalUtils';
import TelephonySection from '../telephony/TelephonySection';

const ClientsView = ({ user }) => {
  const [activeView, setActiveView] = useState('clients'); // 'clients' или 'telephony'
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHmsDataModal, setShowHmsDataModal] = useState(false);
  const [selectedClientForHms, setSelectedClientForHms] = useState(null);
  const [hmsData, setHmsData] = useState({ appointments: [], treatmentPlans: [] });
  const [loadingHmsData, setLoadingHmsData] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    phone: '',
    email: '',
    budget: '',
    description: ''
  });

  const {
    clients,
    loading,
    error,
    isInitialized,
    fetchClients,
    createClient,
    clearError
  } = useCrm();

  const crmApi = useCrmApi();
  const { refreshPatients, refreshAllHMS, refreshTriggers } = useGlobalRefresh();
  
  // Хук для HMS пациентов
  const { 
    patients: hmsPatients, 
    loading: patientsLoading, 
    fetchPatients 
  } = usePatients();

  // Хук для синхронизации планов лечения
  const {
    treatmentPlansData,
    syncMultipleClients,
    isClientSyncing
  } = useTreatmentPlanSync();

  // Хук для получения последних приемов
  const {
    appointmentsData,
    loadMultipleAppointments,
    isClientAppointmentLoading,
    getCachedAppointment
  } = useLastAppointments();

  // ✨ Загружаем HMS пациентов при инициализации
  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // ✨ Объединяем CRM клиентов и HMS пациентов
  const allContacts = useMemo(() => {
    // Создаём Set из hms_patient_id для быстрого поиска
    const linkedPatientIds = new Set(
      clients
        .filter(c => c.is_hms_patient && c.hms_patient_id)
        .map(c => c.hms_patient_id)
    );

    // CRM клиенты с маркировкой
    const crmContacts = clients.map(client => ({
      ...client,
      _source: 'crm',
      _displayName: `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.phone,
      _isLinkedToHMS: client.is_hms_patient
    }));

    // HMS пациенты, которые НЕ связаны с CRM (избегаем дубликатов)
    const hmsOnlyContacts = hmsPatients
      .filter(patient => !linkedPatientIds.has(patient.id))
      .map(patient => ({
        id: patient.id,
        first_name: patient.first_name || (patient.full_name ? patient.full_name.split(' ')[0] : ''),
        last_name: patient.last_name || (patient.full_name ? patient.full_name.split(' ').slice(1).join(' ') : ''),
        phone: patient.phone || '',
        email: patient.email || '',
        created_at: patient.created_at,
        is_hms_patient: true,
        hms_patient_id: patient.id,
        _source: 'hms',
        _displayName: patient.full_name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
        _isLinkedToHMS: true
      }));

    return [...crmContacts, ...hmsOnlyContacts];
  }, [clients, hmsPatients]);

  // Фильтрация контактов
  useEffect(() => {
    let filtered = allContacts;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = allContacts.filter(contact => 
        contact._displayName?.toLowerCase().includes(term) ||
        contact.phone?.includes(searchTerm) ||
        (contact.email && contact.email.toLowerCase().includes(term))
      );
    }
    
    setFilteredContacts(filtered);
  }, [allContacts, searchTerm]);

  // ✨ АВТОМАТИЧЕСКАЯ СИНХРОНИЗАЦИЯ ПЛАНОВ ЛЕЧЕНИЯ
  useEffect(() => {
    const hmsContacts = allContacts.filter(c => c._isLinkedToHMS);
    if (hmsContacts.length > 0 && isInitialized) {
      console.log('🔄 Запуск автоматической синхронизации планов лечения для контактов');
      syncMultipleClients(hmsContacts);
    }
  }, [allContacts, isInitialized, syncMultipleClients]);

  // ✨ АВТОМАТИЧЕСКАЯ ЗАГРУЗКА ИНФОРМАЦИИ О ПРИЕМАХ
  useEffect(() => {
    const hmsContacts = allContacts.filter(c => c._isLinkedToHMS);
    if (hmsContacts.length > 0 && isInitialized) {
      loadMultipleAppointments(hmsContacts);
    }
  }, [allContacts, isInitialized, loadMultipleAppointments]);

  // ✨ СЛУШАЕМ ГЛОБАЛЬНЫЕ ИЗМЕНЕНИЯ ПЛАНОВ ЛЕЧЕНИЯ
  useEffect(() => {
    const hmsContacts = allContacts.filter(c => c._isLinkedToHMS);
    if (refreshTriggers.treatmentPlans && hmsContacts.length > 0) {
      console.log('🔄 Получен триггер обновления планов лечения, перезагружаем данные');
      syncMultipleClients(hmsContacts);
    }
  }, [refreshTriggers.treatmentPlans, allContacts, syncMultipleClients]);

  // Слушаем обновления пациентов
  useEffect(() => {
    if (refreshTriggers.patients) {
      fetchPatients();
    }
  }, [refreshTriggers.patients, fetchPatients]);

  const handleCreateClient = async () => {
    try {
      await createClient(newClient);
      setShowCreateModal(false);
      setNewClient({
        first_name: '',
        last_name: '',
        middle_name: '',
        phone: '',
        email: '',
        budget: '',
        description: ''
      });
      alert('Контакт успешно создан!');
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Ошибка при создании контакта');
    }
  };

  const handleShowHmsData = async (client) => {
    if (!client._isLinkedToHMS) {
      alert('Контакт не является пациентом HMS');
      return;
    }

    setSelectedClientForHms(client);
    setShowHmsDataModal(true);
    setLoadingHmsData(true);

    try {
      const API = import.meta.env.VITE_BACKEND_URL;
      const token = localStorage.getItem('token');

      // Для чистых HMS пациентов используем hms_patient_id напрямую
      // Для CRM клиентов используем интеграционный API
      const patientId = client.hms_patient_id || client.id;
      
      let appointmentsResponse, treatmentPlansResponse;
      
      if (client._source === 'hms') {
        // Прямой доступ к HMS API для чистых HMS пациентов
        [appointmentsResponse, treatmentPlansResponse] = await Promise.all([
          fetch(`${API}/api/appointments?patient_id=${patientId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
          fetch(`${API}/api/patients/${patientId}/treatment-plans`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
        ]);
      } else {
        // Используем CRM интеграционный API для CRM клиентов
        [appointmentsResponse, treatmentPlansResponse] = await Promise.all([
          fetch(`${API}/api/crm/integration/client-hms-data/${client.id}/appointments`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
          fetch(`${API}/api/crm/integration/client-hms-data/${client.id}/treatment-plans`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
        ]);
      }

      const appointments = appointmentsResponse.ok ? await appointmentsResponse.json() : [];
      const treatmentPlans = treatmentPlansResponse.ok ? await treatmentPlansResponse.json() : [];

      setHmsData({
        appointments: appointments || [],
        treatmentPlans: treatmentPlans || []
      });
    } catch (error) {
      console.error('Error loading HMS data:', error);
      setHmsData({ appointments: [], treatmentPlans: [] });
    } finally {
      setLoadingHmsData(false);
    }
  };

  const handleCreateAppointment = (client) => {
    // TODO: Integration with HMS
    console.log('Creating appointment for client:', client);
    alert('Интеграция с HMS для создания записи будет реализована');
  };

  const handleConvertToHMS = async (client) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/crm/clients/${client.id}/convert-to-hms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        alert('Контакт успешно конвертирован в пациента HMS!');
        // Перезагружаем данные клиентов
        fetchClients();
        // ✨ ГЛАВНОЕ ИЗМЕНЕНИЕ: Запускаем глобальное обновление списка пациентов HMS
        refreshPatients();
        console.log('🔄 Запущено обновление списка пациентов HMS после конвертации клиента');
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error converting client to HMS:', error);
      alert('Ошибка при конвертации контакта');
    }
  };



  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h3 className="font-bold">Ошибка загрузки</h3>
          <p>{error}</p>
          <button 
            onClick={clearError}
            className="mt-2 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Переключатель вкладок */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex gap-2 p-2">
          <button
            onClick={() => setActiveView('clients')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              activeView === 'clients'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            👥 Контакты
          </button>
          <button
            onClick={() => setActiveView('telephony')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              activeView === 'telephony'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📞 API Телефонии
          </button>
        </div>
      </div>

      {/* Контент вкладок */}
      {activeView === 'telephony' ? (
        <TelephonySection />
      ) : (
        <>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">👥 Контакты</h1>
          <p className="text-gray-600 mt-1">CRM клиенты и HMS пациенты</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            + Новый контакт
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Всего контактов */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold">👥</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Всего</p>
              <p className="text-2xl font-bold text-gray-900">{allContacts.length}</p>
            </div>
          </div>
        </div>

        {/* CRM клиенты */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold">📋</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">CRM клиенты</p>
              <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
            </div>
          </div>
        </div>

        {/* HMS Пациенты */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-semibold">🏥</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">HMS пациенты</p>
              <p className="text-2xl font-bold text-gray-900">{hmsPatients.length}</p>
            </div>
          </div>
        </div>

        {/* Связанные */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-semibold">🔗</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Связанные CRM+HMS</p>
              <p className="text-2xl font-bold text-gray-900">
                {clients.filter(c => c.is_hms_patient).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <input
          type="text"
          placeholder="Поиск контактов..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
        />
      </div>

      {/* Contacts List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{loading || patientsLoading ? 'Загрузка...' : 'Контакты не найдены'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Контакт
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Телефон/Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Планы лечения
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Последний прием
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContacts.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{client._displayName || `${client.first_name} ${client.last_name}`}</div>
                      <div className="text-sm text-gray-500">
                        {client.created_at ? `с ${new Date(client.created_at).toLocaleDateString('ru-RU')}` : ''}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {client._source === 'hms' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            🏥 HMS
                          </span>
                        ) : client._source === 'crm' && client.is_hms_patient ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            🔗 CRM + HMS
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            📋 CRM
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{client.phone}</div>
                      <div className="text-sm text-gray-500">{client.email || 'Email не указан'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client._isLinkedToHMS ? (
                        <TreatmentPlanInfo
                          treatmentData={treatmentPlansData[client.id]}
                          isLoading={isClientSyncing(client.id)}
                          clientId={client.id}
                          compact={true}
                        />
                      ) : (
                        <div className="text-xs text-gray-400">
                          Не пациент HMS
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const appointment = getCachedAppointment(client.id);
                        const isLoading = isClientAppointmentLoading(client.id);
                        
                        if (isLoading) {
                          return <div className="text-xs text-gray-400">⏳ Загрузка...</div>;
                        }
                        
                        if (appointment) {
                          return (
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {new Date(appointment.date).toLocaleDateString('ru-RU')} в {appointment.time}
                              </div>
                              <div className="text-xs text-blue-600 font-medium">
                                👨‍⚕️ {appointment.doctor_name}
                              </div>
                              {appointment.doctor_specialty && (
                                <div className="text-xs text-gray-500">
                                  📋 {appointment.doctor_specialty}
                                </div>
                              )}
                              {appointment.reason && (
                                <div className="text-xs text-gray-400 mt-1">
                                  💬 {appointment.reason}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                🏷️ {appointment.status === 'unconfirmed' ? 'Не подтвержден' : 
                                     appointment.status === 'confirmed' ? 'Подтвержден' :
                                     appointment.status === 'completed' ? 'Завершен' : appointment.status}
                              </div>
                              {appointment.deposit && appointment.deposit > 0 && (
                                <div className="text-xs text-green-600 font-medium mt-1">
                                  💰 Депозит: {appointment.deposit.toLocaleString()}₸
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        if (client._isLinkedToHMS) {
                          return <div className="text-xs text-gray-400">Нет завершенных приемов</div>;
                        } else {
                          return <div className="text-xs text-gray-400">Не пациент HMS</div>;
                        }
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {client._isLinkedToHMS ? (
                        <>
                          <button
                            onClick={() => handleShowHmsData(client)}
                            className="text-purple-600 hover:text-purple-900 mr-2"
                            title="Просмотр данных HMS"
                          >
                            📊
                          </button>
                          <button
                            onClick={() => handleCreateAppointment(client)}
                            className="text-blue-600 hover:text-blue-900 mr-2"
                            title="Записать на прием"
                          >
                            📅
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleConvertToHMS(client)}
                            className="text-green-600 hover:text-green-900 mr-2"
                            title="Конвертировать в пациента HMS"
                          >
                            🏥
                          </button>
                          <button
                            onClick={() => handleCreateAppointment(client)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Записать на прием"
                          >
                            📅
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Client Modal */}
      {showCreateModal && (
        <div 
          className="fixed bg-black bg-opacity-50 z-50 flex items-center justify-center" 
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            margin: 0,
            padding: 0
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Новый контакт</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Имя *</label>
                  <input
                    type="text"
                    value={newClient.first_name}
                    onChange={(e) => setNewClient({...newClient, first_name: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Введите имя"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия *</label>
                  <input
                    type="text"
                    value={newClient.last_name}
                    onChange={(e) => setNewClient({...newClient, last_name: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Введите фамилию"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Отчество</label>
                <input
                  type="text"
                  value={newClient.middle_name}
                  onChange={(e) => setNewClient({...newClient, middle_name: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Введите отчество"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
                <input
                  type="tel"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="+7 (___) ___-__-__"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="example@email.com"
                />
              </div>
              
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={newClient.description}
                  onChange={(e) => setNewClient({...newClient, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows="3"
                  placeholder="Дополнительная информация о контакте..."
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
                onClick={handleCreateClient}
                disabled={!newClient.first_name || !newClient.last_name || !newClient.phone}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HMS Data Modal */}
      <Modal
        show={showHmsDataModal}
        onClose={() => {
          setShowHmsDataModal(false);
          setSelectedClientForHms(null);
          setHmsData({ appointments: [], treatmentPlans: [] });
        }}
        title={selectedClientForHms ? `Данные HMS - ${selectedClientForHms.first_name} ${selectedClientForHms.last_name}` : 'Данные HMS'}
        size="max-w-4xl"
      >
        {loadingHmsData ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-400">Загрузка данных HMS...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Treatment Plans Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📋 Планы лечения</h3>
              {hmsData.treatmentPlans.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className={tableClasses}>
                    <thead className={tableHeaderClasses}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">План</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Статус плана</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Статус оплаты</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Стоимость</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Оплачено</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Дата создания</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {hmsData.treatmentPlans.map((plan, index) => (
                        <tr key={plan.id || index} className={tableRowClasses}>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            <div className="font-medium">{plan.plan_name || `План ${index + 1}`}</div>
                            {plan.description && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {plan.description}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              plan.status === 'approved' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : plan.status === 'active'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                                : plan.status === 'completed'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                            }`}>
                              {plan.status === 'approved' ? 'Утвержден' : 
                               plan.status === 'active' ? 'Активен' :
                               plan.status === 'completed' ? 'Завершен' :
                               plan.status === 'draft' ? 'Черновик' : plan.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              plan.payment_status === 'paid' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : plan.payment_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                : plan.payment_status === 'partially_paid'
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                            }`}>
                              {plan.payment_status === 'paid' ? 'Оплачен' : 
                               plan.payment_status === 'pending' ? 'Ожидает оплаты' : 
                               plan.payment_status === 'partially_paid' ? 'Частично оплачен' : 'Не оплачен'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {plan.total_cost ? `${plan.total_cost.toLocaleString()} ₸` : 'Не указана'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {plan.paid_amount ? `${plan.paid_amount.toLocaleString()} ₸` : '0 ₸'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {plan.created_at ? new Date(plan.created_at).toLocaleDateString('ru-RU') : 'Не указана'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                  Планы лечения не найдены
                </div>
              )}
            </div>

            {/* Appointments Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📅 Приемы</h3>
              {hmsData.appointments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className={tableClasses}>
                    <thead className={tableHeaderClasses}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Дата и время</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Врач</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Статус</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Заметки</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {hmsData.appointments.map((appointment, index) => (
                        <tr key={appointment.id || index} className={tableRowClasses}>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {appointment.appointment_date ? 
                              new Date(appointment.appointment_date).toLocaleString('ru-RU') : 
                              'Не указана'
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {appointment.doctor_name || 'Не указан'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              appointment.status === 'completed' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : appointment.status === 'confirmed'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                                : appointment.status === 'cancelled'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                            }`}>
                              {appointment.status === 'completed' ? 'Завершен' : 
                               appointment.status === 'confirmed' ? 'Подтвержден' :
                               appointment.status === 'cancelled' ? 'Отменен' : 'Запланирован'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {appointment.notes || 'Нет заметок'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                  Приемы не найдены
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setShowHmsDataModal(false)}
                className={buttonSecondaryClasses}
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </Modal>
        </>
      )}
    </div>
  );
};

export default ClientsView;
