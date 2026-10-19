import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../api/config';

const DoctorCashbackWidget = ({ doctorId }) => {
  const [cashbackInfo, setCashbackInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (doctorId) {
      loadCashbackInfo();
    }
  }, [doctorId]);

  const loadCashbackInfo = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/loyalty/cashback/doctor/${doctorId}?include_transactions=true&limit=10`,
        {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCashbackInfo(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки кэшбэка:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-curai-surface rounded-md shadow-none p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-curai-border rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-curai-border rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!cashbackInfo) {
    return null;
  }

  return (
    <div className="bg-curai-positiveBg rounded-md shadow-none p-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-curai-ink">💵 Кэшбэк за направления</h3>
      </div>

      {/* Текущий баланс */}
      <div className="bg-curai-surface rounded-md p-4 mb-4">
        <div className="text-sm text-curai-muted mb-1">Накоплено кэшбэка</div>
        <div className="text-2xl font-semibold text-curai-positive">
          {cashbackInfo.cashback_balance.toFixed(0)} ₸
        </div>
        <div className="text-xs text-curai-muted mt-1">
          Всего заработано: {cashbackInfo.total_earned.toFixed(0)} ₸
        </div>
      </div>

      {/* Информация */}
      <div className="bg-curai-positiveBg rounded-md p-3 mb-4 text-sm text-curai-positive">
        <div className="font-medium mb-1">💡 Как получить кэшбэк:</div>
        <div>Направляйте пациентов на анализы — получайте процент после их оплаты</div>
      </div>

      {/* Кнопка истории */}
      {cashbackInfo.recent_transactions && cashbackInfo.recent_transactions.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full text-sm text-curai-positive hover:text-curai-positive font-medium flex items-center justify-center gap-2 py-2"
          >
            {showHistory ? '▼ Скрыть историю' : '▶ Показать последние начисления'}
          </button>

          {/* История начислений */}
          {showHistory && (
            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
              <div className="text-sm font-medium text-curai-ink mb-2">
                Последние начисления:
              </div>
              {cashbackInfo.recent_transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="bg-curai-surface rounded-md p-3 text-sm border border-curai-border"
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">💰</span>
                      <span className="font-medium text-curai-positive">
                        +{transaction.amount.toFixed(0)} ₸
                      </span>
                    </div>
                    <div className="text-xs text-curai-muted">
                      {formatDate(transaction.created_at)}
                    </div>
                  </div>
                  
                  {/* Информация об услуге */}
                  <div className="text-xs text-curai-muted ml-7">
                    {transaction.service_name}
                  </div>
                  
                  {/* Информация о пациенте */}
                  {transaction.patient_name && (
                    <div className="text-xs text-curai-muted ml-7">
                      Пациент: {transaction.patient_name}
                    </div>
                  )}
                  
                  {/* Описание */}
                  <div className="text-xs text-curai-muted ml-7 mt-1">
                    {transaction.description}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Если нет начислений */}
      {(!cashbackInfo.recent_transactions || cashbackInfo.recent_transactions.length === 0) && (
        <div className="text-sm text-curai-muted text-center py-4 bg-curai-surface rounded-md">
          Пока нет начислений кэшбэка
        </div>
      )}
    </div>
  );
};

export default DoctorCashbackWidget;
