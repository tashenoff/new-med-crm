import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../api/config';

const LoyaltySettings = () => {
  const [settings, setSettings] = useState({
    earning_rate: 5.0,
    max_usage_percent: 30.0,
    is_active: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/loyalty/settings`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/loyalty/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setMessage('Настройки успешно сохранены');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error('Ошибка сохранения');
      }
    } catch (error) {
      setMessage('Ошибка при сохранении настроек');
      console.error('Ошибка сохранения настроек:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4">Загрузка...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-6">Настройки программы лояльности</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Процент начисления бонусов */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <label className="block text-sm font-medium text-curai-ink mb-2">
            Процент начисления бонусов
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={settings.earning_rate}
              onChange={(e) => setSettings({...settings, earning_rate: parseFloat(e.target.value)})}
              className="border border-curai-control rounded-md px-4 py-2 w-32"
            />
            <span className="text-curai-muted">%</span>
          </div>
          <p className="text-sm text-curai-muted mt-2">
            Процент от суммы оплаты, который начисляется пациенту в виде бонусов
          </p>
        </div>

        {/* Максимум использования бонусов */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <label className="block text-sm font-medium text-curai-ink mb-2">
            Максимум использования бонусов при оплате
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={settings.max_usage_percent}
              onChange={(e) => setSettings({...settings, max_usage_percent: parseFloat(e.target.value)})}
              className="border border-curai-control rounded-md px-4 py-2 w-32"
            />
            <span className="text-curai-muted">%</span>
          </div>
          <p className="text-sm text-curai-muted mt-2">
            Максимальный процент от суммы услуги, который можно оплатить бонусами
          </p>
        </div>

        {/* Активность программы */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.is_active}
              onChange={(e) => setSettings({...settings, is_active: e.target.checked})}
              className="w-5 h-5 text-curai-blue rounded focus:ring-curai-focus"
            />
            <span className="ml-3 text-sm font-medium text-curai-ink">
              Программа лояльности активна
            </span>
          </label>
          <p className="text-sm text-curai-muted mt-2">
            Когда программа неактивна, бонусы не начисляются и не могут быть использованы
          </p>
        </div>

        {/* Сообщение */}
        {message && (
          <div className={`rounded-md p-4 ${message.includes('успешно') ? "bg-curai-positiveBg text-curai-positive" : "bg-curai-negativeBg text-curai-negative"}`}>
            {message}
          </div>
        )}

        {/* Кнопка сохранения */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-curai-blue text-white py-3 rounded-md hover:bg-curai-blue disabled:bg-curai-disabled disabled:cursor-not-allowed font-medium transition-colors"
        >
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </form>

      {/* Информационный блок */}
      <div className="mt-8 bg-curai-selected rounded-md p-4">
        <h3 className="font-semibold text-curai-blue mb-2">ℹ️ Как работает программа лояльности</h3>
        <ul className="text-sm text-curai-blue space-y-1">
          <li>• Бонусы начисляются автоматически после оплаты услуг</li>
          <li>• Бонусы не сгорают и не имеют срока действия</li>
          <li>• При отмене приема бонусы возвращаются</li>
          <li>• Пациент может использовать бонусы для оплаты последующих услуг</li>
        </ul>
      </div>
    </div>
  );
};

export default LoyaltySettings;
