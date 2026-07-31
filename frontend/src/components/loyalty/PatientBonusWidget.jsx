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
        return 'text-green-600';
      case 'spent':
        return 'text-blue-600';
      case 'refund':
        return 'text-orange-600';
      default:
        return 'text-gray-600';
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
      <div className="bg-white rounded-lg shadow p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!bonusInfo) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow-lg p-6">
      {/* Заголовок и баланс */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">🎁 Бонусная программа</h3>
        {!bonusInfo.can_use_bonus && (
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
            Неактивна
          </span>
        )}
      </div>

      {/* Текущий баланс */}
      <div className="bg-white rounded-lg p-4 mb-4">
        <div className="text-sm text-gray-600 mb-1">Доступно бонусов</div>
        <div className="text-3xl font-bold text-purple-600">
          {bonusInfo.bonus_balance.toFixed(0)} ₸
        </div>
        {bonusInfo.can_use_bonus && (
          <div className="text-xs text-gray-500 mt-1">
            Можно оплатить до {bonusInfo.max_usage_percent}% от услуги
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-xs text-green-700 mb-1">Всего заработано</div>
          <div className="text-lg font-semibold text-green-600">
            {bonusInfo.total_earned.toFixed(0)} ₸
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-xs text-blue-700 mb-1">Всего потрачено</div>
          <div className="text-lg font-semibold text-blue-600">
            {bonusInfo.total_spent.toFixed(0)} ₸
          </div>
        </div>
      </div>

      {/* Информация о начислении */}
      {bonusInfo.can_use_bonus && (
        <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm text-blue-800">
          <div className="font-medium mb-1">💡 Как получить бонусы:</div>
          <div>При оплате услуг начисляется {bonusInfo.earning_rate}% бонусами</div>
        </div>
      )}

      {/* Кнопка истории */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center justify-center gap-2 py-2"
      >
        {showHistory ? '▼ Скрыть историю' : '▶ Показать историю операций'}
      </button>

      {/* История операций */}
      {showHistory && (
        <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
          <div className="text-sm font-medium text-gray-700 mb-2">История операций:</div>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-4">
              Нет операций
            </div>
          ) : (
            history.map((transaction) => (
              <div
                key={transaction.id}
                className="bg-white rounded-lg p-3 text-sm border border-gray-100"
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
                  <div className="text-xs text-gray-500">
                    {formatDate(transaction.created_at)}
                  </div>
                </div>
                <div className="text-xs text-gray-600 ml-7">
                  {transaction.description}
                </div>
                <div className="text-xs text-gray-400 ml-7 mt-1">
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
