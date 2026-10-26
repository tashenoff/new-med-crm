import LoadingIndicator from '../common/LoadingIndicator';
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
    if (minStock <= 0) return "bg-curai-negativeBg border-curai-negative";
    const percentage = (shortage / minStock) * 100;
    if (percentage >= 75) return "bg-curai-negativeBg border-curai-negative";
    if (percentage >= 50) return "bg-curai-warningBg border-curai-warning";
    return "bg-curai-warningBg border-curai-warning";
  };

  const getSeverityTextColor = (shortage, minStock) => {
    if (minStock <= 0) return "text-curai-negative";
    const percentage = (shortage / minStock) * 100;
    if (percentage >= 75) return "text-curai-negative";
    if (percentage >= 50) return "text-curai-warning";
    return "text-curai-warning";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingIndicator label="Загрузка..." className="text-curai-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Заголовок с общей статистикой */}
      <div className="bg-curai-negativeBg rounded-md border border-curai-negative p-6 shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-curai-ink mb-2">Материалы, требующие внимания</h2>
            <p className="text-curai-muted">
              Материалы с остатком ниже минимального уровня на складах
            </p>
          </div>
          <div className="bg-curai-surface rounded-md px-4 py-3 border border-curai-negative">
            <div className="text-2xl font-semibold text-curai-negative">{materials.length}</div>
            <div className="text-xs text-curai-muted mt-1">критических позиций</div>
          </div>
        </div>
      </div>

      {/* Список материалов */}
      {materials.length === 0 ? (
        <div className="bg-curai-surface rounded-md border border-curai-border p-12 text-center shadow-none">
          <Package className="w-16 h-16 mx-auto mb-4 text-curai-positive" />
          <h3 className="text-lg font-medium text-curai-ink mb-2">Все материалы в норме</h3>
          <p className="text-curai-muted">
            Нет материалов с остатком ниже минимального уровня
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {materials.map((material, index) => (
            <div
              key={`${material.material_id}-${material.warehouse_name}-${index}`}
              className={`rounded-md border-2 p-6 shadow-none hover:shadow-none transition-shadow ${getSeverityColor(material.shortage, material.min_stock)}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`rounded-full p-2 ${getSeverityColor(material.shortage, material.min_stock)}`}>
                    <AlertTriangle className={`w-6 h-6 ${getSeverityTextColor(material.shortage, material.min_stock)}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-curai-ink mb-1">
                      {material.material_name}
                    </h3>
                    <p className="text-sm text-curai-muted flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {material.warehouse_name}
                    </p>
                  </div>
                </div>

                <div className={`text-right px-4 py-2 rounded-md border-2 ${getSeverityColor(material.shortage, material.min_stock)}`}>
                  <div className={`text-2xl font-semibold ${getSeverityTextColor(material.shortage, material.min_stock)}`}>
                    -{material.shortage.toFixed(2)}
                  </div>
                  <div className="text-xs text-curai-muted mt-1">дефицит</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 pt-4 border-t border-curai-control">
                <div>
                  <div className="text-xs text-curai-muted mb-1">Текущий остаток</div>
                  <div className="text-lg font-semibold text-curai-ink">
                    {material.current_stock.toFixed(2)}
                    {material.unit && <span className="text-sm text-curai-muted ml-1">{material.unit}</span>}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-curai-muted mb-1">Минимум</div>
                  <div className="text-lg font-semibold text-curai-ink">
                    {material.min_stock.toFixed(2)}
                    {material.unit && <span className="text-sm text-curai-muted ml-1">{material.unit}</span>}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-curai-muted mb-1">Процент дефицита</div>
                  <div className={`text-lg font-semibold ${getSeverityTextColor(material.shortage, material.min_stock)}`}>
                    {material.min_stock > 0
                      ? `${((material.shortage / material.min_stock) * 100).toFixed(1)}%`
                      : '100%'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-curai-muted mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Последняя инвентаризация
                  </div>
                  <div className="text-sm font-medium text-curai-ink">
                    {formatDate(material.last_inventory_date)}
                  </div>
                </div>
              </div>

              {/* Индикатор критичности */}
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className={`w-4 h-4 ${getSeverityTextColor(material.shortage, material.min_stock)}`} />
                  <span className="text-xs font-medium text-curai-ink">Уровень критичности</span>
                </div>
                <div className="w-full bg-curai-border rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (material.min_stock > 0 && (material.shortage / material.min_stock) * 100 >= 75)
                        ? "bg-curai-negative"
                        : (material.min_stock > 0 && (material.shortage / material.min_stock) * 100 >= 50)
                        ? "bg-curai-warning"
                        : "bg-curai-warning"
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
        <div className="bg-curai-selected border border-curai-control rounded-md p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-curai-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-curai-blue">
            <strong>Рекомендация:</strong> Рекомендуется провести заказ материалов или инвентаризацию для
            подтверждения фактических остатков на складах.
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseAttention;
