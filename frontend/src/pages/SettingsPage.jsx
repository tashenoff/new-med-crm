import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const SettingsPage = ({ user }) => {
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Загрузка списка доступных коллекций
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/settings/available-collections`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCollections(response.data.collections);
      } catch (err) {
        console.error('Ошибка загрузки коллекций:', err);
        setError('Не удалось загрузить список коллекций');
      } finally {
        setLoadingCollections(false);
      }
    };

    fetchCollections();
  }, []);

  const handleCollectionToggle = (key) => {
    setSelectedCollections(prev => 
      prev.includes(key) 
        ? prev.filter(c => c !== key)
        : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    if (selectedCollections.length === collections.length) {
      setSelectedCollections([]);
    } else {
      setSelectedCollections(collections.map(c => c.key));
    }
  };

  const handleResetData = async () => {
    if (selectedCollections.length === 0) {
      setError('Выберите хотя бы одну коллекцию для очистки');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/settings/reset-data`,
        {
          collections: selectedCollections,
          confirm: true
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setResult(response.data);
      setSelectedCollections([]);
      setShowConfirmModal(false);
    } catch (err) {
      console.error('Ошибка сброса данных:', err);
      setError(err.response?.data?.detail || 'Ошибка при сбросе данных');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAll = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(
        `${API_URL}/api/settings/reset-all?confirm=true`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setResult(response.data);
      setShowConfirmModal(false);
    } catch (err) {
      console.error('Ошибка полного сброса:', err);
      setError(err.response?.data?.detail || 'Ошибка при полном сбросе данных');
    } finally {
      setLoading(false);
    }
  };

  // Проверка прав доступа
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          У вас нет прав для доступа к настройкам
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white/20 backdrop-blur-lg rounded-xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Настройки системы
        </h1>

        {/* Секция сброса данных */}
        <div className="bg-white/10 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Сброс данных
          </h2>
          
          <p className="text-white/70 mb-4">
            Выберите коллекции данных, которые хотите очистить. Это действие необратимо!
          </p>

          {/* Уведомления */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-green-500/20 border border-green-500 text-green-200 px-4 py-3 rounded mb-4">
              <p className="font-semibold">{result.message}</p>
              <div className="mt-2 text-sm">
                {Object.entries(result.deleted_counts).map(([key, count]) => (
                  <div key={key}>
                    {key}: удалено {count} записей
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Список коллекций */}
          {loadingCollections ? (
            <div className="text-white/70">Загрузка списка коллекций...</div>
          ) : (
            <>
              <div className="mb-4">
                <button
                  onClick={handleSelectAll}
                  className="text-blue-300 hover:text-blue-200 text-sm underline"
                >
                  {selectedCollections.length === collections.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {collections.map(collection => (
                  <label
                    key={collection.key}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedCollections.includes(collection.key)
                        ? 'bg-red-500/30 border-2 border-red-500'
                        : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCollections.includes(collection.key)}
                      onChange={() => handleCollectionToggle(collection.key)}
                      className="w-5 h-5 rounded border-gray-300 text-red-500 focus:ring-red-500"
                    />
                    <span className="text-white">{collection.label}</span>
                  </label>
                ))}
              </div>

              {/* Кнопки действий */}
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={selectedCollections.length === 0 || loading}
                  className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                    selectedCollections.length === 0 || loading
                      ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Очистить выбранные ({selectedCollections.length})
                </button>

                {user.role === 'super_admin' && (
                  <button
                    onClick={() => {
                      setSelectedCollections(collections.map(c => c.key));
                      setShowConfirmModal(true);
                    }}
                    disabled={loading}
                    className="px-6 py-3 bg-red-800 hover:bg-red-900 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Сбросить ВСЕ данные
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Информационный блок */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-yellow-200 text-sm">
              <p className="font-semibold mb-1">Важная информация</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Операция сброса данных необратима</li>
                <li>Пользователи, врачи и базовые справочники не будут удалены</li>
                <li>Все операции записываются в журнал аудита</li>
                <li>Рекомендуется создать резервную копию перед сбросом</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно подтверждения */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Подтверждение</h3>
            </div>
            
            <p className="text-gray-300 mb-4">
              Вы уверены, что хотите удалить данные из следующих коллекций?
            </p>
            
            <div className="bg-gray-700/50 rounded-lg p-3 mb-6 max-h-40 overflow-y-auto">
              {selectedCollections.map(key => {
                const collection = collections.find(c => c.key === key);
                return (
                  <div key={key} className="text-gray-300 text-sm py-1">
                    • {collection?.label || key}
                  </div>
                );
              })}
            </div>
            
            <p className="text-red-400 text-sm mb-6">
              ⚠️ Это действие необратимо!
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleResetData}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Удаление...
                  </>
                ) : (
                  'Подтвердить удаление'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
