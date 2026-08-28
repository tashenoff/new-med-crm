import React, { useState, useEffect } from 'react';
import Modal from '../modals/Modal';
import PanelHeader from '../common/PanelHeader';
import { inputClasses, selectClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonDangerClasses, tableClasses, tableHeaderClasses, tableRowClasses, labelClasses } from '../modals/modalUtils';
import { materialsApi } from '../../api/materials';

const API = import.meta.env.VITE_BACKEND_URL;

const ServicePrices = ({ user }) => {
  const [servicePrices, setServicePrices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [filteredMaterials, setFilteredMaterials] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Import Excel states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importOptions, setImportOptions] = useState({
    update_existing: false,
    skip_duplicates: true
  });

  // Clear price modal state
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [priceStats, setPriceStats] = useState(null);

  // Pagination and filtering states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    service_name: '',
    service_name_kz: '',
    service_code: '',
    category: '',
    price: '',
    description: '',
    disable_discount: false,
    materials: []
  });
  const [categoryFormData, setCategoryFormData] = useState({
    name: ''
  });

  useEffect(() => {
    fetchServicePrices();
    fetchCategories();
    fetchMaterials();
  }, []);

  const fetchServicePrices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setServicePrices(data);
      } else {
        setError('Ошибка при получении списка услуг');
      }
    } catch (error) {
      console.error('Error fetching service prices:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
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
        // API возвращает массив объектов ServiceCategory
        setCategories(data || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await materialsApi.list('', 'active');
      if (response.success) {
        console.log('Загружено материалов:', response.data.length);
        console.log('Материалы:', response.data);
        setMaterials(response.data || []);
      } else {
        console.error('Ошибка загрузки материалов:', response.error);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  };

  const handleMaterialSearch = (searchValue) => {
    console.log('Поиск материала:', searchValue);
    console.log('Всего материалов в памяти:', materials.length);
    setMaterialSearch(searchValue);
    if (!searchValue.trim()) {
      console.log('Пустой поиск - очищаем список');
      setFilteredMaterials([]);
    } else {
      const filtered = materials.filter(m => 
        m.name.toLowerCase().includes(searchValue.toLowerCase())
      );
      console.log('Найдено материалов:', filtered.length);
      console.log('Отфильтрованные материалы:', filtered);
      setFilteredMaterials(filtered);
    }
  };

  const addMaterial = (material) => {
    const exists = formData.materials.find(m => m.material_id === material.id);
    if (exists) {
      setError('Этот материал уже добавлен');
      setTimeout(() => setError(''), 3000);
      return;
    }

    console.log('Добавляем материал:', material.name);
    setFormData(prev => ({
      ...prev,
      materials: [...prev.materials, {
        material_id: material.id,
        material_name: material.name,
        quantity: 1,
        unit: material.unit || '',
        available_balance: material.balance || 0
      }]
    }));
    setMaterialSearch('');
    setFilteredMaterials([]);
  };

  const removeMaterial = (materialId) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m.material_id !== materialId)
    }));
  };

  const updateMaterialQuantity = (materialId, quantity) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.map(m =>
        m.material_id === materialId ? { ...m, quantity: parseFloat(quantity) || 0 } : m
      )
    }));
  };

  const handleCreate = () => {
    setEditingPrice(null);
    setFormData({
      service_name: '',
      service_name_kz: '',
      service_code: '',
      category: '',
      price: '',
      description: '',
      disable_discount: false,
      materials: []
    });
    setMaterialSearch('');
    setFilteredMaterials([]);
    setShowModal(true);
  };

  const handleEdit = (price) => {
    setEditingPrice(price);
    setFormData({
      service_name: price.service_name,
      service_name_kz: price.service_name_kz || '',
      service_code: price.service_code || '',
      category: price.category || '',
      price: price.price || '',
      description: price.description || '',
      disable_discount: price.disable_discount || false,
      materials: price.materials || []
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
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
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchServicePrices();
        await fetchCategories();
        setShowModal(false);
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении услуги');
      }
    } catch (error) {
      console.error('Error saving service price:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (priceId) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту услугу?')) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API}/api/service-prices/${priceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await fetchServicePrices();
        await fetchCategories();
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении услуги');
      }
    } catch (error) {
      console.error('Error deleting service price:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  // Category management functions
  const handleCreateCategory = () => {
    setEditingCategory(null);
    setCategoryFormData({ name: '' });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API}/api/service-categories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: categoryFormData.name })
      });

      if (response.ok) {
        await fetchCategories();
        setShowCategoryModal(false);
        setCategoryFormData({ name: '' });
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении категории');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    if (!window.confirm(`Вы уверены, что хотите удалить категорию "${category.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API}/api/service-categories/${categoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await fetchCategories();
        await fetchServicePrices();
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении категории');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  // ===== Import Excel functions =====
  const handleImportClick = () => {
    setShowImportModal(true);
    setImportFile(null);
    setImportPreview(null);
    setImportError('');
    setImportResult(null);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const allowedTypes = ['.xls', '.xlsx'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      setImportError('Разрешены только файлы .xls и .xlsx');
      return;
    }
    
    setImportFile(file);
    setImportError('');
    setImportResult(null);
    
    // Preview file
    try {
      setImportLoading(true);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API}/api/price-import/preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setImportPreview(data);
      } else {
        const errorData = await response.json();
        setImportError(errorData.detail?.message || errorData.detail || 'Ошибка предпросмотра файла');
      }
    } catch (error) {
      console.error('Preview error:', error);
      setImportError('Ошибка подключения к серверу');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    
    try {
      setImportLoading(true);
      setImportError('');
      
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', importFile);
      
      const params = new URLSearchParams({
        update_existing: importOptions.update_existing,
        skip_duplicates: importOptions.skip_duplicates
      });
      
      const response = await fetch(`${API}/api/price-import/upload?${params}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setImportResult(data);
        // Refresh data
        await fetchServicePrices();
        await fetchCategories();
      } else {
        const errorData = await response.json();
        setImportError(errorData.detail?.message || errorData.detail || 'Ошибка импорта');
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportError('Ошибка подключения к серверу');
    } finally {
      setImportLoading(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportPreview(null);
    setImportError('');
    setImportResult(null);
  };

  // ===== Clear Price functions =====
  const handleClearClick = async () => {
    // Fetch stats first
    try {
      setClearLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/price-import/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPriceStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setClearLoading(false);
    }
    setShowClearModal(true);
  };

  const handleClearPrices = async (clearSpecialties = false) => {
    try {
      setClearLoading(true);
      const token = localStorage.getItem('token');
      
      // Clear service prices and categories
      const response = await fetch(`${API}/api/price-import/clear-all?clear_categories=true`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при очистке прайса');
        return;
      }

      // Optionally clear specialties imported from price
      if (clearSpecialties) {
        const specResponse = await fetch(`${API}/api/price-import/clear-specialties?only_imported=true`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!specResponse.ok) {
          console.error('Error clearing specialties');
        }
      }
      
      // Refresh data
      await fetchServicePrices();
      await fetchCategories();
      setShowClearModal(false);
      setError('');
    } catch (error) {
      console.error('Error clearing prices:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setClearLoading(false);
    }
  };

  // Filter and paginate services
  const filteredServices = servicePrices.filter(price => {
    const matchesSearch = !searchQuery || 
      price.service_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      price.service_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      price.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || price.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredServices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedServices = filteredServices.slice(startIndex, startIndex + itemsPerPage);

  // Reset to first page when filters change
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleCategoryFilter = (value) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Прайс-лист услуг"
          subtitle="Управление ценами и категориями медицинских услуг"
          onAction={(user?.role === 'admin' || user?.role === 'super_admin') ? handleCreate : undefined}
          actionLabel="+ Добавить услугу"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          
          {/* Category Management Section */}
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Категории услуг
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearClick}
                    className={buttonDangerClasses}
                    title="Очистить прайс и категории"
                  >
                    🗑️ Очистить прайс
                  </button>
                  <button
                    onClick={handleImportClick}
                    className={buttonSecondaryClasses}
                    title="Импортировать прайс из Excel файла"
                  >
                    📥 Импорт Excel
                  </button>
                  <button
                    onClick={handleCreateCategory}
                    className={buttonPrimaryClasses}
                  >
                    + Добавить категорию
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <div
                      key={category.id}
                      className="inline-flex items-center bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-600"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {category.name}
                      </span>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        title="Удалить категорию"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Категории не добавлены
                  </p>
                )}
              </div>
            </div>
          )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded dark:bg-red-900 dark:border-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Поиск по названию, коду..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={inputClasses}
          />
        </div>
        <div className="w-48">
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryFilter(e.target.value)}
            className={selectClasses}
          >
            <option value="">Все категории</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Найдено: {filteredServices.length} из {servicePrices.length}
        </div>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={tableClasses}>
          <thead>
            <tr className={tableHeaderClasses}>
              <th className="px-6 py-3 text-left">Название услуги</th>
              <th className="px-6 py-3 text-left">Категория</th>
              <th className="px-6 py-3 text-left">Цена</th>
              <th className="px-6 py-3 text-left">Описание</th>
              <th className="px-6 py-3 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {paginatedServices.map((price) => (
              <tr key={price.id} className={tableRowClasses}>
                <td className="px-6 py-4 font-medium">{price.service_name}</td>
                <td className="px-6 py-4">{price.category || '-'}</td>
                <td className="px-6 py-4">{price.price ? `${price.price.toLocaleString()} ₸` : '-'}</td>
                <td className="px-6 py-4 max-w-xs truncate">{price.description || '-'}</td>
                <td className="px-6 py-4">
                  <div className="flex space-x-2">
                    {(user?.role === 'admin' || user?.role === 'super_admin') && (
                      <>
                        <button
                          onClick={() => handleEdit(price)}
                          className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(price.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paginatedServices.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                  {searchQuery || selectedCategory ? 'Ничего не найдено' : 'Услуги не добавлены'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Показать:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ««
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              «
            </button>
            
            <span className="px-3 py-1 text-sm">
              {currentPage} из {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              »
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              »»
            </button>
          </div>
          
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredServices.length)} из {filteredServices.length}
          </div>
        </div>
      )}

      {/* Service Price Modal */}
      <Modal
        show={showModal}
        onClose={() => {
          setShowModal(false);
          setMaterialSearch('');
          setFilteredMaterials([]);
        }}
        title={editingPrice ? 'Редактировать услугу' : 'Новая услуга'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Название услуги *</label>
              <input
                type="text"
                value={formData.service_name}
                onChange={(e) => setFormData(prev => ({ ...prev, service_name: e.target.value }))}
                className={inputClasses}
                placeholder="Консультация терапевта"
                required
              />
            </div>

            <div>
              <label className={labelClasses}>Название на казахском языке</label>
              <input
                type="text"
                value={formData.service_name_kz}
                onChange={(e) => setFormData(prev => ({ ...prev, service_name_kz: e.target.value }))}
                className={inputClasses}
                placeholder="Терапевт консультациясы"
              />
              <p className="text-xs text-gray-500 mt-1">
                Не обязательно к заполнению, только в случае если есть документы с шаблоном с казахским языком
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Код услуги</label>
              <input
                type="text"
                value={formData.service_code}
                onChange={(e) => setFormData(prev => ({ ...prev, service_code: e.target.value }))}
                className={inputClasses}
                placeholder="001"
              />
              <p className="text-xs text-gray-500 mt-1">
                Используется для внутреннего учета
              </p>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Специальность</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className={selectClasses}
            >
              <option value="">Выберите специальность</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Цена, ₸</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                className={inputClasses}
                placeholder="1500"
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className={labelClasses}>Скидка</label>
              <select
                value={formData.disable_discount ? "no" : "yes"}
                onChange={(e) => setFormData(prev => ({ ...prev, disable_discount: e.target.value === "no" }))}
                className={selectClasses}
              >
                <option value="yes">Разрешена</option>
                <option value="no">Запрещена</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Описание</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className={inputClasses}
              rows="3"
              placeholder="Описание услуги"
            />
          </div>

          <div>
            <label className={labelClasses}>Материалы:</label>
            <div className="relative">
              <input
                type="text"
                value={materialSearch}
                onChange={(e) => handleMaterialSearch(e.target.value)}
                className={inputClasses}
                placeholder="Введите название материала для поиска"
              />
              
              {/* Выпадающий список материалов при поиске */}
              {materialSearch && filteredMaterials.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900 text-xs font-semibold text-blue-900 dark:text-blue-100">
                    Найдено материалов: {filteredMaterials.length}
                  </div>
                  {filteredMaterials.slice(0, 10).map((material) => (
                    <div
                      key={material.id}
                      onClick={() => addMaterial(material)}
                      className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-600 last:border-0"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{material.name}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Остаток: <span className="font-semibold">{material.balance}</span> {material.unit || 'шт'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Сообщение если материалы не найдены */}
              {materialSearch && filteredMaterials.length === 0 && materials.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3">
                  <p className="text-sm text-gray-500 text-center">
                    Материалы не найдены. Попробуйте другой запрос.
                  </p>
                </div>
              )}
              
              {/* Показать если материалы вообще не загружены */}
              {materialSearch && materials.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3">
                  <p className="text-sm text-red-500 text-center">
                    Материалы не загружены. Проверьте подключение к серверу.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700">
              <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <div className="col-span-5">Материал</div>
                <div className="col-span-2">Остаток</div>
                <div className="col-span-2">Количество</div>
                <div className="col-span-2">Ед. изм.</div>
                <div className="col-span-1"></div>
              </div>
              
              {formData.materials.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Материалы не добавлены. Используйте поиск выше для добавления.
                </p>
              ) : (
                <div className="space-y-2">
                  {formData.materials.map((material) => (
                    <div key={material.material_id} className="grid grid-cols-12 gap-2 items-center bg-white dark:bg-gray-800 p-2 rounded">
                      <div className="col-span-5 text-sm font-medium text-gray-900 dark:text-white">
                        {material.material_name}
                      </div>
                      <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400">
                        {material.available_balance}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={material.quantity}
                          onChange={(e) => updateMaterialQuantity(material.material_id, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm"
                        />
                      </div>
                      <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400">
                        {material.unit}
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeMaterial(material.material_id)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          title="Удалить"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setShowModal(false)}
              className={buttonSecondaryClasses}
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className={buttonPrimaryClasses}
              disabled={!formData.service_name || loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal
        show={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Новая категория"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Название категории *</label>
            <input
              type="text"
              value={categoryFormData.name}
              onChange={(e) => setCategoryFormData({ name: e.target.value })}
              className={inputClasses}
              placeholder="Консультации"
              required
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setShowCategoryModal(false)}
              className={buttonSecondaryClasses}
            >
              Отмена
            </button>
            <button
              onClick={handleSaveCategory}
              className={buttonPrimaryClasses}
              disabled={!categoryFormData.name || loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Import Excel Modal */}
      <Modal
        show={showImportModal}
        onClose={closeImportModal}
        title="Импорт прайса из Excel"
      >
        <div className="space-y-4">
          {!importResult && (
            <>
              <div>
                <label className={labelClasses}>Выберите файл Excel (.xls, .xlsx)</label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300"
                />
                <p className="mt-1 text-xs text-gray-500">Колонки: Название, Цена (обязательные), Специальность, Код, Скидка, Статус</p>
              </div>

              {importLoading && (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Анализ файла...</p>
                </div>
              )}

              {importError && (
                <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded dark:bg-red-900 dark:text-red-300 text-sm">
                  {importError}
                </div>
              )}

              {importPreview && !importLoading && (
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Предпросмотр</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Услуг в файле: <b>{importPreview.total_services}</b></div>
                      <div>Новых: <b className="text-green-600">{importPreview.services_preview?.new_count || 0}</b></div>
                      <div>Дубликатов: <b className="text-yellow-600">{importPreview.services_preview?.duplicate_count || 0}</b></div>
                      <div>Категорий: <b>{importPreview.categories?.total || 0}</b></div>
                    </div>
                    {importPreview.categories?.new?.length > 0 && (
                      <p className="mt-2 pt-2 border-t border-blue-200 text-sm text-blue-700 dark:text-blue-400">
                        Новые категории: {importPreview.categories.new.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={importOptions.update_existing} onChange={(e) => setImportOptions({...importOptions, update_existing: e.target.checked})} className="rounded"/>
                      <span className="text-gray-700 dark:text-gray-300">Обновлять существующие услуги</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={importOptions.skip_duplicates} onChange={(e) => setImportOptions({...importOptions, skip_duplicates: e.target.checked})} className="rounded"/>
                      <span className="text-gray-700 dark:text-gray-300">Пропускать дубликаты</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          {importResult && (
            <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
              <h4 className="font-medium text-green-800 dark:text-green-300 mb-2">✅ Импорт завершён!</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-green-700 dark:text-green-400">
                <div>Создано: <b>{importResult.services?.created || 0}</b></div>
                <div>Обновлено: <b>{importResult.services?.updated || 0}</b></div>
                <div>Пропущено: <b>{importResult.services?.skipped || 0}</b></div>
                <div>Новых категорий: <b>{importResult.categories?.created || 0}</b></div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button onClick={closeImportModal} className={buttonSecondaryClasses}>
              {importResult ? 'Закрыть' : 'Отмена'}
            </button>
            {!importResult && importPreview && (
              <button onClick={handleImportConfirm} className={buttonPrimaryClasses} disabled={importLoading}>
                {importLoading ? 'Импорт...' : `Импортировать (${importPreview.services_preview?.new_count || 0})`}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Clear Price Modal */}
      <Modal
        show={showClearModal}
        onClose={() => setShowClearModal(false)}
        title="🗑️ Очистка прайса"
        size="max-w-md"
      >
        <div className="space-y-4">
          {priceStats && (
            <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg border border-yellow-200 dark:border-yellow-700">
              <h4 className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">Текущая статистика:</h4>
              <div className="text-sm space-y-1 text-yellow-700 dark:text-yellow-400">
                <div>• Услуг в прайсе: <b>{priceStats.service_prices?.active || 0}</b></div>
                <div>• Категорий услуг: <b>{priceStats.service_categories?.active || 0}</b></div>
                <div>• Специальностей врачей: <b>{priceStats.specialties?.active || 0}</b></div>
                {priceStats.service_prices?.categories_list?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-yellow-200">
                    <span className="text-xs">Категории: {priceStats.service_prices.categories_list.slice(0, 5).join(', ')}{priceStats.service_prices.categories_list.length > 5 ? '...' : ''}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg border border-red-200 dark:border-red-700">
            <p className="text-red-700 dark:text-red-300 text-sm">
              ⚠️ <b>Внимание!</b> Будут удалены все услуги из прайса и категории услуг.
            </p>
            <p className="text-red-600 dark:text-red-400 text-xs mt-2">
              Специальности врачей по умолчанию НЕ удаляются (они могут быть привязаны к врачам).
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t">
            <button
              onClick={() => handleClearPrices(false)}
              disabled={clearLoading}
              className={`w-full ${buttonDangerClasses}`}
            >
              {clearLoading ? 'Удаление...' : '🗑️ Очистить прайс'}
            </button>
            <button
              onClick={() => handleClearPrices(true)}
              disabled={clearLoading}
              className="w-full px-4 py-2 text-sm border-2 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
            >
              🗑️ Очистить прайс + импортированные специальности
            </button>
            <button
              onClick={() => setShowClearModal(false)}
              className={`w-full ${buttonSecondaryClasses}`}
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>

        </div>
      </div>
    </div>
  );
};

export default ServicePrices;
