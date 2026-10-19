import React, { useState, useEffect, useRef } from 'react';
import { Calendar, FileText, Plus, Edit, Trash2, CheckCircle, Clock } from 'lucide-react';
import { materialsApi } from '../../api/materials';

const WarehouseInventory = ({ user }) => {
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingInventory, setEditingInventory] = useState(null);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    loadInventories();
    loadMaterials();
  }, [selectedWarehouse, selectedStatus]);

  const loadInventories = async () => {
    try {
      const API = import.meta.env.VITE_BACKEND_URL;
      const token = localStorage.getItem('token');
      let url = `${API}/api/inventories?`;
      if (selectedWarehouse) url += `warehouse=${encodeURIComponent(selectedWarehouse)}&`;
      if (selectedStatus) url += `status=${encodeURIComponent(selectedStatus)}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        console.error('Ошибка загрузки инвентаризаций:', response.status);
        setInventories([]);
        return;
      }
      
      const data = await response.json();
      setInventories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Ошибка загрузки инвентаризаций:', error);
      setInventories([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const result = await materialsApi.list('', 'active');
      if (result.success) {
        setMaterials(Array.isArray(result.data) ? result.data : []);
      } else {
        console.error('Ошибка загрузки материалов:', result.error);
        setMaterials([]);
      }
    } catch (error) {
      console.error('Ошибка загрузки материалов:', error);
      setMaterials([]);
    }
  };

  const handleCreateInventory = () => {
    setEditingInventory(null);
    setShowModal(true);
  };

  const handleEditInventory = (inventory) => {
    setEditingInventory(inventory);
    setShowModal(true);
  };

  const handleDeleteInventory = async (id) => {
    if (!confirm('Удалить эту инвентаризацию?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/inventories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadInventories();
    } catch (error) {
      console.error('Ошибка удаления:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    if (status === 'На заполнении') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-warningBg text-curai-warning">
          <Clock className="w-3 h-3 mr-1" />
          На заполнении
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-positiveBg text-curai-positive">
        <CheckCircle className="w-3 h-3 mr-1" />
        Заполнено
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-curai-muted">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="bg-curai-surface rounded-md border border-curai-border p-4 shadow-none">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="block text-sm font-medium text-curai-ink mb-1">Склад</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full px-3 py-2 border border-curai-control rounded-md focus:outline-none focus:ring-2 focus:ring-curai-focus"
            >
              <option value="">Любой склад</option>
              <option value="Склад по умолчанию">Склад по умолчанию</option>
              <option value="Основной склад">Основной склад</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-curai-ink mb-1">Статус</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-curai-control rounded-md focus:outline-none focus:ring-2 focus:ring-curai-focus"
            >
              <option value="">Все</option>
              <option value="На заполнении">На заполнении</option>
              <option value="Заполнено">Заполнено</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleCreateInventory}
              className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Начать инвентаризацию
            </button>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-curai-surface rounded-md border border-curai-border shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-curai-border">
            <thead className="bg-curai-subtle">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Дата инвентаризации
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Склад
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Дата заполнения
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-curai-surface divide-y divide-curai-border">
              {inventories.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-curai-muted">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-curai-muted" />
                    <p className="text-sm">Нет инвентаризаций</p>
                    <p className="text-xs text-curai-muted mt-1">Создайте первую инвентаризацию</p>
                  </td>
                </tr>
              ) : (
                inventories.map((inventory) => (
                  <tr key={inventory.id} className="hover:bg-curai-subtle">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-curai-ink">
                      {inventory.number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-curai-muted" />
                        {formatDate(inventory.inventory_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                      {inventory.warehouse_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(inventory.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-muted">
                      {formatDate(inventory.completion_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditInventory(inventory)}
                        className="text-curai-blue hover:text-curai-blue mr-3"
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {user?.role === 'admin' || user?.role === 'super_admin' && (
                        <button
                          onClick={() => handleDeleteInventory(inventory.id)}
                          className="text-curai-negative hover:text-curai-negative"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-curai-muted px-2">
        Всего {inventories.length} записей
      </div>

      {/* Модальное окно */}
      {showModal && (
        <InventoryModal
          inventory={editingInventory}
          materials={materials}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            loadInventories();
          }}
        />
      )}
    </div>
  );
};

// Модальное окно инвентаризации
const InventoryModal = ({ inventory, materials, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    warehouse_name: inventory?.warehouse_name || 'Склад по умолчанию',
    status: inventory?.status || 'На заполнении',
    notes: inventory?.notes || '',
    items: inventory?.items || []
  });
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const materialSearchRef = useRef(null);

  const filteredMaterials = materials.filter(m =>
    m.name.toLowerCase().includes(materialSearch.toLowerCase())
  );

  const handleMaterialSelect = (material) => {
    addMaterial(material);
    setMaterialSearch('');
    setMaterialDropdownOpen(false);
    materialSearchRef.current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const API = import.meta.env.VITE_BACKEND_URL;
      const url = inventory 
        ? `${API}/api/inventories/${inventory.id}`
        : `${API}/api/inventories`;
      
      const method = inventory ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        onSave();
      } else {
        const errorData = await response.text();
        console.error('Ошибка сохранения инвентаризации:', response.status, errorData);
        alert(`Ошибка сохранения: ${response.status}. ${errorData}`);
      }
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      alert('Не удалось сохранить инвентаризацию. Проверьте, запущен ли backend-сервер.');
    }
  };

  const addMaterial = (material) => {
    if (formData.items.some(item => item.material_id === material.id)) {
      return;
    }

    setFormData({
      ...formData,
      items: [...formData.items, {
        material_id: material.id,
        material_name: material.name,
        expected_quantity: material.balance,
        actual_quantity: null,
        difference: null,
        notes: ''
      }]
    });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    
    if (field === 'actual_quantity' && value !== null) {
      newItems[index].difference = value - newItems[index].expected_quantity;
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-curai-surface rounded-md shadow-none max-w-4xl w-full max-h-[90vh] overflow-hidden curai-glass-shell curai-custom-dialog">
        <div className="px-6 py-4 border-b border-curai-border flex justify-between items-center curai-glass-header">
          <h3 className="text-xl font-semibold text-curai-ink">
            {inventory ? 'Редактировать инвентаризацию' : 'Новая инвентаризация'}
          </h3>
          <button onClick={onClose} className="text-curai-muted hover:text-curai-muted">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col curai-glass-body" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          <div className="px-6 py-4 overflow-y-auto">
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Склад</label>
                <select
                  value={formData.warehouse_name}
                  onChange={(e) => setFormData({ ...formData, warehouse_name: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:outline-none focus:ring-2 focus:ring-curai-focus"
                  required
                >
                  <option value="Склад по умолчанию">Склад по умолчанию</option>
                  <option value="Основной склад">Основной склад</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-curai-ink mb-1">Статус</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:outline-none focus:ring-2 focus:ring-curai-focus"
              >
                <option value="На заполнении">На заполнении</option>
                <option value="Заполнено">Заполнено</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-curai-ink mb-1">Примечание</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:outline-none focus:ring-2 focus:ring-curai-focus"
                rows="2"
              />
            </div>

            <div className="mb-2">
              <label className="block text-sm font-medium text-curai-ink mb-2">Материалы</label>
              <div className="relative mb-2" ref={materialSearchRef}>
                <input
                  type="text"
                  placeholder="Поиск материала..."
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setMaterialDropdownOpen(true);
                  }}
                  onFocus={() => setMaterialDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setMaterialDropdownOpen(false), 200)}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:outline-none focus:ring-2 focus:ring-curai-focus"
                />
                {materialDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-curai-surface border border-curai-control rounded-md shadow-none max-h-48 overflow-y-auto">
                    {filteredMaterials.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-curai-muted">Ничего не найдено</div>
                    ) : (
                      filteredMaterials.map(material => (
                        <button
                          key={material.id}
                          type="button"
                          onClick={() => handleMaterialSelect(material)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-curai-selected focus:bg-curai-selected focus:outline-none border-b border-curai-border last:border-b-0"
                        >
                          <span className="font-medium">{material.name}</span>
                          <span className="text-curai-muted ml-2">(остаток: {material.balance})</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {formData.items.length > 0 && (
                <div className="border border-curai-border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-curai-border">
                    <thead className="bg-curai-subtle">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-curai-muted">Материал</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-curai-muted">Ожидается</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-curai-muted">Факт</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-curai-muted">Разница</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-curai-muted">Примечание</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-curai-border">
                      {formData.items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 text-sm">{item.material_name}</td>
                          <td className="px-3 py-2 text-sm">{item.expected_quantity}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.actual_quantity || ''}
                              onChange={(e) => updateItem(index, 'actual_quantity', parseFloat(e.target.value) || null)}
                              className="w-20 px-2 py-1 border border-curai-control rounded text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {item.difference !== null && (
                              <span className={item.difference < 0 ? "text-curai-negative" : item.difference > 0 ? "text-curai-positive" : ''}>
                                {item.difference > 0 ? '+' : ''}{item.difference}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={item.notes || ''}
                              onChange={(e) => updateItem(index, 'notes', e.target.value)}
                              className="w-full px-2 py-1 border border-curai-control rounded text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-curai-negative hover:text-curai-negative"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-curai-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-curai-control rounded-md text-curai-ink hover:bg-curai-subtle"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WarehouseInventory;
