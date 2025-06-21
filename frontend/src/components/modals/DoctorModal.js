import React from 'react';

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
          
          <input
            type="text"
            placeholder="Специальность *"
            value={doctorForm.specialty}
            onChange={(e) => setDoctorForm({...doctorForm, specialty: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            required
          />
          
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