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
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-curai-control"></div>
        <span className="text-xs text-curai-muted">Загрузка планов...</span>
      </div>
    );
  }

  // ✅ ОБНОВЛЕНО: Если нет данных - показываем сообщение
  // Но если есть депозит - показываем его даже без планов
  if (!treatmentData) {
    return (
      <div className="text-xs text-curai-muted">
        Данные не загружены
      </div>
    );
  }
  
  // Если нет планов и нет депозита - показываем "не найдены"
  const hasDeposit = (treatmentData.depositAmount || 0) > 0 || (treatmentData.depositBalance || 0) > 0;
  if (treatmentData.treatmentPlansCount === 0 && !hasDeposit) {
    return (
      <div className="text-xs text-curai-muted">
        Планы лечения не найдены
      </div>
    );
  }

  const { 
    totalAmount, 
    paidAmount, 
    pendingAmount, 
    treatmentPlansCount, 
    plans, 
    depositAmount = 0,
    depositBalance = 0,  // ✅ Остаток депозита
    depositInPlans = 0,  // Депозит применённый к планам
    depositFromAppointments = 0  // Депозит из записей
  } = treatmentData;
  const totalPaidWithDeposit = paidAmount + depositAmount;
  const paidPercentage = totalAmount > 0 ? Math.round((totalPaidWithDeposit / totalAmount) * 100) : 0;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-curai-ink">
          {treatmentPlansCount} {treatmentPlansCount === 1 ? 'план' : 'планов'} лечения
        </div>
        {totalAmount > 0 && (
          <>
            <div className="text-xs text-curai-positive font-medium">
              Оплачено: {paidAmount.toLocaleString()}₸
            </div>
            {pendingAmount > 0 && (
              <div className="text-xs text-curai-warning">
                К доплате: {pendingAmount.toLocaleString()}₸
              </div>
            )}
          </>
        )}
        {/* ✅ НОВОЕ: Показываем депозит и остаток */}
        {depositAmount > 0 && (
          <div className="text-xs text-curai-blue font-medium">
            💰 Депозит: {depositAmount.toLocaleString()}₸
          </div>
        )}
        {depositBalance > 0 && (
          <div className="text-xs text-curai-positive font-medium">
            💵 Остаток: {depositBalance.toLocaleString()}₸
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-curai-selected border border-curai-control rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-curai-blue">
          📋 Планы лечения
        </h4>
        <span className="text-xs bg-curai-selected text-curai-blue px-2 py-1 rounded">
          {treatmentPlansCount} {treatmentPlansCount === 1 ? 'план' : 'планов'}
        </span>
      </div>

      {totalAmount > 0 ? (
        <div className="space-y-2">
          {/* Progress Bar */}
          <div className="w-full bg-curai-border rounded-full h-2">
            <div 
              className="bg-curai-positive h-2 rounded-full transition-all duration-300"
              style={{ width: `${paidPercentage}%` }}
            ></div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-curai-muted">Общая сумма:</div>
              <div className="font-medium text-curai-ink">
                {totalAmount.toLocaleString()}₸
              </div>
            </div>
            <div>
              <div className="text-curai-muted">Оплачено ({paidPercentage}%):</div>
              <div className="font-medium text-curai-positive">
                {totalPaidWithDeposit.toLocaleString()}₸
              </div>
            </div>
          </div>

          {/* Депозит (если есть) */}
          {depositAmount > 0 && (
            <div className="pt-1 border-t border-curai-control">
              <div className="flex justify-between items-center">
                <span className="text-xs text-curai-muted">💰 Из них депозит:</span>
                <span className="text-sm font-medium text-curai-blue">
                  {depositAmount.toLocaleString()}₸
                </span>
              </div>
            </div>
          )}

          {/* ✅ НОВОЕ: Остаток депозита (если есть) */}
          {depositBalance > 0 && (
            <div className="pt-1 border-t border-curai-control">
              <div className="flex justify-between items-center">
                <span className="text-xs text-curai-muted">💵 Остаток депозита:</span>
                <span className="text-sm font-medium text-curai-positive">
                  {depositBalance.toLocaleString()}₸
                </span>
              </div>
            </div>
          )}

          {pendingAmount > 0 && (
            <div className="pt-1 border-t border-curai-control">
              <div className="flex justify-between items-center">
                <span className="text-xs text-curai-muted">К доплате:</span>
                <span className="text-sm font-medium text-curai-warning">
                  {pendingAmount.toLocaleString()}₸
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-curai-muted">
          Финансовая информация недоступна
        </div>
      )}

      {treatmentData.lastUpdate && (
        <div className="text-xs text-curai-muted pt-1 border-t border-curai-control">
          Обновлено: {new Date(treatmentData.lastUpdate).toLocaleString('ru-RU')}
        </div>
      )}
    </div>
  );
};

export default TreatmentPlanInfo;
