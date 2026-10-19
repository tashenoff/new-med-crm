import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../api/config';

const PatientBonusWidget = ({ patientId }) => {
  const [bonusInfo, setBonusInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (patientId) {
      loadBonusInfo();
    }
  }, [patientId]);

  const loadBonusInfo = async () => {
    try {
      const [infoRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/loyalty/bonus/patient/${patientId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`${API_BASE_URL}/loyalty/bonus/patient/${patientId}/history?limit=10`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      if (infoRes.ok) {
        const data = await infoRes.json();
        setBonusInfo(data);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData);
      }
    } catch (error) {
      console.error('Ошибка загрузки бонусной информации:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'earned':
        return '💰';
      case 'spent':
        return '💳';
      case 'refund':
        return '↩️';
      default:
        return '•';
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'earned':
        return "text-curai-positive";
      case 'spent':
        return "text-curai-blue";
      case 'refund':
        return "text-curai-warning";
      default:
        return "text-curai-muted";
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

  if (!bonusInfo) {
    return null;
  }

  return (
    <div className="bg-curai-selected rounded-md shadow-none p-6">
      {/* Заголовок и баланс */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-curai-ink">🎁 Бонусная программа</h3>
        {!bonusInfo.can_use_bonus && (
          <span className="text-xs bg-curai-border text-curai-muted px-2 py-1 rounded">
            Неактивна
          </span>
        )}
      </div>

      {/* Текущий баланс */}
      <div className="bg-curai-surface rounded-md p-4 mb-4">
        <div className="text-sm text-curai-muted mb-1">Доступно бонусов</div>
        <div className="text-2xl font-semibold text-curai-blue">
          {bonusInfo.bonus_balance.toFixed(0)} ₸
        </div>
        {bonusInfo.can_use_bonus && (
          <div className="text-xs text-curai-muted mt-1">
            Можно оплатить до {bonusInfo.max_usage_percent}% от услуги
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-curai-positiveBg rounded-md p-3">
          <div className="text-xs text-curai-positive mb-1">Всего заработано</div>
          <div className="text-lg font-semibold text-curai-positive">
            {bonusInfo.total_earned.toFixed(0)} ₸
          </div>
        </div>
        <div className="bg-curai-selected rounded-md p-3">
          <div className="text-xs text-curai-blue mb-1">Всего потрачено</div>
          <div className="text-lg font-semibold text-curai-blue">
            {bonusInfo.total_spent.toFixed(0)} ₸
          </div>
        </div>
      </div>

      {/* Информация о начислении */}
      {bonusInfo.can_use_bonus && (
        <div className="bg-curai-selected rounded-md p-3 mb-4 text-sm text-curai-blue">
          <div className="font-medium mb-1">💡 Как получить бонусы:</div>
          <div>При оплате услуг начисляется {bonusInfo.earning_rate}% бонусами</div>
        </div>
      )}

      {/* Кнопка истории */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full text-sm text-curai-blue hover:text-curai-blue font-medium flex items-center justify-center gap-2 py-2"
      >
        {showHistory ? '▼ Скрыть историю' : '▶ Показать историю операций'}
      </button>

      {/* История операций */}
      {showHistory && (
        <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
          <div className="text-sm font-medium text-curai-ink mb-2">История операций:</div>
          {history.length === 0 ? (
            <div className="text-sm text-curai-muted text-center py-4">
              Нет операций
            </div>
          ) : (
            history.map((transaction) => (
              <div
                key={transaction.id}
                className="bg-curai-surface rounded-md p-3 text-sm border border-curai-border"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {getTransactionIcon(transaction.transaction_type)}
                    </span>
                    <span className={`font-medium ${getTransactionColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type === 'earned' && '+'}
                      {transaction.transaction_type === 'spent' && '-'}
                      {transaction.transaction_type === 'refund' && '+'}
                      {transaction.amount.toFixed(0)} ₸
                    </span>
                  </div>
                  <div className="text-xs text-curai-muted">
                    {formatDate(transaction.created_at)}
                  </div>
                </div>
                <div className="text-xs text-curai-muted ml-7">
                  {transaction.description}
                </div>
                <div className="text-xs text-curai-muted ml-7 mt-1">
                  Баланс после: {transaction.balance_after.toFixed(0)} ₸
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default PatientBonusWidget;
