import React, { useState, useEffect } from 'react';
import { usePatients } from '../hooks/usePatients';
import PanelHeader from '../components/common/PanelHeader';
import { API_BASE_URL } from '../api/config';

const BroadcastPage = ({ user }) => {
  const [activeTab, setActiveTab] = useState('broadcast'); // 'broadcast' or 'rules'
  const patientsHook = usePatients();
  const [selectedPatients, setSelectedPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('custom');
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Rules state
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);

  // Загрузка пациентов при монтировании
  useEffect(() => {
    patientsHook.fetchPatients();
    if (activeTab === 'rules') {
      loadRules();
    }
  }, [activeTab]);

  // Загрузка правил
  const loadRules = async () => {
    setLoadingRules(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/notification-rules`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRules(data);
      }
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setLoadingRules(false);
    }
  };

  // Переключение статуса правила
  const toggleRuleStatus = async (ruleId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/notification-rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        loadRules();
        setSuccessMessage('Статус правила изменен');
      }
    } catch (error) {
      setErrorMessage('Ошибка изменения статуса');
    }
  };

  // Создать новое правило
  const createDefaultRule = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/notification-rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: true,
          recipient: 'patient',
          trigger: 'appointment_created',
          method: 'wazzup',
          message_template: '%name%, Ваша запись:\nДата: %date%\nВрач: %doctor%\n\nhttps://2gis.kz/astana/geo/70000001055140151\n\nДоговор публичной оферты - https://clk.li/google\n@ayala.clinic\nhttps://instagram.com/ayala.clinic?igshid=YmMyMTA2M2Y=\n\nРады помогать Вам улучшать здоровье 🙏'
        })
      });
      
      if (response.ok) {
        loadRules();
        setSuccessMessage('Правило создано успешно');
      }
    } catch (error) {
      setErrorMessage('Ошибка создания правила');
    }
  };

  // Шаблоны сообщений
  const messageTemplates = {
    'callback': {
      label: 'Обратная связь',
      text: 'Здравствуйте, %name%! Мы хотели бы получить вашу обратную связь о качестве обслуживания в нашей клинике.'
    },
    'review': {
      label: 'Отзыв о визите',
      text: 'Здравствуйте, %name%! Благодарим вас за визит к врачу %doctor%. Будем рады, если вы оставите отзыв о приеме.'
    },
    'confirmation': {
      label: 'Подтверждение записи',
      text: 'Здравствуйте, %name%! Напоминаем о вашей записи на %time% к врачу %doctor% в %cabinet%.'
    },
    'birthday': {
      label: 'Поздравление с днем рождения',
      text: 'Здравствуйте, %name%! Поздравляем вас с днем рождения! Желаем крепкого здоровья и благополучия!'
    },
    'appointment_info': {
      label: 'рассылка информации о записи',
      text: 'Здравствуйте. На связи WhatsApp помощник Медицинский Центр «Ayala» 📲\n\n%name% будет заменено на имя клиента, а текст в квадратных скобках [] будет опущен если нет имени клиента.\n\n%doctor% будет заменено на имя врача.\n%time% будет заменено на время записи.\n%date% будет заменено на дату записи.\n%uslugi_kk% будет заменено на услуги на казахском языке.\n%uslugi% будет заменено на услуги.\n%bonusAll% неисчисляемые бонусы\n%bonusTotal% будет заменено на бонусы всего пациента.\n%cabinet% будет заменено на название кабинета (если есть).\n%paidSumm% будет заменено на сумму услуг по записи\n%zhaloba% будет заменено на причину обращения ( жалоба ).\n%zametki% будет заменено на заметки к записи'
    },
    'custom': {
      label: 'Пользовательское сообщение',
      text: ''
    }
  };

  // Фильтрация пациентов
  const filteredPatients = patientsHook.patients.filter(patient =>
    patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm)
  );

  // Выбор всех пациентов
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedPatients(filteredPatients.map(p => p.id));
    } else {
      setSelectedPatients([]);
    }
  };

  // Выбор одного пациента
  const handleSelectPatient = (patientId) => {
    setSelectedPatients(prev => {
      if (prev.includes(patientId)) {
        return prev.filter(id => id !== patientId);
      } else {
        return [...prev, patientId];
      }
    });
  };

  // Изменение шаблона сообщения
  const handleTemplateChange = (templateKey) => {
    setMessageTemplate(templateKey);
    setMessageText(messageTemplates[templateKey].text);
  };

  // Замена макросов в сообщении
  const replaceMacros = (text, patient) => {
    return text
      .replace(/%name%/g, patient.full_name || '')
      .replace(/%doctor%/g, patient.doctor_name || '%doctor%')
      .replace(/%time%/g, patient.appointment_time || '%time%')
      .replace(/%date%/g, patient.appointment_date || '%date%')
      .replace(/%cabinet%/g, patient.cabinet || '%cabinet%')
      .replace(/%bonusTotal%/g, patient.bonus_total || '0')
      .replace(/%paidSumm%/g, patient.paid_summ || '0')
      .replace(/%zhaloba%/g, patient.complaint || '')
      .replace(/%zametki%/g, patient.notes || '');
  };

  // Отправка сообщений
  const handleSendMessages = async () => {
    if (selectedPatients.length === 0) {
      setErrorMessage('Выберите хотя бы одного пациента');
      return;
    }

    if (!messageText.trim()) {
      setErrorMessage('Введите текст сообщения');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const token = localStorage.getItem('token');
    
    let successCount = 0;
    let errorCount = 0;

    for (const patientId of selectedPatients) {
      const patient = patientsHook.patients.find(p => p.id === patientId);
      if (!patient) continue;

      const personalizedMessage = replaceMacros(messageText, patient);

      try {
        const response = await fetch(`${API_BASE_URL}/wazzup/messages/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: patient.phone,
            text: personalizedMessage
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to send message to ${patient.full_name}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`Error sending message to ${patient.full_name}:`, error);
      }
    }

    setLoading(false);
    
    if (successCount > 0) {
      setSuccessMessage(`✅ Успешно отправлено сообщений: ${successCount}`);
    }
    
    if (errorCount > 0) {
      setErrorMessage(`❌ Ошибок при отправке: ${errorCount}`);
    }

    // Очистка выбора после отправки
    setSelectedPatients([]);
  };

  const getTriggerLabel = (trigger) => {
    const labels = {
      'appointment_created': 'Создание записи',
      'appointment_reminder': 'Напоминание о записи',
      'appointment_cancelled': 'Отмена записи'
    };
    return labels[trigger] || trigger;
  };

  const getRecipientLabel = (recipient) => {
    const labels = {
      'patient': 'Пациент',
      'doctor': 'Врач'
    };
    return labels[recipient] || recipient;
  };

  const getMethodLabel = (method) => {
    const labels = {
      'wazzup': 'Wazzup: 77778069558'
    };
    return labels[method] || method;
  };

  return (
    <div className="space-y-6">
      <div className="calendar-container calendar-view-panel rounded-2xl">
        <PanelHeader
          title="Рассылка WhatsApp"
          subtitle="Массовая отправка сообщений пациентам через WhatsApp"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Вкладки */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-4 px-6 pt-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('broadcast')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'broadcast'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                📤 Рассылка
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'rules'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                ⚙️ Уведомления
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Сообщения об ошибках и успехе */}
            {errorMessage && (
              <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {errorMessage}
                <button onClick={() => setErrorMessage(null)} className="float-right font-bold">×</button>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                {successMessage}
                <button onClick={() => setSuccessMessage(null)} className="float-right font-bold">×</button>
              </div>
            )}

            {/* Контент вкладки "Рассылка" */}
            {activeTab === 'broadcast' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Левая колонка - Форма сообщения */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Отправить сообщение</h3>

                  {/* Выбор шаблона */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Выберите сообщение
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(messageTemplates).map(([key, template]) => (
                        <button
                          key={key}
                          onClick={() => handleTemplateChange(key)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            messageTemplate === key
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Текст сообщения */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Текст сообщения
                    </label>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={15}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Введите текст сообщения..."
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Доступные макросы: %name%, %doctor%, %time%, %date%, %cabinet%, %bonusTotal%, %paidSumm%, %zhaloba%, %zametki%
                    </p>
                  </div>

                  {/* Кнопка отправки */}
                  <button
                    onClick={handleSendMessages}
                    disabled={loading || selectedPatients.length === 0}
                    className={`w-full py-3 rounded-lg font-medium transition-colors ${
                      loading || selectedPatients.length === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {loading ? 'Отправка...' : `Отправить (${selectedPatients.length})`}
                  </button>
                </div>

                {/* Правая колонка - Список пациентов */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Выберите получателей ({selectedPatients.length} выбрано)
                  </h3>

                  {/* Поиск */}
                  <input
                    type="text"
                    placeholder="Поиск по имени или телефону..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />

                  {/* Выбрать всех */}
                  <div className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={selectedPatients.length === filteredPatients.length && filteredPatients.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Выбрать всех ({filteredPatients.length})
                    </label>
                  </div>

                  {/* Список пациентов */}
                  <div className="max-h-[600px] overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    {filteredPatients.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">Пациенты не найдены</p>
                    ) : (
                      filteredPatients.map(patient => (
                        <div
                          key={patient.id}
                          className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedPatients.includes(patient.id)
                              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300'
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                          onClick={() => handleSelectPatient(patient.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPatients.includes(patient.id)}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {patient.full_name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {patient.phone}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Контент вкладки "Уведомления" */}
            {activeTab === 'rules' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Правила уведомлений</h3>
                  <button
                    onClick={createDefaultRule}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    + Добавить уведомление
                  </button>
                </div>

                {loadingRules ? (
                  <div className="text-center py-8">
                    <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="mt-2 text-gray-600">Загрузка...</p>
                  </div>
                ) : rules.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-gray-500 mb-4">Нет настроенных правил уведомлений</p>
                    <button
                      onClick={createDefaultRule}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Создать первое правило
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-pink-100 dark:bg-pink-900/20">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            #
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Статус
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Кого уведомляем
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Тип уведомления
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Метод уведомления
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Сообщение
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Врачи
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Услуги
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {rules.map((rule, index) => (
                          <tr key={rule.id || rule._id}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {index + 1}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={rule.status}
                                  onChange={() => toggleRuleStatus(rule.id || rule._id)}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                              </label>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {getRecipientLabel(rule.recipient)}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900 dark:text-white">
                              <div>{getTriggerLabel(rule.trigger)}</div>
                              <div className="text-xs text-gray-500">Без ограничения по времени</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {getMethodLabel(rule.method)}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900 dark:text-white max-w-md">
                              <div className="whitespace-pre-wrap text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded">
                                {rule.message_template}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {rule.doctors ? rule.doctors.join(', ') : 'Все врачи'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {rule.services ? rule.services.join(', ') : 'Все услуги'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BroadcastPage;
