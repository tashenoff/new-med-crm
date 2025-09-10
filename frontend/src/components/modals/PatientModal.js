import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonSuccessClasses, buttonDangerClasses, cardHeaderClasses, tabClasses, tableClasses, tableHeaderClasses, tableRowClasses } from './modalUtils';
import ServiceSelector from '../treatment/ServiceSelector';

const PatientModal = ({ 
  show, 
  onClose, 
  onSave, 
  patientForm, 
  setPatientForm, 
  editingItem, 
  loading, 
  errorMessage 
}) => {
  const [activeTab, setActiveTab] = useState('info');
  const [documents, setDocuments] = useState([]);
  const [treatmentPlans, setTreatmentPlans] = useState([]);
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

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (editingItem && activeTab === 'documents') {
      fetchDocuments();
    }
    if (editingItem && activeTab === 'plans') {
      fetchTreatmentPlans();
    }
  }, [editingItem, activeTab]);

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
      }
    } catch (error) {
      console.error('Error fetching treatment plans:', error);
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
    if (!window.confirm('Удалить этот план лечения?')) return;

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

  if (!show) return null;

  return (
    <Modal 
      show={show} 
      onClose={onClose}
      title={editingItem ? 'Редактировать пациента' : 'Новый пациент'}
      errorMessage={errorMessage}
    >

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('info')}
              className={tabClasses(activeTab === 'info')}
            >
              Информация о пациенте
            </button>
            {editingItem && (
              <>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={tabClasses(activeTab === 'documents')}
                >
                  Документы
                </button>
                <button
                  onClick={() => setActiveTab('plans')}
                  className={tabClasses(activeTab === 'plans')}
                >
                  План лечения
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'info' && (
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Полное имя *"
                value={patientForm.full_name}
                onChange={(e) => setPatientForm({...patientForm, full_name: e.target.value})}
                className={inputClasses}
                required
              />
              
              <input
                type="tel"
                placeholder="Телефон *"
                value={patientForm.phone}
                onChange={(e) => setPatientForm({...patientForm, phone: e.target.value})}
                className={inputClasses}
                required
              />
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

        {/* Documents Tab */}
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

        {/* Treatment Plans Tab */}
        {activeTab === 'plans' && editingItem && (
          <div className="space-y-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <h4 className="font-medium text-green-800">
                План лечения для пациента: {editingItem.full_name}
              </h4>
            </div>

            {/* Add/Edit Plan Form */}
            <div className={cardHeaderClasses}>
              <h4 className="font-medium mb-3">
                {editingPlan ? 'Редактировать план лечения' : 'Добавить план лечения'}
              </h4>
              
              {/* Basic Plan Information */}
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  placeholder="Название плана лечения *"
                  value={planForm.title}
                  onChange={(e) => setPlanForm({...planForm, title: e.target.value})}
                  className={inputClasses}
                  required
                />
                <textarea
                  placeholder="Описание плана"
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
                <h5 className="font-medium mb-2">Услуги в плане лечения:</h5>
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
                  {editingPlan ? 'Обновить план' : 'Создать план'}
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

            {/* Treatment Plans List */}
            <div>
              <h4 className="font-medium mb-3">Планы лечения</h4>
              {treatmentPlans.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Планы лечения не найдены
                </p>
              ) : (
                <div className="space-y-2">
                  {treatmentPlans.map((plan) => (
                    <div key={plan.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-lg">{plan.title}</div>
                          {plan.description && (
                            <div className="text-gray-600 mt-1">{plan.description}</div>
                          )}
                          <div className="text-sm text-gray-500 mt-2">
                            Создан {new Date(plan.created_at).toLocaleDateString('ru-RU')} 
                            {' '}пользователем {plan.created_by_name}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <span className={`px-2 py-1 text-xs rounded font-medium ${
                              plan.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                              plan.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                              plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {plan.status === 'draft' ? 'Черновик' :
                               plan.status === 'approved' ? 'Утвержден' :
                               plan.status === 'completed' ? 'Завершен' :
                               'Отменен'}
                            </span>
                            
                            {/* Payment Status */}
                            <span className={`px-2 py-1 text-xs rounded font-medium ${
                              plan.payment_status === 'unpaid' ? 'bg-red-100 text-red-800' :
                              plan.payment_status === 'partially_paid' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {plan.payment_status === 'unpaid' ? 'Не оплачено' :
                               plan.payment_status === 'partially_paid' ? 'Частично оплачено' :
                               'Оплачено'}
                            </span>
                            
                            {/* Execution Status */}
                            <span className={`px-2 py-1 text-xs rounded font-medium ${
                              plan.execution_status === 'pending' ? 'bg-gray-100 text-gray-800' :
                              plan.execution_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                              plan.execution_status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {plan.execution_status === 'pending' ? 'Ожидает' :
                               plan.execution_status === 'in_progress' ? 'В процессе' :
                               plan.execution_status === 'completed' ? 'Завершено' :
                               'Не пришел'}
                            </span>

                            {plan.total_cost > 0 && (
                              <span className="text-green-600 font-medium">
                                💰 {plan.total_cost.toLocaleString()} ₸
                              </span>
                            )}
                            
                            {plan.paid_amount > 0 && (
                              <span className="text-blue-600 font-medium">
                                💳 Оплачено: {plan.paid_amount.toLocaleString()} ₸
                              </span>
                            )}
                          </div>
                          
                          {/* Services List */}
                          {plan.services && plan.services.length > 0 && (
                            <div className="mt-3 p-2 bg-gray-100 rounded">
                              <div className="text-xs font-medium text-gray-700 mb-1">Услуги в плане:</div>
                              <div className="space-y-1">
                                {plan.services.map((service, index) => (
                                  <div key={index} className="text-xs text-gray-600 flex justify-between">
                                    <span>
                                      {service.service_name}
                                      {service.teeth_numbers && service.teeth_numbers.length > 0 && (
                                        <span className="text-blue-600 ml-1">
                                          🦷 ({service.teeth_numbers.join(', ')})
                                        </span>
                                      )}
                                      <span className="text-gray-500 ml-1">
                                        - {service.quantity} {service.unit}
                                      </span>
                                    </span>
                                    <span className="font-medium">
                                      {(service.total_price || 0).toLocaleString()} ₸
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {plan.notes && (
                            <div className="text-sm text-gray-600 mt-2">
                              Заметки: {plan.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col space-y-2">
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
    </Modal>
  );
};

export default PatientModal;