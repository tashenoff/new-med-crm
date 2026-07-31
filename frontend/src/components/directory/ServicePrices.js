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

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    service_name: '',
    service_name_kz: '',
    service_code: '',
    barcode: '',
    category: '',
    price: '',
    payment_type: '',
    description: '',
    disable_discount: false,
    require_medical_history: false,
    show_in_online_booking: false,
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
      barcode: '',
      category: '',
      price: '',
      payment_type: '',
      description: '',
      disable_discount: false,
      require_medical_history: false,
      show_in_online_booking: false,
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
      barcode: price.barcode || '',
      category: price.category || '',
      price: price.price || '',
      payment_type: price.payment_type || '',
      description: price.description || '',
      disable_discount: price.disable_discount || false,
      require_medical_history: price.require_medical_history || false,
      show_in_online_booking: price.show_in_online_booking || false,
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

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Прайс-лист услуг"
          subtitle="Управление ценами и категориями медицинских услуг"
          onAction={user?.role === 'admin' || user?.role === 'super_admin' ? handleCreate : undefined}
          actionLabel="+ Добавить услугу"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          
          {/* Category Management Section */}
          {user?.role === 'admin' || user?.role === 'super_admin' && (
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Категории услуг
                </h3>
                <button
                  onClick={handleCreateCategory}
                  className={buttonPrimaryClasses}
                >
                  + Добавить категорию
                </button>
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
            {servicePrices.map((price) => (
              <tr key={price.id} className={tableRowClasses}>
                <td className="px-6 py-4 font-medium">{price.service_name}</td>
                <td className="px-6 py-4">{price.category || '-'}</td>
                <td className="px-6 py-4">{price.price ? `${price.price} ₸` : '-'}</td>
                <td className="px-6 py-4">{price.description || '-'}</td>
                <td className="px-6 py-4">
                  <div className="flex space-x-2">
                    {user?.role === 'admin' || user?.role === 'super_admin' && (
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
            {servicePrices.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                  Услуги не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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

            <div>
              <label className={labelClasses}>Штрих-код</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                className={inputClasses}
                placeholder="123456789"
              />
              <p className="text-xs text-gray-500 mt-1">
                Используется при продаже товаров, для быстрого сканирования
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
              <label className={labelClasses}>Оплата</label>
              <select
                value={formData.payment_type}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_type: e.target.value }))}
                className={selectClasses}
              >
                <option value="">Оплата врачу</option>
                <option value="doctor">Оплата врачу</option>
                <option value="clinic">Оплата клинике</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Запретить пробивать скидку</label>
              <select
                value={formData.disable_discount ? "yes" : "no"}
                onChange={(e) => setFormData(prev => ({ ...prev, disable_discount: e.target.value === "yes" }))}
                className={selectClasses}
              >
                <option value="yes">Скидка разрешена</option>
                <option value="no">Скидка запрещена</option>
              </select>
            </div>

            <div>
              <label className={labelClasses}>Контроль заполнения истории болезней</label>
              <select
                value={formData.require_medical_history ? "required" : "not_required"}
                onChange={(e) => setFormData(prev => ({ ...prev, require_medical_history: e.target.value === "required" }))}
                className={selectClasses}
              >
                <option value="required">Требует заполнения</option>
                <option value="not_required">Не требует</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Влияет на отчёт по заполняемости карт ИБ
              </p>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Показывать в "Онлайн записи" и Medflex</label>
            <select
              value={formData.show_in_online_booking ? "yes" : "no"}
              onChange={(e) => setFormData(prev => ({ ...prev, show_in_online_booking: e.target.value === "yes" }))}
              className={selectClasses}
            >
              <option value="no">Нет</option>
              <option value="yes">Да</option>
            </select>
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
        </div>
      </div>
    </div>
  );
};

export default ServicePrices;
