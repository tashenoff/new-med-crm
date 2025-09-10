import React from 'react';

/**
 * Компонент для отображения информации о планах лечения клиента
 */
const TreatmentPlanInfo = ({ 
  treatmentData, 
  isLoading, 
  clientId,
  compact = false 
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-xs text-gray-500">Загрузка планов...</span>
      </div>
    );
  }

  if (!treatmentData || treatmentData.treatmentPlansCount === 0) {
    return (
      <div className="text-xs text-gray-400">
        Планы лечения не найдены
      </div>
    );
  }

  const { totalAmount, paidAmount, pendingAmount, treatmentPlansCount, plans } = treatmentData;
  const paidPercentage = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-gray-700">
          {treatmentPlansCount} {treatmentPlansCount === 1 ? 'план' : 'планов'} лечения
        </div>
        {totalAmount > 0 && (
          <>
            <div className="text-xs text-green-600 font-medium">
              Оплачено: {paidAmount.toLocaleString()}₸
            </div>
            {pendingAmount > 0 && (
              <div className="text-xs text-orange-600">
                К доплате: {pendingAmount.toLocaleString()}₸
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-blue-900">
          📋 Планы лечения
        </h4>
        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
          {treatmentPlansCount} {treatmentPlansCount === 1 ? 'план' : 'планов'}
        </span>
      </div>

      {totalAmount > 0 ? (
        <div className="space-y-2">
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${paidPercentage}%` }}
            ></div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-600">Общая сумма:</div>
              <div className="font-medium text-gray-900">
                {totalAmount.toLocaleString()}₸
              </div>
            </div>
            <div>
              <div className="text-gray-600">Оплачено ({paidPercentage}%):</div>
              <div className="font-medium text-green-600">
                {paidAmount.toLocaleString()}₸
              </div>
            </div>
          </div>

          {pendingAmount > 0 && (
            <div className="pt-1 border-t border-blue-200">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">К доплате:</span>
                <span className="text-sm font-medium text-orange-600">
                  {pendingAmount.toLocaleString()}₸
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-500">
          Финансовая информация недоступна
        </div>
      )}

      {treatmentData.lastUpdate && (
        <div className="text-xs text-gray-400 pt-1 border-t border-blue-200">
          Обновлено: {new Date(treatmentData.lastUpdate).toLocaleString('ru-RU')}
        </div>
      )}
    </div>
  );
};

export default TreatmentPlanInfo;
