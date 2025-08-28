import React, { useState, useEffect } from 'react';
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

  const API = process.env.REACT_APP_BACKEND_URL;

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
          notes: ''
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
      notes: plan.notes || ''
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать пациента' : 'Новый пациент'}
        </h3>
        
        {errorMessage && (
          <div className={`border px-4 py-3 rounded mb-4 ${
            typeof errorMessage === 'string' && errorMessage.startsWith('✅') 
              ? 'bg-green-100 border-green-400 text-green-700'
              : 'bg-red-100 border-red-400 text-red-700'
          }`}>
            <span className="block">{errorMessage}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('info')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Информация о пациенте
            </button>
            {editingItem && (
              <>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'documents'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Документы
                </button>
                <button
                  onClick={() => setActiveTab('plans')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'plans'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
              
              <input
                type="tel"
                placeholder="Телефон *"
                value={patientForm.phone}
                onChange={(e) => setPatientForm({...patientForm, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="ИИН"
                value={patientForm.iin || ''}
                onChange={(e) => setPatientForm({...patientForm, iin: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
              
              <input
                type="date"
                placeholder="Дата рождения"
                value={patientForm.birth_date || ''}
                onChange={(e) => setPatientForm({...patientForm, birth_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                value={patientForm.gender || ''}
                onChange={(e) => setPatientForm({...patientForm, gender: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
            
            <select
              value={patientForm.source}
              onChange={(e) => setPatientForm({...patientForm, source: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Количество записей</label>
                    <input
                      type="number"
                      min="0"
                      value={patientForm.records_count || 0}
                      onChange={(e) => setPatientForm({...patientForm, records_count: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <textarea
              placeholder="Заметки"
              value={patientForm.notes}
              onChange={(e) => setPatientForm({...patientForm, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              rows="3"
            />
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Сохранение...' : (editingItem ? 'Обновить' : 'Создать')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
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
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="font-medium mb-3">Загрузить новый документ</h4>
              <div className="space-y-3">
                <div>
                  <input
                    id="file-input"
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="font-medium mb-3">
                {editingPlan ? 'Редактировать план лечения' : 'Добавить план лечения'}
              </h4>
              <form onSubmit={handleSaveTreatmentPlan} className="space-y-3">
                <input
                  type="text"
                  placeholder="Название плана лечения *"
                  value={planForm.title}
                  onChange={(e) => setPlanForm({...planForm, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <textarea
                  placeholder="Описание плана"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({...planForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows="3"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Стоимость (₸)"
                    value={planForm.total_cost}
                    onChange={(e) => setPlanForm({...planForm, total_cost: parseFloat(e.target.value) || 0})}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <select
                    value={planForm.status}
                    onChange={(e) => setPlanForm({...planForm, status: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="draft">Черновик</option>
                    <option value="approved">Утвержден</option>
                    <option value="completed">Завершен</option>
                    <option value="cancelled">Отменен</option>
                  </select>
                </div>
                <textarea
                  placeholder="Дополнительные заметки"
                  value={planForm.notes}
                  onChange={(e) => setPlanForm({...planForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows="2"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
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
                          notes: ''
                        });
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </form>
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
                            {plan.total_cost > 0 && (
                              <span className="text-green-600 font-medium">
                                💰 {plan.total_cost} ₸
                              </span>
                            )}
                          </div>
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
      </div>
    </div>
  );
};

export default PatientModal;