import React, { useState, useEffect } from 'react';
import Modal from '../modals/Modal';
import PanelHeader from '../common/PanelHeader';
import { inputClasses, textareaClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../modals/modalUtils';

const Specialties = ({ user }) => {
  const [specialties, setSpecialties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSpecialty, setEditingSpecialty] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [specialtyForm, setSpecialtyForm] = useState({
    name: '',
    description: ''
  });

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    fetchSpecialties();
  }, []);

  const fetchSpecialties = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/specialties`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSpecialties(data || []);
      } else {
        setError('Ошибка загрузки специальностей');
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error fetching specialties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const url = editingSpecialty 
        ? `${API}/api/specialties/${editingSpecialty.id}`
        : `${API}/api/specialties`;
      
      const method = editingSpecialty ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(specialtyForm)
      });

      if (response.ok) {
        setSuccess(editingSpecialty ? 'Специальность обновлена успешно' : 'Специальность создана успешно');
        fetchSpecialties();
        handleCloseModal();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении специальности');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error saving specialty:', error);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (specialty) => {
    setEditingSpecialty(specialty);
    setSpecialtyForm({
      name: specialty.name,
      description: specialty.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (specialtyId) => {
    if (!window.confirm('Удалить эту специальность?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/specialties/${specialtyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('Специальность удалена успешно');
        fetchSpecialties();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении специальности');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error deleting specialty:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSpecialty(null);
    setSpecialtyForm({
      name: '',
      description: ''
    });
  };

  const filteredSpecialties = specialties.filter(specialty => 
    specialty.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (specialty.description && specialty.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Специальности врачей"
          subtitle="Управление медицинскими специальностями"
          onAction={user?.role === 'admin' || user?.role === 'super_admin' ? () => setShowModal(true) : undefined}
          actionLabel="+ Добавить специальность"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">

      {/* Сообщения */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className={labelClasses}>Поиск специальностей</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Введите название специальности..."
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      {/* Статистика специальностей */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Всего специальностей</p>
              <p className="text-2xl font-bold text-purple-600">{specialties.length}</p>
            </div>
            <div className="text-purple-500 text-2xl">👨‍⚕️</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Активных специальностей</p>
              <p className="text-2xl font-bold text-blue-600">{specialties.filter(s => s.is_active).length}</p>
            </div>
            <div className="text-blue-500 text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Найдено</p>
              <p className="text-2xl font-bold text-green-600">{filteredSpecialties.length}</p>
            </div>
            <div className="text-green-500 text-2xl">🔍</div>
          </div>
        </div>
      </div>

      {/* Таблица специальностей */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Загружаем специальности...</div>
          </div>
        ) : filteredSpecialties.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">👨‍⚕️</div>
              <p>Специальности не найдены</p>
              <p className="text-sm mt-1">Добавьте первую специальность для врачей</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название специальности
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Описание
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата создания
                  </th>
                  {user?.role === 'admin' || user?.role === 'super_admin' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSpecialties.map(specialty => (
                  <tr key={specialty.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-2xl mr-3">👨‍⚕️</div>
                        <div className="font-medium text-gray-900">{specialty.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      <div className="truncate" title={specialty.description}>
                        {specialty.description || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(specialty.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    {user?.role === 'admin' || user?.role === 'super_admin' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(specialty)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => handleDelete(specialty.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно для создания/редактирования специальности */}
      <Modal 
        show={showModal} 
        onClose={() => {
          setShowModal(false);
          setEditingSpecialty(null);
          setSpecialtyForm({
            name: '',
            description: ''
          });
        }}
        title={editingSpecialty ? 'Редактировать специальность' : 'Добавить новую специальность'}
        errorMessage={error}
        size="max-w-md"
      >
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClasses}>Название специальности *</label>
                <input
                  type="text"
                  value={specialtyForm.name}
                  onChange={(e) => setSpecialtyForm({...specialtyForm, name: e.target.value})}
                  className={inputClasses}
                  required
                  placeholder="Например: Терапевт, Хирург, Ортопед"
                />
              </div>
              
              <div>
                <label className={labelClasses}>Описание</label>
                <textarea
                  value={specialtyForm.description}
                  onChange={(e) => setSpecialtyForm({...specialtyForm, description: e.target.value})}
                  className={inputClasses}
                  rows="3"
                  placeholder="Описание медицинской специальности..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 ${buttonPrimaryClasses}`}
                >
                  {loading ? 'Сохранение...' : (editingSpecialty ? 'Обновить' : 'Создать')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className={`flex-1 ${buttonSecondaryClasses}`}
                >
                  Отмена
                </button>
              </div>
            </form>
      </Modal>
        </div>
      </div>
    </div>
  );
};

export default Specialties;
