import { canAction, permissionProps } from '../../utils/permissions.js';
import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../modals/Modal';
import {
  buttonPrimaryClasses,
  buttonSecondaryClasses,
  inputClasses,
  labelClasses,
  tableCellClasses,
  tableHeaderClasses,
  tableRowClasses,
  tableClasses
} from '../modals/modalUtils';
import { materialsApi } from '../../api/materials';
import { themeClasses } from '../../hooks/useTheme';
import PanelHeader from '../common/PanelHeader';

const defaultWarehouses = [
  { warehouse_name: 'Склад по умолчанию', min_stock: 0 },
  { warehouse_name: 'Основной склад', min_stock: 0 }
];

const getNumber = (value) => {
  if (value === '' || value === undefined || value === null) {
    return 0;
  }
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const initialForm = {
  name: '',
  unit: '',
  barcode: '',
  material_type: 'Материал',
  is_product: false,
  warehouses: defaultWarehouses.map((item) => ({ ...item }))
};

const viewKeyToStatus = (key) => {
  if (key === 'warehouse-deleted') return 'deleted';
  return 'active';
};

const WarehouseMaterials = ({ user, viewKey = 'warehouse-materials', onOpenAiChat, onCloseAiChat, aiChatSidebarOpen, materialRefreshTrigger }) => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formValues, setFormValues] = useState(initialForm);
  const [viewMode, setViewMode] = useState(() => viewKeyToStatus(viewKey));
  const isDeletedView = viewMode === 'deleted';

  const fetchMaterials = async (search = '', status = viewMode) => {
    setLoading(true);
    const response = await materialsApi.list(search, status);
    setLoading(false);
    if (response.success) {
      setMaterials(response.data);
    } else {
      setError(response.error);
    }
  };

  useEffect(() => {
    fetchMaterials('', viewMode);
  }, [viewMode]);

  useEffect(() => {
    setViewMode(viewKeyToStatus(viewKey));
  }, [viewKey]);

  useEffect(() => {
    if (materialRefreshTrigger > 0) {
      fetchMaterials(searchTerm, viewMode);
    }
  }, [materialRefreshTrigger]);

  const handleSearch = () => {
    fetchMaterials(searchTerm, viewMode);
  };

  const resetForm = () => {
    setFormValues({
      ...initialForm,
      warehouses: defaultWarehouses.map((item) => ({ ...item }))
    });
    setEditing(null);
  };

  const getFileNameFromDisposition = (contentDisposition) => {
    if (!contentDisposition) {
      return `materials-${new Date().toISOString().split('T')[0]}.xlsx`;
    }
    const match = /filename="?([^";]+)"?/.exec(contentDisposition);
    return match ? match[1] : `materials-${new Date().toISOString().split('T')[0]}.xlsx`;
  };

  const handleExport = async () => {
    setIsExporting(true);
    const response = await materialsApi.exportExcel(searchTerm, viewMode);
    setIsExporting(false);
    if (response.success) {
      const filename = getFileNameFromDisposition(response.filename);
      const blob = new Blob(
        [response.data],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess('Excel-отчет скачан');
      setTimeout(() => setSuccess(''), 3000);
    } else {
      setError(response.error);
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Рассчитываем общий остаток как сумму остатков со всех складов
    const totalBalance = formValues.warehouses.reduce((sum, wh) => 
      sum + getNumber(wh.min_stock), 0);

    const payload = {
      name: formValues.name,
      unit: formValues.unit,
      barcode: formValues.barcode,
      material_type: formValues.material_type,
      is_product: formValues.is_product,
      start_period: totalBalance,
      incoming: 0,
      outgoing: 0,
      inventory: totalBalance,
      balance: totalBalance,
      warehouses: formValues.warehouses.map((warehouse) => ({
        warehouse_name: warehouse.warehouse_name,
        min_stock: getNumber(warehouse.min_stock)
      }))
    };

    const action = editing
      ? materialsApi.update(editing.id, payload)
      : materialsApi.create(payload);

    const response = await action;

    setLoading(false);
    if (response.success) {
      setSuccess(editing ? 'Материал обновлён' : 'Материал добавлен');
      setTimeout(() => setSuccess(''), 3000);
      fetchMaterials(searchTerm, viewMode);
      setShowModal(false);
      resetForm();
    } else {
      setError(response.error);
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleEdit = (material) => {
    setEditing(material);
    setFormValues({
      name: material.name,
      unit: material.unit || '',
      barcode: material.barcode || '',
      material_type: material.material_type || 'Материал',
      is_product: material.is_product || false,
      warehouses: defaultWarehouses.map((item) => {
        const match = material.warehouses?.find((wh) => wh.warehouse_name === item.warehouse_name);
        return {
          ...item,
          min_stock: match?.min_stock?.toString() || '0'
        };
      })
    });
    setShowModal(true);
  };

  const handleDelete = async (materialId) => {
    if (!window.confirm('Удалить материал?')) return;
    setLoading(true);
    const response = await materialsApi.delete(materialId);
    setLoading(false);
    if (response.success) {
      setSuccess('Материал удалён');
      setTimeout(() => setSuccess(''), 3000);
      fetchMaterials(searchTerm, viewMode);
    } else {
      setError(response.error);
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleRestore = async (materialId) => {
    setLoading(true);
    const response = await materialsApi.restore(materialId);
    setLoading(false);
    if (response.success) {
      setSuccess('Материал восстановлен');
      setTimeout(() => setSuccess(''), 3000);
      fetchMaterials(searchTerm, viewMode);
    } else {
      setError(response.error);
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleWarehouseChange = (index, value) => {
    setFormValues((prev) => ({
      ...prev,
      warehouses: prev.warehouses.map((wh, idx) =>
        idx === index ? { ...wh, min_stock: value } : wh
      )
    }));
  };

  const stats = useMemo(() => {
    const totalIncoming = materials.reduce((sum, material) => sum + (material.incoming || 0), 0);
    const totalOutgoing = materials.reduce((sum, material) => sum + (material.outgoing || 0), 0);
    const totalBalance = materials.reduce((sum, material) => sum + (material.balance || 0), 0);
    return { totalIncoming, totalOutgoing, totalBalance };
  }, [materials]);

  const handleCreateMaterial = () => {
    if (onOpenAiChat) {
      onOpenAiChat();
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className={`calendar-container calendar-view-panel rounded-md ${themeClasses.shadow.default}`}>
          <PanelHeader
            title="Материалы"
            subtitle="Список складских материалов, поступлений и остатков."
            onAction={canAction(user, "warehouse_view", "warehouse_edit") ? (user?.role === 'admin' || user?.role === 'super_admin' ? handleCreateMaterial : undefined) : undefined}
            actionLabel="+ Добавить материал"
          />

          <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border p-4 space-y-4 shadow-none">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex gap-3 flex-wrap">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Поиск по названию..."
                  className={inputClasses}
                />
                <button
                  onClick={handleSearch}
                  className={`${buttonPrimaryClasses} px-4 py-2`}
                >
                  Найти
                </button>
                <button
                  onClick={handleExport}
                  className={`${buttonSecondaryClasses} px-4 py-2`}
                  disabled={loading || isExporting}
                 {...permissionProps(user, "warehouse_view", "warehouse_export")}>
                  {isExporting ? 'Готовим...' : 'Скачать Excel'}
                </button>
              </div>
              {loading && (
                <div className="text-sm text-curai-muted ">Загружаем данные...</div>
              )}
            </div>

            {error && (
              <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-curai-positiveBg border border-curai-positive text-curai-positive px-4 py-3 rounded-md">
                {success}
              </div>
            )}
            {isDeletedView && (
              <div className="text-sm text-curai-muted border border-dashed border-curai-border rounded-md p-3 bg-curai-subtle">
                Просмотр удалённых материалов — можно восстановить выбранные позиции.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-curai-subtle p-4 rounded-md text-center">
                <p className="text-sm text-curai-muted">Материалов</p>
                <p className="text-2xl font-semibold text-curai-ink ">{materials.length}</p>
              </div>
              <div className="bg-curai-subtle p-4 rounded-md text-center">
                <p className="text-sm text-curai-muted">Общий приход</p>
                <p className="text-2xl font-semibold text-curai-ink ">{stats.totalIncoming}</p>
              </div>
              <div className="bg-curai-subtle p-4 rounded-md text-center">
                <p className="text-sm text-curai-muted">Текущий остаток</p>
                <p className="text-2xl font-semibold text-curai-ink ">{stats.totalBalance}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className={`${tableClasses}`}>
                <thead className={tableHeaderClasses}>
                  <tr>
                    <th className={`${tableCellClasses} w-8`}>
                      <input type="checkbox" disabled />
                    </th>
                    <th className={tableCellClasses}>Название</th>
                    <th className={tableCellClasses}>На начало периода</th>
                    <th className={tableCellClasses}>Приход за период</th>
                    <th className={tableCellClasses}>Расход за период</th>
                    <th className={tableCellClasses}>Инвентаризация</th>
                    <th className={tableCellClasses}>Остаток</th>
                    <th className={tableCellClasses}>Единица измерения</th>
                    <th className={tableCellClasses}>Тип</th>
                    <th className={tableCellClasses}>Категория</th>
                    <th className={tableCellClasses}>Код</th>
                    <th className={tableCellClasses}></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((material) => (
                    <tr key={material.id} className={`${tableRowClasses}`}>
                      <td className={tableCellClasses}>
                        <input type="checkbox" />
                      </td>
                      <td className={tableCellClasses}>{material.name}</td>
                      <td className={tableCellClasses}>{material .start_period || 0}</td>
                      <td className={tableCellClasses}>{material.incoming || 0}</td>
                      <td className={tableCellClasses}>{material.outgoing || 0}</td>
                      <td className={tableCellClasses}>{material.inventory || 0}</td>
                      <td className={tableCellClasses}>{material.balance || 0}</td>
                      <td className={tableCellClasses}>{material.unit || '-'}</td>
                      <td className={tableCellClasses}>{material.material_type || '-'}</td>
                      <td className={tableCellClasses}>{material.material_type || '-'}</td>
                      <td className={tableCellClasses}>{material.barcode || '-'}</td>
                      <td className={`${tableCellClasses} space-x-2`}>
                        {(user?.role === 'admin' || user?.role === 'super_admin') && (
                          isDeletedView ? (
                            <button
                              onClick={() => handleRestore(material.id)}
                              className="text-curai-positive hover:text-curai-positive text-sm"
                             {...permissionProps(user, "warehouse_view", "warehouse_edit")}>
                              Восстановить
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEdit(material)}
                                className="text-curai-blue hover:text-curai-blue text-sm"
                               {...permissionProps(user, "warehouse_view", "warehouse_edit")}>
                                Изменить
                              </button>
                              <button
                                onClick={() => handleDelete(material.id)}
                                className="text-curai-negative hover:text-curai-negative text-sm"
                               {...permissionProps(user, "warehouse_view", "warehouse_delete")}>
                                Удалить
                              </button>
                            </>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {materials.length === 0 && !loading && (
                <div className="py-10 text-center text-curai-muted ">Материалы не найдены</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        show={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title={editing ? 'Редактировать материал' : 'Добавить материал'}
        errorMessage={error}
        size="max-w-2xl"
      >
        <form onSubmit={event => { if (!canAction(user, "warehouse_view", "warehouse_edit")) { event.preventDefault(); return; } return (handleSubmit)(event); }} className="space-y-4">
          <div>
            <label className={labelClasses}>Название</label>
            <input
              type="text"
              value={formValues.name}
              onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
              className={inputClasses}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_product"
              checked={formValues.is_product}
              onChange={(e) => setFormValues({ ...formValues, is_product: e.target.checked })}
              className="w-4 h-4 rounded border-curai-control text-curai-blue focus:ring-curai-focus"
            />
            <label htmlFor="is_product" className="text-sm text-curai-muted ">Это товар</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Единица измерения</label>
              <input
                type="text"
                value={formValues.unit}
                onChange={(e) => setFormValues({ ...formValues, unit: e.target.value })}
                className={inputClasses}
                placeholder="шт, кг, л и т.д."
              />
            </div>
            <div>
              <label className={labelClasses}>Категория</label>
              <select
                value={formValues.material_type}
                onChange={(e) => setFormValues({ ...formValues, material_type: e.target.value })}
                className={inputClasses}
              >
                <option value="Без категории">Без категории</option>
                <option value="Материал">Материал</option>
                <option value="Расходник">Расходник</option>
                <option value="Инструмент">Инструмент</option>
                <option value="Медикамент">Медикамент</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Штрих-код</label>
            <div className="relative">
              <input
                type="text"
                value={formValues.barcode}
                onChange={(e) => setFormValues({ ...formValues, barcode: e.target.value })}
                className={inputClasses}
                placeholder="Если имеется"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-curai-muted hover:text-curai-muted"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16h16" />
                </svg>
              </button>
            </div>
          </div>

          <details className="border border-curai-border rounded-md">
            <summary className="cursor-pointer px-4 py-3 font-medium text-sm text-curai-ink hover:bg-curai-subtle rounded-md">
              Минимальные остатки
            </summary>
            <div className="px-4 pb-4 pt-2 space-y-3">
              {formValues.warehouses.map((warehouse, index) => (
                <div key={warehouse.warehouse_name} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm text-curai-muted ">
                    {warehouse.warehouse_name}
                  </label>
                  <div className="relative flex items-center">
                    <label className="text-sm text-curai-muted mr-2">Мин остаток</label>
                    <input
                      type="number"
                      min="0"
                      value={warehouse.min_stock}
                      onChange={(e) => handleWarehouseChange(index, e.target.value)}
                      className={inputClasses}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </details>

          <div className="flex gap-3 pt-4">
            <button type="submit" disabled={loading} className={`${buttonPrimaryClasses} flex-1`} {...permissionProps(user, "warehouse_view", "warehouse_edit")}>
              {loading ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowModal(false);
                resetForm();
              }}
              className={`${buttonSecondaryClasses} flex-1`}
            >
              Отмена
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default WarehouseMaterials;
