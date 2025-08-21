import React, { useState, useEffect } from 'react';

const AppointmentModal = ({ 
  show, 
  onClose, 
  onSave, 
  appointmentForm, 
  setAppointmentForm, 
  patients, 
  doctors, 
  editingItem, 
  loading, 
  errorMessage,
  onCreatePatient
}) => {
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [activeTab, setActiveTab] = useState('appointment');
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentDescription, setDocumentDescription] = useState('');
  const [newPatientForm, setNewPatientForm] = useState({
    full_name: '',
    phone: '',
    iin: '',
    birth_date: '',
    gender: '',
    source: 'walk_in',
    referrer: '',
    notes: ''
  });

  const API = process.env.REACT_APP_BACKEND_URL;
  const selectedPatient = patients.find(p => p.id === appointmentForm.patient_id);

  useEffect(() => {
    if (selectedPatient && activeTab === 'documents') {
      fetchDocuments();
    }
  }, [selectedPatient, activeTab]);

  const fetchDocuments = async () => {
    if (!selectedPatient) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${selectedPatient.id}/documents`, {
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

  const handleFileUpload = async () => {
    if (!selectedFile || !selectedPatient) return;

    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (documentDescription) {
        formData.append('description', documentDescription);
      }

      console.log('Uploading file for patient:', selectedPatient.id);
      console.log('API endpoint:', `${API}/patients/${selectedPatient.id}/documents`);
      console.log('File:', selectedFile);

      const response = await fetch(`${API}/patients/${selectedPatient.id}/documents`, {
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
        document.getElementById('appointment-file-input').value = ''; // Clear file input
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
      const response = await fetch(`${API}/documents/${documentId}`, {
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

  const handleCreateNewPatient = async (e) => {
    e.preventDefault();
    try {
      const newPatient = await onCreatePatient(newPatientForm);
      // Reset form and hide the new patient section
      setShowNewPatientForm(false);
      setNewPatientForm({
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: 'walk_in',
        referrer: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error creating patient:', error);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать запись' : 'Новая запись на прием'}
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
              onClick={() => setActiveTab('appointment')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'appointment'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Запись на прием
            </button>
            {selectedPatient && (
              <button
                onClick={() => setActiveTab('documents')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'documents'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Документы пациента
              </button>
            )}
          </nav>
        </div>

        {/* Appointment Tab Content */}
        {activeTab === 'appointment' && (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пациент *</label>
              <div className="flex gap-2">
                <select
                  value={appointmentForm.patient_id}
                  onChange={(e) => setAppointmentForm({...appointmentForm, patient_id: e.target.value})}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={showNewPatientForm}
                >
                  <option value="">Выберите пациента</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>{patient.full_name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewPatientForm(!showNewPatientForm)}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  {showNewPatientForm ? 'Отмена' : '+ Новый'}
                </button>
              </div>
            </div>

            {showNewPatientForm && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h4 className="font-medium mb-3">Создать нового пациента</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="ФИО *"
                    value={newPatientForm.full_name}
                    onChange={(e) => setNewPatientForm({...newPatientForm, full_name: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="tel"
                    placeholder="Телефон *"
                    value={newPatientForm.phone}
                    onChange={(e) => setNewPatientForm({...newPatientForm, phone: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="ИИН"
                    value={newPatientForm.iin}
                    onChange={(e) => setNewPatientForm({...newPatientForm, iin: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="date"
                    placeholder="Дата рождения"
                    value={newPatientForm.birth_date}
                    onChange={(e) => setNewPatientForm({...newPatientForm, birth_date: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <select
                    value={newPatientForm.gender}
                    onChange={(e) => setNewPatientForm({...newPatientForm, gender: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Пол</option>
                    <option value="male">Мужской</option>
                    <option value="female">Женский</option>
                  </select>
                  <select
                    value={newPatientForm.source}
                    onChange={(e) => setNewPatientForm({...newPatientForm, source: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="walk_in">Обращение в клинику</option>
                    <option value="phone">Телефонный звонок</option>
                    <option value="referral">Направление врача</option>
                    <option value="website">Веб-сайт</option>
                    <option value="social_media">Социальные сети</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Кто направил"
                    value={newPatientForm.referrer}
                    onChange={(e) => setNewPatientForm({...newPatientForm, referrer: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateNewPatient}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Создать пациента
                </button>
              </div>
            )}
            
            <select
              value={appointmentForm.doctor_id}
              onChange={(e) => setAppointmentForm({...appointmentForm, doctor_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Выберите врача</option>
              {doctors.map(doctor => (
                <option key={doctor.id} value={doctor.id}>{doctor.full_name} - {doctor.specialty}</option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата приема *</label>
                <input
                  type="date"
                  value={appointmentForm.appointment_date}
                  onChange={(e) => setAppointmentForm({...appointmentForm, appointment_date: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Время начала *</label>
                <input
                  type="time"
                  value={appointmentForm.appointment_time}
                  onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Время окончания</label>
                <input
                  type="time"
                  value={appointmentForm.end_time || ''}
                  onChange={(e) => setAppointmentForm({...appointmentForm, end_time: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Кресло</label>
                <input
                  type="text"
                  placeholder="Номер кресла"
                  value={appointmentForm.chair_number || ''}
                  onChange={(e) => setAppointmentForm({...appointmentForm, chair_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₸)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={appointmentForm.price || ''}
                  onChange={(e) => setAppointmentForm({...appointmentForm, price: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Причина обращения</label>
              <input
                type="text"
                placeholder="Причина визита"
                value={appointmentForm.reason}
                onChange={(e) => setAppointmentForm({...appointmentForm, reason: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Заметки о записи</label>
                <textarea
                  placeholder="Заметки о записи"
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Заметки о пациенте</label>
                <textarea
                  placeholder="Заметки о пациенте"
                  value={appointmentForm.patient_notes || ''}
                  onChange={(e) => setAppointmentForm({...appointmentForm, patient_notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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

        {/* Documents Tab Content */}
        {activeTab === 'documents' && selectedPatient && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-medium text-blue-800">
                Документы для пациента: {selectedPatient.full_name}
              </h4>
            </div>

            {/* Upload Section */}
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="font-medium mb-3">Загрузить новый документ</h4>
              <div className="space-y-3">
                <div>
                  <input
                    id="appointment-file-input"
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
                  type="button"
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
                          href={`${API.replace('/api', '')}/uploads/${doc.filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
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
      </div>
    </div>
  );
};

export default AppointmentModal;