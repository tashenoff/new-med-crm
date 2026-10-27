import RowActions from '../common/RowActions';
import { LoadingSpinner } from '../common/LoadingIndicator';
import { permissionProps, canAction } from '../../utils/permissions.js';
import React, { useState, useEffect, useRef } from 'react';
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
  const [servicePage, setServicePage] = useState(0); // пагинация прайслиста лабы
  const PAGE_SIZE = 10;
  const [labServiceSearch, setLabServiceSearch] = useState('');

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

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // Загрузка прайса лаборатории из файла (xls/xlsx), как в прайсе услуг
  const handleImportPrice = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedLab) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setImporting(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/laboratories/${selectedLab.id}/import-price`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = res.data;
      const msg = `Импорт завершен: создано ${d.parsed.created}, обновлено ${d.parsed.updated}, пропущено ${d.parsed.skipped}`;
      if (d.errors?.parse?.length) {
        alert(msg + `\nОшибки парсинга (${d.errors.parse.length}):\n` + d.errors.parse.slice(0, 5).join('\n'));
      } else {
        alert(msg);
      }
      if (selectedLab) loadLabServices(selectedLab.id);
      loadData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      alert('Ошибка загрузки прайса: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail) || err.message));
    } finally {
      setImporting(false);
    }
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
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-curai-blue rounded-md shadow-none p-6 text-white">
        <h2 className="text-2xl font-semibold mb-2">Управление лабораториями</h2>
        <p className="text-curai-blue">Добавляйте лаборатории и управляйте их прайслистами</p>
      </div>

      {/* Табы */}
      <div className="flex space-x-2 border-b border-curai-border">
        <button
          onClick={() => setActiveTab('labs')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'labs'
              ? "text-curai-blue border-b-2 border-curai-control"
              : "text-curai-muted hover:text-curai-ink"
          }`}
        >
          Лаборатории и прайслисты
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'report'
              ? "text-curai-blue border-b-2 border-curai-control"
              : "text-curai-muted hover:text-curai-ink"
          }`}
        >
          Отчет по лабораториям
        </button>
      </div>

      {/* Таб: Лаборатории */}
      {activeTab === 'labs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Левая колонка - список лабораторий */}
          <div className="bg-curai-surface rounded-md shadow-none">
            <div className="px-6 py-4 border-b border-curai-border flex justify-between items-center">
              <h3 className="text-lg font-semibold">Лаборатории</h3>
              <button
                onClick={() => {
                  setEditingLab(null);
                  setLabForm({ name: '', description: '', address: '', phone: '', email: '', contact_person: '' });
                  setShowLabModal(true);
                }}
                className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue"
              >
                + Добавить лабораторию
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              {laboratories.map((lab) => (
                <div
                  key={lab.id}
                  className={`p-4 border rounded-md cursor-pointer transition-all ${
                    selectedLab?.id === lab.id
                      ? "border-curai-control bg-curai-selected"
                      : "border-curai-border hover:border-curai-control"
                  }`}
                  onClick={() => {
                    setSelectedLab(lab);
                    loadLabServices(lab.id);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-curai-ink">{lab.name}</h4>
                      {lab.address && (
                        <p className="text-sm text-curai-muted mt-1">{lab.address}</p>
                      )}
                      {lab.phone && (
                        <p className="text-sm text-curai-muted">{lab.phone}</p>
                      )}
                    </div>
                    <RowActions>
                      <RowActions.Item action="edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditLab(lab);
                        }}
                        {...permissionProps(user, "directory_view", "directory_edit")}
                      />
                      <RowActions.Item action="delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLab(lab.id);
                        }}
                        {...permissionProps(user, "directory_view", "directory_delete")}
                      />
                    </RowActions>
                  </div>
                </div>
              ))}
              
              {laboratories.length === 0 && (
                <div className="text-center py-8 text-curai-muted">
                  Нет добавленных лабораторий
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка - прайслист выбранной лаборатории */}
          <div className="bg-curai-surface rounded-md shadow-none">
            <div className="px-6 py-4 border-b border-curai-border flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {selectedLab ? `Прайслист: ${selectedLab.name}` : 'Выберите лабораторию'}
              </h3>
              {selectedLab && (
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleImportPrice}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue disabled:opacity-50"
                  >
                    {importing ? 'Загрузка...' : '📥 Загрузить прайс'}
                  </button>
                  <button
                    onClick={() => handleAddServiceToLab(selectedLab)}
                    className="px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive"
                   {...permissionProps(user, "directory_view", "directory_edit")}>
                    + Добавить услугу
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-4">
              {selectedLab ? (
                <div className="space-y-3">
                  {/* Поиск по услуге */}
                  <input
                    type="text"
                    placeholder="🔍 Поиск услуги..."
                    value={labServiceSearch}
                    onChange={(e) => { setLabServiceSearch(e.target.value); setServicePage(0); }}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus text-sm"
                  />
                  {servicePrices.length > 0 ? (
                    (() => {
                      const q = labServiceSearch.trim().toLowerCase();
                      const filtered = q ? servicePrices.filter(s => (s.service_name || '').toLowerCase().includes(q)) : servicePrices;
                      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                      const safePage = Math.min(servicePage, totalPages - 1);
                      const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
                      return (
                        <>
                          <div className="text-xs text-curai-muted">
                            Показано {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
                            {Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} из {filtered.length} услуг
                          </div>
                          {pageItems.length > 0 ? (
                            <table className="min-w-full divide-y divide-curai-border">
                              <thead className="bg-curai-subtle">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-muted uppercase">Услуга</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-curai-muted uppercase">Категория</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-curai-muted uppercase">Цена</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-curai-muted uppercase">Действия</th>
                                </tr>
                              </thead>
                              <tbody className="bg-curai-surface divide-y divide-curai-border">
                                {pageItems.map((service) => (
                                  <tr key={service.id} className="hover:bg-curai-subtle">
                                    <td className="px-4 py-3 text-sm text-curai-ink">{service.service_name}</td>
                                    <td className="px-4 py-3 text-sm text-curai-muted">{service.category}</td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-curai-ink">
                                      {formatPrice(service.price)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <RowActions>
                                        <>
                                          <RowActions.Item action="edit"
                                            onClick={() => handleEditService(service)}
                                            {...permissionProps(user, "directory_view", "directory_edit")}
                                          />
                                          <RowActions.Item action="delete"
                                            onClick={() => handleDeleteService(service.id)}
                                            {...permissionProps(user, "directory_view", "directory_delete")}
                                          />
                                        </>
                                      </RowActions>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="text-center py-8 text-curai-muted">
                              Не найдено услуг по запросу
                            </div>
                          )}
                          {filtered.length > PAGE_SIZE && (
                            <div className="flex items-center justify-between pt-2">
                              <button
                                onClick={() => setServicePage(Math.max(0, safePage - 1))}
                                disabled={safePage === 0}
                                className="px-3 py-1.5 text-sm border border-curai-control rounded-md hover:bg-curai-subtle disabled:opacity-40"
                              >
                                ← Назад
                              </button>
                              <span className="text-xs text-curai-muted">Стр. {safePage + 1} / {totalPages}</span>
                              <button
                                onClick={() => setServicePage(Math.min(totalPages - 1, safePage + 1))}
                                disabled={safePage >= totalPages - 1}
                                className="px-3 py-1.5 text-sm border border-curai-control rounded-md hover:bg-curai-subtle disabled:opacity-40"
                              >
                                Вперед →
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <div className="text-center py-8 text-curai-muted">
                      Нет добавленных услуг для этой лаборатории
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-curai-muted">
                  <svg className="w-16 h-16 mx-auto mb-4 text-curai-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="bg-curai-surface rounded-md shadow-none p-6 border-l-4 border-curai-control">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-curai-muted mb-1">Всего услуг</p>
                  <p className="text-2xl font-semibold text-curai-ink">{statistics.total_services}</p>
                </div>
                <div className="bg-curai-selected rounded-full p-3">
                  <svg className="w-8 h-8 text-curai-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-curai-surface rounded-md shadow-none p-6 border-l-4 border-curai-positive">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-curai-muted mb-1">Общая стоимость</p>
                  <p className="text-2xl font-semibold text-curai-ink">{formatPrice(statistics.total_cost)}</p>
                </div>
                <div className="bg-curai-positiveBg rounded-full p-3">
                  <svg className="w-8 h-8 text-curai-positive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Детальная статистика по лабораториям */}
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            <div className="px-6 py-4 bg-curai-subtle border-b border-curai-border">
              <h3 className="text-lg font-semibold">Статистика по лабораториям</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-curai-border">
                <thead className="bg-curai-subtle">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase">Лаборатория</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-curai-muted uppercase">Количество услуг</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-curai-muted uppercase">Общая стоимость</th>
                  </tr>
                </thead>
                <tbody className="bg-curai-surface divide-y divide-curai-border">
                  {Object.entries(statistics.laboratories).map(([labId, labData]) => {
                    const labInfo = statistics.laboratories_info[labId];
                    return (
                      <tr key={labId} className="hover:bg-curai-subtle">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-curai-ink">
                              {labInfo ? labInfo.name : 'Не указано'}
                            </p>
                            {labInfo?.address && (
                              <p className="text-xs text-curai-muted">{labInfo.address}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-curai-ink">
                          {labData.service_count}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-curai-positive">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 curai-glass-modal-layer">
          <div className="bg-curai-surface rounded-md shadow-none max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto curai-glass-shell curai-custom-dialog">
            <div className="px-6 py-4 border-b border-curai-border flex justify-between items-center curai-glass-header">
              <h3 className="text-lg font-semibold">
                {editingLab ? 'Редактировать лабораторию' : 'Новая лаборатория'}
              </h3>
              <button
                onClick={() => {
                  setShowLabModal(false);
                  setEditingLab(null);
                }}
                className="text-curai-muted hover:text-curai-muted"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={event => { if (!canAction(user, "directory_view", "directory_edit")) { event.preventDefault(); return; } return (handleLabSubmit)(event); }} className="p-6 space-y-4 curai-glass-body">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Название лаборатории *
                </label>
                <input
                  type="text"
                  value={labForm.name}
                  onChange={(e) => setLabForm({ ...labForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Описание</label>
                <textarea
                  value={labForm.description}
                  onChange={(e) => setLabForm({ ...labForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  rows="3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Адрес</label>
                  <input
                    type="text"
                    value={labForm.address}
                    onChange={(e) => setLabForm({ ...labForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Телефон</label>
                  <input
                    type="text"
                    value={labForm.phone}
                    onChange={(e) => setLabForm({ ...labForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Email</label>
                  <input
                    type="email"
                    value={labForm.email}
                    onChange={(e) => setLabForm({ ...labForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Контактное лицо</label>
                  <input
                    type="text"
                    value={labForm.contact_person}
                    onChange={(e) => setLabForm({ ...labForm, contact_person: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
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
                  className="px-4 py-2 border border-curai-control text-curai-ink rounded-md hover:bg-curai-subtle"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue"
                 {...permissionProps(user, "directory_view", "directory_edit")}>
                  {editingLab ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно: Услуга */}
      {showServiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-4 curai-glass-modal-layer">
          <div className="bg-curai-surface rounded-md shadow-none max-w-xl w-full my-auto max-h-[90vh] overflow-y-auto curai-glass-shell curai-custom-dialog">
            <div className="px-6 py-4 border-b border-curai-border flex justify-between items-center curai-glass-header">
              <h3 className="text-lg font-semibold">
                {editingService ? 'Редактировать услугу' : 'Новая услуга'}
              </h3>
              <button
                onClick={() => {
                  setShowServiceModal(false);
                  setEditingService(null);
                }}
                className="text-curai-muted hover:text-curai-muted"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={event => { if (!canAction(user, "directory_view", "directory_edit")) { event.preventDefault(); return; } return (handleServiceSubmit)(event); }} className="p-6 space-y-4 curai-glass-body">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Название услуги *
                </label>
                <input
                  type="text"
                  value={serviceForm.service_name}
                  onChange={(e) => setServiceForm({ ...serviceForm, service_name: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Категория</label>
                  <input
                    type="text"
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Единица измерения</label>
                  <input
                    type="text"
                    value={serviceForm.unit}
                    onChange={(e) => setServiceForm({ ...serviceForm, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Цена (₸) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
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
                  className="px-4 py-2 border border-curai-control text-curai-ink rounded-md hover:bg-curai-subtle"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive"
                 {...permissionProps(user, "directory_view", "directory_edit")}>
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
