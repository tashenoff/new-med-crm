import React, { useState } from 'react';

const TelephonySection = () => {
  const [activeTab, setActiveTab] = useState('calls');

  const calls = [];
  const stats = {
    totalCalls: 0,
    missedCalls: 0,
    averageDuration: '0:00',
    conversionRate: '0%'
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            📞 API Телефонии
          </h2>
          <p className="text-gray-600 mt-1">Интеграция с телефонией для отслеживания звонков</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
          <span>⚙️</span>
          Настройки API
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Всего звонков</p>
              <p className="text-3xl font-bold mt-1">{stats.totalCalls}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">📞</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Пропущенные</p>
              <p className="text-3xl font-bold mt-1">{stats.missedCalls}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">📵</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Средняя длительность</p>
              <p className="text-3xl font-bold mt-1">{stats.averageDuration}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">⏱️</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Конверсия</p>
              <p className="text-3xl font-bold mt-1">{stats.conversionRate}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">📈</span>
            </div>
          </div>
        </div>
      </div>

      {/* Табы */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex gap-4 px-6">
            <button
              onClick={() => setActiveTab('calls')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'calls'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📞 История звонков
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              ⚙️ Настройки интеграции
            </button>
            <button
              onClick={() => setActiveTab('widgets')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'widgets'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🎨 Виджеты
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* История звонков */}
          {activeTab === 'calls' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <input
                  type="text"
                  placeholder="Поиск по номеру или имени..."
                  className="w-64 border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <select className="border border-gray-300 rounded-md px-3 py-2 text-sm">
                    <option>Все типы звонков</option>
                    <option>Входящие</option>
                    <option>Исходящие</option>
                    <option>Пропущенные</option>
                  </select>
                  <button className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700">
                    Экспорт в Excel
                  </button>
                </div>
              </div>

              {/* Список звонков */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Время
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Номер телефона
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Клиент
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Тип
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Статус
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Длительность
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                          <div className="flex flex-col items-center">
                            <span className="text-4xl mb-2">📞</span>
                            <p>Нет данных о звонках</p>
                            <p className="text-sm text-gray-400 mt-1">Звонки будут отображаться после подключения API телефонии</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      calls.map((call) => (
                        <tr key={call.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {call.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{call.phone}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{call.clientName}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              call.type === 'incoming' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {call.type === 'incoming' ? '📥 Входящий' : '📤 Исходящий'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              call.status === 'completed' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {call.status === 'completed' ? '✅ Завершен' : '❌ Пропущен'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {call.duration}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                            <button className="text-blue-600 hover:text-blue-900" title="Прослушать запись">
                              🎧
                            </button>
                            <button className="text-green-600 hover:text-green-900" title="Перезвонить">
                              📞
                            </button>
                            <button className="text-purple-600 hover:text-purple-900" title="Создать задачу">
                              ✏️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Настройки интеграции */}
          {activeTab === 'settings' && (
            <div className="space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Основные настройки</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Провайдер телефонии
                    </label>
                    <select className="w-full border border-gray-300 rounded-md px-3 py-2">
                      <option>Не выбран</option>
                      <option>Asterisk</option>
                      <option>FreePBX</option>
                      <option>3CX</option>
                      <option>Mango Office</option>
                      <option>Zadarma</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      API URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://api.telephony.example.com"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      API Key
                    </label>
                    <input
                      type="password"
                      placeholder="Введите API ключ"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Дополнительные настройки</h3>
                  
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" defaultChecked />
                      <span className="text-sm text-gray-700">Автоматическая запись звонков</span>
                    </label>
                    
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" defaultChecked />
                      <span className="text-sm text-gray-700">Всплывающие уведомления о звонках</span>
                    </label>
                    
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm text-gray-700">Автоматическое создание контактов</span>
                    </label>
                    
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" defaultChecked />
                      <span className="text-sm text-gray-700">Синхронизация с CRM</span>
                    </label>
                  </div>

                  <div className="mt-6">
                    <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                      Сохранить настройки
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Виджеты */}
          {activeTab === 'widgets' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Виджет набора номера */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span>📱</span>
                    Виджет набора номера
                  </h3>
                  <div className="bg-white rounded-lg p-4">
                    <input
                      type="tel"
                      placeholder="+7 (___) ___-__-__"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-center text-lg mb-3"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((num) => (
                        <button
                          key={num}
                          className="bg-gray-100 hover:bg-gray-200 rounded-lg py-3 font-semibold text-lg"
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    <button className="w-full bg-green-600 text-white py-3 rounded-lg mt-3 font-semibold hover:bg-green-700">
                      📞 Позвонить
                    </button>
                  </div>
                </div>

                {/* Виджет активных звонков */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span>🔊</span>
                    Активные звонки
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                      <span className="text-3xl">📵</span>
                      <p className="text-sm mt-2">Нет активных звонков</p>
                    </div>
                  </div>
                </div>

                {/* Виджет быстрых контактов */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span>⚡</span>
                    Быстрые контакты
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                    <span className="text-3xl">👥</span>
                    <p className="text-sm mt-2">Нет быстрых контактов</p>
                  </div>
                </div>

                {/* Виджет статистики оператора */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span>📊</span>
                    Моя статистика (сегодня)
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-white rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Обработано звонков</span>
                        <span className="font-bold text-lg text-gray-900">0</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Среднее время</span>
                        <span className="font-bold text-lg text-gray-900">0:00</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Пропущено</span>
                        <span className="font-bold text-lg text-gray-900">0</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelephonySection;
