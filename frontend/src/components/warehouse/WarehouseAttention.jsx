import React, { useState, useEffect } from 'react';
import { AlertTriangle, Package, Calendar, TrendingDown } from 'lucide-react';

const WarehouseAttention = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMaterialsNeedingAttention();
  }, []);

  const loadMaterialsNeedingAttention = async () => {
    try {
      const API = import.meta.env.VITE_BACKEND_URL;
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/materials/needs-attention`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        console.error('Ошибка загрузки материалов:', response.status);
        setMaterials([]);
        return;
      }
      
      const data = await response.json();
      setMaterials(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Ошибка загрузки материалов:', error);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Никогда';
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getSeverityColor = (shortage, minStock) => {
    if (minStock <= 0) return 'bg-red-100 border-red-300';
    const percentage = (shortage / minStock) * 100;
    if (percentage >= 75) return 'bg-red-100 border-red-300';
    if (percentage >= 50) return 'bg-orange-100 border-orange-300';
    return 'bg-yellow-100 border-yellow-300';
  };

  const getSeverityTextColor = (shortage, minStock) => {
    if (minStock <= 0) return 'text-red-800';
    const percentage = (shortage / minStock) * 100;
    if (percentage >= 75) return 'text-red-800';
    if (percentage >= 50) return 'text-orange-800';
    return 'text-yellow-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Заголовок с общей статистикой */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-200 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Материалы, требующие внимания</h2>
            <p className="text-gray-600">
              Материалы с остатком ниже минимального уровня на складах
            </p>
          </div>
          <div className="bg-white rounded-lg px-4 py-3 border border-red-200">
            <div className="text-3xl font-bold text-red-600">{materials.length}</div>
            <div className="text-xs text-gray-500 mt-1">критических позиций</div>
          </div>
        </div>
      </div>

      {/* Список материалов */}
      {materials.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <Package className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Все материалы в норме</h3>
          <p className="text-gray-500">
            Нет материалов с остатком ниже минимального уровня
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {materials.map((material, index) => (
            <div
              key={`${material.material_id}-${material.warehouse_name}-${index}`}
              className={`rounded-xl border-2 p-6 shadow-sm hover:shadow-md transition-shadow ${getSeverityColor(material.shortage, material.min_stock)}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`rounded-full p-2 ${getSeverityColor(material.shortage, material.min_stock)}`}>
                    <AlertTriangle className={`w-6 h-6 ${getSeverityTextColor(material.shortage, material.min_stock)}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {material.material_name}
                    </h3>
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {material.warehouse_name}
                    </p>
                  </div>
                </div>

                <div className={`text-right px-4 py-2 rounded-lg border-2 ${getSeverityColor(material.shortage, material.min_stock)}`}>
                  <div className={`text-2xl font-bold ${getSeverityTextColor(material.shortage, material.min_stock)}`}>
                    -{material.shortage.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">дефицит</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-300">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Текущий остаток</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {material.current_stock.toFixed(2)}
                    {material.unit && <span className="text-sm text-gray-500 ml-1">{material.unit}</span>}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">Минимум</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {material.min_stock.toFixed(2)}
                    {material.unit && <span className="text-sm text-gray-500 ml-1">{material.unit}</span>}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">Процент дефицита</div>
                  <div className={`text-lg font-semibold ${getSeverityTextColor(material.shortage, material.min_stock)}`}>
                    {material.min_stock > 0
                      ? `${((material.shortage / material.min_stock) * 100).toFixed(1)}%`
                      : '100%'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Последняя инвентаризация
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(material.last_inventory_date)}
                  </div>
                </div>
              </div>

              {/* Индикатор критичности */}
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className={`w-4 h-4 ${getSeverityTextColor(material.shortage, material.min_stock)}`} />
                  <span className="text-xs font-medium text-gray-700">Уровень критичности</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (material.min_stock > 0 && (material.shortage / material.min_stock) * 100 >= 75)
                        ? 'bg-red-500'
                        : (material.min_stock > 0 && (material.shortage / material.min_stock) * 100 >= 50)
                        ? 'bg-orange-500'
                        : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.min(100, material.min_stock > 0 ? (material.shortage / material.min_stock) * 100 : 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {materials.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>Рекомендация:</strong> Рекомендуется провести заказ материалов или инвентаризацию для
            подтверждения фактических остатков на складах.
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseAttention;
