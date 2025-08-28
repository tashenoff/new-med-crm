import React, { useState, useEffect } from 'react';

const DoctorModal = ({ 
  show, 
  onClose, 
  onSave, 
  doctorForm, 
  setDoctorForm, 
  editingItem, 
  loading, 
  errorMessage 
}) => {
  const [specialties, setSpecialties] = useState([]);
  
  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    if (show) {
      fetchSpecialties();
    }
  }, [show]);

  const fetchSpecialties = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('DoctorModal: Fetching specialties...');
      
      const response = await fetch(`${API}/api/specialties`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('DoctorModal: API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('DoctorModal: Fetched specialties:', data);
        setSpecialties(data || []);
      } else {
        console.error('DoctorModal: Failed to fetch specialties:', response.status);
      }
    } catch (error) {
      console.error('DoctorModal: Error fetching specialties:', error);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {editingItem ? 'Редактировать врача' : 'Новый врач'}
        </h3>
        
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block">{errorMessage}</span>
          </div>
        )}
        
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            placeholder="Полное имя *"
            value={doctorForm.full_name}
            onChange={(e) => setDoctorForm({...doctorForm, full_name: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            required
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Специальность *</label>
            <select
              value={doctorForm.specialty}
              onChange={(e) => setDoctorForm({...doctorForm, specialty: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              required
            >
              <option value="">Выберите специальность</option>
              {specialties.map(specialty => (
                <option key={specialty.id} value={specialty.name}>{specialty.name}</option>
              ))}
            </select>
            {specialties.length === 0 && (
              <p className="text-sm text-red-500 mt-1">
                ⚠️ Специальности не найдены. Создайте специальности в разделе "Специальности"
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Загружено специальностей: {specialties.length}
            </p>
          </div>
          
          <input
            type="tel"
            placeholder="Телефон *"
            value={doctorForm.phone}
            onChange={(e) => setDoctorForm({...doctorForm, phone: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            required
          />
          
          <input
            type="email"
            placeholder="Email"
            value={doctorForm.email}
            onChange={(e) => setDoctorForm({...doctorForm, email: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Цвет календаря</label>
            <input
              type="color"
              value={doctorForm.calendar_color || '#3B82F6'}
              onChange={(e) => setDoctorForm({...doctorForm, calendar_color: e.target.value})}
              className="w-full h-10 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
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
      </div>
    </div>
  );
};

export default DoctorModal;