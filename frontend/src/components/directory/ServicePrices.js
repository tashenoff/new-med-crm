import React, { useState, useEffect } from 'react';

const ServicePrices = ({ user }) => {
  const [activeTab, setActiveTab] = useState('services');
  const [servicePrices, setServicePrices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [serviceCategories, setServiceCategories] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSpecialtyModal, setShowSpecialtyModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingSpecialty, setEditingSpecialty] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [priceForm, setPriceForm] = useState({
    service_name: '',
    service_code: '',
    category: '',
    price: '',
    unit: 'процедура',
    description: ''
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: ''
  });

  const [specialtyForm, setSpecialtyForm] = useState({
    name: '',
    description: ''
  });

  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    fetchServicePrices();
    fetchCategories();
    fetchServiceCategories();
    fetchSpecialties();
  }, []);

  const fetchServicePrices = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const prices = await response.json();
        setServicePrices(prices);
      } else {
        setError('Ошибка загрузки цен на услуги');
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error fetching service prices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchServiceCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setServiceCategories(data || []);
      }
    } catch (error) {
      console.error('Error fetching service categories:', error);
    }
  };

  const fetchSpecialties = async () => {
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
      }
    } catch (error) {
      console.error('Error fetching specialties:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const url = editingPrice 
        ? `${API}/api/service-prices/${editingPrice.id}`
        : `${API}/api/service-prices`;
      
      const method = editingPrice ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...priceForm,
          price: parseFloat(priceForm.price)
        })
      });

      if (response.ok) {
        setSuccess(editingPrice ? 'Цена обновлена успешно' : 'Цена создана успешно');
        fetchServicePrices();
        fetchCategories();
        handleCloseModal();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении цены');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error saving service price:', error);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (price) => {
    setEditingPrice(price);
    setPriceForm({
      service_name: price.service_name,
      service_code: price.service_code || '',
      category: price.category || '',
      price: price.price.toString(),
      unit: price.unit || 'процедура',
      description: price.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (priceId) => {
    if (!window.confirm('Удалить эту услугу из справочника?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices/${priceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('Услуга удалена успешно');
        fetchServicePrices();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Ошибка при удалении услуги');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error deleting service price:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPrice(null);
    setPriceForm({
      service_name: '',
      service_code: '',
      category: '',
      price: '',
      unit: 'процедура',
      description: ''
    });
  };

  // Category management functions
  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const url = editingCategory 
        ? `${API}/api/service-categories/${editingCategory.id}`
        : `${API}/api/service-categories`;
      
      const method = editingCategory ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(categoryForm)
      });

      if (response.ok) {
        setSuccess(editingCategory ? 'Категория обновлена успешно' : 'Категория создана успешно');
        fetchServiceCategories();
        fetchCategories(); // Обновляем список категорий для услуг
        handleCloseCategoryModal();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении категории');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error saving category:', error);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || ''
    });
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Удалить эту категорию?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-categories/${categoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('Категория удалена успешно');
        fetchServiceCategories();
        fetchCategories();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении категории');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error deleting category:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCloseCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      description: ''
    });
  };

  // Specialty management functions
  const handleSpecialtySubmit = async (e) => {
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
        handleCloseSpecialtyModal();
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

  const handleEditSpecialty = (specialty) => {
    setEditingSpecialty(specialty);
    setSpecialtyForm({
      name: specialty.name,
      description: specialty.description || ''
    });
    setShowSpecialtyModal(true);
  };

  const handleDeleteSpecialty = async (specialtyId) => {
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

  const handleCloseSpecialtyModal = () => {
    setShowSpecialtyModal(false);
    setEditingSpecialty(null);
    setSpecialtyForm({
      name: '',
      description: ''
    });
  };

  const filteredPrices = servicePrices.filter(price => {
    const matchesSearch = price.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (price.service_code && price.service_code.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === '' || price.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Ценовая политика</h2>
          <p className="text-gray-600">Управление ценами на услуги и процедуры</p>
        </div>
        {user?.role === 'admin' && (
          <div className="flex gap-3">
            {activeTab === 'services' && (
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Добавить услугу
              </button>
            )}
            {activeTab === 'categories' && (
              <button
                onClick={() => setShowCategoryModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                + Добавить категорию
              </button>
            )}
            {activeTab === 'specialties' && (
              <button
                onClick={() => setShowSpecialtyModal(true)}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                + Добавить специальность
              </button>
            )}
          </div>
        )}
      </div>

      {/* Вкладки */}
      <div className="bg-white rounded-lg shadow border">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('services')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'services'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 Услуги
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'categories'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📂 Категории
          </button>
          <button
            onClick={() => setActiveTab('specialties')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'specialties'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            👨‍⚕️ Специальности
          </button>
        </div>
      </div>

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

      {/* Содержимое вкладки Услуги */}
      {activeTab === 'services' && (
        <>
          {/* Фильтры */}
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Поиск по названию или коду</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Введите название услуги или код..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="w-64">
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Все категории</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Статистика услуг */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Всего услуг</p>
                  <p className="text-2xl font-bold text-blue-600">{servicePrices.length}</p>
                </div>
                <div className="text-blue-500 text-2xl">🏥</div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Категорий</p>
                  <p className="text-2xl font-bold text-green-600">{categories.length}</p>
                </div>
                <div className="text-green-500 text-2xl">📂</div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Средняя цена</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {servicePrices.length > 0 
                      ? (servicePrices.reduce((sum, p) => sum + p.price, 0) / servicePrices.length).toFixed(0)
                      : 0
                    } ₸
                  </p>
                </div>
                <div className="text-purple-500 text-2xl">💰</div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Найдено</p>
                  <p className="text-2xl font-bold text-orange-600">{filteredPrices.length}</p>
                </div>
                <div className="text-orange-500 text-2xl">🔍</div>
              </div>
            </div>
          </div>

          {/* Таблица услуг */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Загружаем цены на услуги...</div>
              </div>
            ) : filteredPrices.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">💼</div>
                  <p>Услуги не найдены</p>
                  <p className="text-sm mt-1">Попробуйте изменить фильтры или добавьте новую услугу</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Услуга
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Код
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Категория
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Цена
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Единица
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Описание
                      </th>
                      {user?.role === 'admin' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Действия
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPrices.map(price => (
                      <tr key={price.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{price.service_name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {price.service_code || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {price.category ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              {price.category}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-lg font-medium text-green-600">
                            {price.price.toLocaleString()} ₸
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {price.unit}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                          <div className="truncate" title={price.description}>
                            {price.description || '—'}
                          </div>
                        </td>
                        {user?.role === 'admin' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(price)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Изменить
                              </button>
                              <button
                                onClick={() => handleDelete(price.id)}
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
        </>
      )}

      {/* Содержимое вкладки Категории */}
      {activeTab === 'categories' && (
        <>
          {/* Статистика категорий */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Всего категорий</p>
                  <p className="text-2xl font-bold text-green-600">{serviceCategories.length}</p>
                </div>
                <div className="text-green-500 text-2xl">📂</div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Услуг в категориях</p>
                  <p className="text-2xl font-bold text-blue-600">{servicePrices.filter(p => p.category).length}</p>
                </div>
                <div className="text-blue-500 text-2xl">🏥</div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Без категории</p>
                  <p className="text-2xl font-bold text-purple-600">{servicePrices.filter(p => !p.category).length}</p>
                </div>
                <div className="text-purple-500 text-2xl">❓</div>
              </div>
            </div>
          </div>

          {/* Таблица категорий */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Загружаем категории...</div>
              </div>
            ) : serviceCategories.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">📂</div>
                  <p>Категории не найдены</p>
                  <p className="text-sm mt-1">Добавьте первую категорию для организации услуг</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Название категории
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Описание
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Услуг в категории
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Дата создания
                      </th>
                      {user?.role === 'admin' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Действия
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {serviceCategories.map(category => (
                      <tr key={category.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="text-2xl mr-3">📂</div>
                            <div className="font-medium text-gray-900">{category.name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                          <div className="truncate" title={category.description}>
                            {category.description || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                            {servicePrices.filter(p => p.category === category.name).length} услуг
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(category.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        {user?.role === 'admin' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditCategory(category)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Изменить
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(category.id)}
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
        </>
      )}

      {/* Модальное окно для создания/редактирования услуги */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingPrice ? 'Редактировать услугу' : 'Добавить новую услугу'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название услуги *</label>
                <input
                  type="text"
                  value={priceForm.service_name}
                  onChange={(e) => setPriceForm({...priceForm, service_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Код услуги</label>
                <input
                  type="text"
                  value={priceForm.service_code}
                  onChange={(e) => setPriceForm({...priceForm, service_code: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: THER-001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
                <select
                  value={priceForm.category}
                  onChange={(e) => setPriceForm({...priceForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Выберите категорию</option>
                  {serviceCategories.map(category => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
                {serviceCategories.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    Сначала создайте категории во вкладке "Категории"
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₸) *</label>
                  <input
                    type="number"
                    value={priceForm.price}
                    onChange={(e) => setPriceForm({...priceForm, price: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Единица</label>
                  <select
                    value={priceForm.unit}
                    onChange={(e) => setPriceForm({...priceForm, unit: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="процедура">процедура</option>
                    <option value="зуб">зуб</option>
                    <option value="час">час</option>
                    <option value="сеанс">сеанс</option>
                    <option value="единица">единица</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={priceForm.description}
                  onChange={(e) => setPriceForm({...priceForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Дополнительная информация об услуге..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : (editingPrice ? 'Обновить' : 'Создать')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно для создания/редактирования категории */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingCategory ? 'Редактировать категорию' : 'Добавить новую категорию'}
            </h3>
            
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название категории *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({...categoryForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                  placeholder="Например: Терапия, Хирургия, Ортопедия"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({...categoryForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows="3"
                  placeholder="Описание категории услуг..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : (editingCategory ? 'Обновить' : 'Создать')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseCategoryModal}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePrices;