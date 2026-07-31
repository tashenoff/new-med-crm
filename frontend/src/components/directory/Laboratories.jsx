import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../api/config';

const Laboratories = ({ user }) => {
  const [laboratories, setLaboratories] = useState([]);
  const [servicePrices, setServicePrices] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLabModal, setShowLabModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingLab, setEditingLab] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [activeTab, setActiveTab] = useState('labs'); // 'labs' или 'report'

  const [labForm, setLabForm] = useState({
    name: '',
    description: '',
    address: '',
    phone: '',
    email: '',
    contact_person: ''
  });

  const [serviceForm, setServiceForm] = useState({
    service_name: '',
    category: '',
    price: 0,
    unit: 'процедура',
    laboratory_id: '',
    laboratory_name: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedLab) {
      loadLabServices(selectedLab.id);
    }
  }, [selectedLab]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Загружаем лаборатории
      const labsRes = await axios.get(`${API_BASE_URL}/laboratories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLaboratories(labsRes.data);

      // Загружаем статистику
      const statsRes = await axios.get(`${API_BASE_URL}/laboratories/statistics/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatistics(statsRes.data);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLabServices = async (labId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/service-prices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Фильтруем услуги по лаборатории
      const filtered = res.data.filter(s => s.laboratory_id === labId);
      setServicePrices(filtered);
    } catch (error) {
      console.error('Error loading services:', error);
    }
  };

  const handleLabSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      if (editingLab) {
        await axios.put(
          `${API_BASE_URL}/laboratories/${editingLab.id}`,
          labForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_BASE_URL}/laboratories`,
          labForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setShowLabModal(false);
      setEditingLab(null);
      setLabForm({ name: '', description: '', address: '', phone: '', email: '', contact_person: '' });
      loadData();
    } catch (error) {
      console.error('Error saving laboratory:', error);
      alert('Ошибка при сохранении лаборатории');
    }
  };

  const handleServiceSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      if (editingService) {
        await axios.put(
          `${API_BASE_URL}/service-prices/${editingService.id}`,
          serviceForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_BASE_URL}/service-prices`,
          serviceForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setShowServiceModal(false);
      setEditingService(null);
      setServiceForm({ service_name: '', category: '', price: 0, unit: 'процедура', laboratory_id: '', laboratory_name: '' });
      if (selectedLab) {
        loadLabServices(selectedLab.id);
      }
      loadData();
    } catch (error) {
      console.error('Error saving service:', error);
      alert('Ошибка при сохранении услуги');
    }
  };

  const handleEditLab = (lab) => {
    setEditingLab(lab);
    setLabForm({
      name: lab.name,
      description: lab.description || '',
      address: lab.address || '',
      phone: lab.phone || '',
      email: lab.email || '',
      contact_person: lab.contact_person || ''
    });
    setShowLabModal(true);
  };

  const handleDeleteLab = async (labId) => {
    if (!confirm('Удалить лабораторию?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/laboratories/${labId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadData();
      if (selectedLab?.id === labId) {
        setSelectedLab(null);
        setServicePrices([]);
      }
    } catch (error) {
      console.error('Error deleting laboratory:', error);
      alert('Ошибка при удалении лаборатории');
    }
  };

  const handleAddServiceToLab = (lab) => {
    setSelectedLab(lab);
    setServiceForm({
      service_name: '',
      category: 'Лаборатория',
      price: 0,
      unit: 'анализ',
      laboratory_id: lab.id,
      laboratory_name: lab.name
    });
    setShowServiceModal(true);
  };

  const handleEditService = (service) => {
    setEditingService(service);
    setServiceForm({
      service_name: service.service_name,
      category: service.category || 'Лаборатория',
      price: service.price,
      unit: service.unit || 'анализ',
      laboratory_id: service.laboratory_id,
      laboratory_name: service.laboratory_name
    });
    setShowServiceModal(true);
  };

  const handleDeleteService = async (serviceId) => {
    if (!confirm('Удалить услугу?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/service-prices/${serviceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (selectedLab) {
        loadLabServices(selectedLab.id);
      }
      loadData();
    } catch (error) {
      console.error('Error deleting service:', error);
      alert('Ошибка при удалении услуги');
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price) + ' ₸';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Управление лабораториями</h2>
        <p className="text-blue-100">Добавляйте лаборатории и управляйте их прайслистами</p>
      </div>

      {/* Табы */}
      <div className="flex space-x-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('labs')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'labs'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Лаборатории и прайслисты
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'report'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Отчет по лабораториям
        </button>
      </div>

      {/* Таб: Лаборатории */}
      {activeTab === 'labs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Левая колонка - список лабораторий */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Лаборатории</h3>
              <button
                onClick={() => {
                  setEditingLab(null);
                  setLabForm({ name: '', description: '', address: '', phone: '', email: '', contact_person: '' });
                  setShowLabModal(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + Добавить лабораторию
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              {laboratories.map((lab) => (
                <div
                  key={lab.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedLab?.id === lab.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => {
                    setSelectedLab(lab);
                    loadLabServices(lab.id);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{lab.name}</h4>
                      {lab.address && (
                        <p className="text-sm text-gray-600 mt-1">{lab.address}</p>
                      )}
                      {lab.phone && (
                        <p className="text-sm text-gray-600">{lab.phone}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditLab(lab);
                        }}
                        className="text-blue-600 hover:text-blue-800 p-1"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLab(lab.id);
                        }}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {laboratories.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Нет добавленных лабораторий
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка - прайслист выбранной лаборатории */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {selectedLab ? `Прайслист: ${selectedLab.name}` : 'Выберите лабораторию'}
              </h3>
              {selectedLab && (
                <button
                  onClick={() => handleAddServiceToLab(selectedLab)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  + Добавить услугу
                </button>
              )}
            </div>
            
            <div className="p-4">
              {selectedLab ? (
                <div className="space-y-2">
                  {servicePrices.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Услуга</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Категория</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Цена</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {servicePrices.map((service) => (
                          <tr key={service.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{service.service_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{service.category}</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {formatPrice(service.price)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center space-x-2">
                                <button
                                  onClick={() => handleEditService(service)}
                                  className="text-blue-600 hover:text-blue-800 p-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteService(service.id)}
                                  className="text-red-600 hover:text-red-800 p-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Нет добавленных услуг для этой лаборатории
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Выберите лабораторию слева для просмотра прайслиста
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Таб: Отчет */}
      {activeTab === 'report' && statistics && (
        <div className="space-y-6">
          {/* Общая статистика */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Всего услуг</p>
                  <p className="text-3xl font-bold text-gray-900">{statistics.total_services}</p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Общая стоимость</p>
                  <p className="text-3xl font-bold text-gray-900">{formatPrice(statistics.total_cost)}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Детальная статистика по лабораториям */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Статистика по лабораториям</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Лаборатория</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Количество услуг</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Общая стоимость</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(statistics.laboratories).map(([labId, labData]) => {
                    const labInfo = statistics.laboratories_info[labId];
                    return (
                      <tr key={labId} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {labInfo ? labInfo.name : 'Не указано'}
                            </p>
                            {labInfo?.address && (
                              <p className="text-xs text-gray-500">{labInfo.address}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {labData.service_count}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-green-600">
                          {formatPrice(labData.total_cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: Лаборатория */}
      {showLabModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingLab ? 'Редактировать лабораторию' : 'Новая лаборатория'}
              </h3>
              <button
                onClick={() => {
                  setShowLabModal(false);
                  setEditingLab(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleLabSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название лаборатории *
                </label>
                <input
                  type="text"
                  value={labForm.name}
                  onChange={(e) => setLabForm({ ...labForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={labForm.description}
                  onChange={(e) => setLabForm({ ...labForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                  <input
                    type="text"
                    value={labForm.address}
                    onChange={(e) => setLabForm({ ...labForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                  <input
                    type="text"
                    value={labForm.phone}
                    onChange={(e) => setLabForm({ ...labForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={labForm.email}
                    onChange={(e) => setLabForm({ ...labForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Контактное лицо</label>
                  <input
                    type="text"
                    value={labForm.contact_person}
                    onChange={(e) => setLabForm({ ...labForm, contact_person: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowLabModal(false);
                    setEditingLab(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingLab ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно: Услуга */}
      {showServiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingService ? 'Редактировать услугу' : 'Новая услуга'}
              </h3>
              <button
                onClick={() => {
                  setShowServiceModal(false);
                  setEditingService(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleServiceSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название услуги *
                </label>
                <input
                  type="text"
                  value={serviceForm.service_name}
                  onChange={(e) => setServiceForm({ ...serviceForm, service_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                  <input
                    type="text"
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Единица измерения</label>
                  <input
                    type="text"
                    value={serviceForm.unit}
                    onChange={(e) => setServiceForm({ ...serviceForm, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Цена (₸) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowServiceModal(false);
                    setEditingService(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {editingService ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Laboratories;
