import { LoadingSpinner } from '../components/common/LoadingIndicator';
import { permissionProps } from '../utils/permissions.js';
import React, { useState, useEffect } from 'react';
import { usePatients } from '../hooks/usePatients';
import PanelHeader from '../components/common/PanelHeader';
import { API_BASE_URL } from '../api/config';
import FeedbackView from '../components/feedback/FeedbackView';

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
  const [editingRule, setEditingRule] = useState(null); // rule being edited
  const [editTemplate, setEditTemplate] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRule, setNewRule] = useState({
    recipient: 'patient',
    trigger: 'appointment_created',
    method: 'wazzup',
    message_template: ''
  });

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

  // Сохранение отредактированного шаблона правила
  const saveRuleTemplate = async () => {
    if (!editingRule) return;
    try {
      const token = localStorage.getItem('token');
      const ruleId = editingRule.id || editingRule._id;
      const response = await fetch(`${API_BASE_URL}/notification-rules/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message_template: editTemplate })
      });

      if (response.ok) {
        setEditingRule(null);
        loadRules();
        setSuccessMessage('Шаблон обновлен');
      } else {
        setErrorMessage('Ошибка сохранения шаблона');
      }
    } catch (error) {
      setErrorMessage('Ошибка сохранения шаблона');
    }
  };

  // Открыть модалку создания правила
  const openCreateRuleModal = () => {
    setNewRule({
      recipient: 'patient',
      trigger: 'appointment_created',
      method: 'wazzup',
      message_template: ''
    });
    setShowCreateModal(true);
  };
  
  // Создать новое правило
  const createRule = async () => {
    if (!newRule.message_template.trim()) {
      setErrorMessage('Введите текст сообщения');
      return;
    }
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
          recipient: newRule.recipient,
          trigger: newRule.trigger,
          method: newRule.method,
          message_template: newRule.message_template
        })
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        loadRules();
        setSuccessMessage('Правило создано успешно');
      } else {
        setErrorMessage('Ошибка создания правила');
      }
    } catch (error) {
      setErrorMessage('Ошибка создания правила');
    }
  };
  
  // Удалить правило уведомления
  const deleteRule = async (ruleId) => {
    if (!window.confirm('Удалить это правило уведомления?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/notification-rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        loadRules();
        setSuccessMessage('Правило удалено');
      } else {
        setErrorMessage('Ошибка удаления правила');
      }
    } catch (error) {
      setErrorMessage('Ошибка удаления правила');
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
      'appointment_cancelled': 'Отмена записи',
      'appointment_no_show': 'Неявка на приём',
      'appointment_rescheduled': 'Перенос записи',
      'appointment_completed': 'Завершение приёма (обратная связь)'
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
      'wazzup': 'Wazzup'
    };
    return labels[method] || method;
  };

  return (
    <div className="space-y-6">
      <div className="calendar-container calendar-view-panel rounded-md">
        <PanelHeader
          title="Рассылка WhatsApp"
          subtitle="Массовая отправка сообщений пациентам через WhatsApp"
        />

        <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border shadow-none">
          {/* Вкладки */}
          <div className="border-b border-curai-border ">
            <nav className="flex space-x-4 px-6 pt-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('broadcast')}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  activeTab === 'broadcast'
                    ? "bg-curai-selected text-curai-blue border-b-2 border-curai-control"
                    : "text-curai-muted hover:text-curai-ink "
                }`}
              >
                📤 Рассылка
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  activeTab === 'rules'
                    ? "bg-curai-selected text-curai-blue border-b-2 border-curai-control"
                    : "text-curai-muted hover:text-curai-ink "
                }`}
              >
                ⚙️ Уведомления
              </button>
              <button
                onClick={() => setActiveTab('feedback')}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  activeTab === 'feedback'
                    ? "bg-curai-selected text-curai-blue border-b-2 border-curai-control"
                    : "text-curai-muted hover:text-curai-ink "
                }`}
              >
                📊 Фидбек пациентов
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Сообщения об ошибках и успехе */}
            {errorMessage && (
              <div className="mb-4 bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded">
                {errorMessage}
                <button onClick={() => setErrorMessage(null)} className="float-right font-semibold">×</button>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 bg-curai-positiveBg border border-curai-positive text-curai-positive px-4 py-3 rounded">
                {successMessage}
                <button onClick={() => setSuccessMessage(null)} className="float-right font-semibold">×</button>
              </div>
            )}

            {/* Контент вкладки "Рассылка" */}
            {activeTab === 'broadcast' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Левая колонка - Форма сообщения */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-curai-ink ">Отправить сообщение</h3>

                  {/* Выбор шаблона */}
                  <div>
                    <label className="block text-sm font-medium text-curai-ink mb-2">
                      Выберите сообщение
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(messageTemplates).map(([key, template]) => (
                        <button
                          key={key}
                          onClick={() => handleTemplateChange(key)}
                          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            messageTemplate === key
                              ? "bg-curai-blue text-white"
                              : "bg-curai-subtle text-curai-ink hover:bg-curai-border "
                          }`}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Текст сообщения */}
                  <div>
                    <label className="block text-sm font-medium text-curai-ink mb-2">
                      Текст сообщения
                    </label>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={15}
                      className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus "
                      placeholder="Введите текст сообщения..."
                    />
                    <p className="mt-2 text-xs text-curai-muted ">
                      Доступные макросы: %name%, %doctor%, %time%, %date%, %cabinet%, %bonusTotal%, %paidSumm%, %zhaloba%, %zametki%
                    </p>
                  </div>

                  {/* Кнопка отправки */}
                  <button
                    onClick={handleSendMessages}
                    disabled={loading || selectedPatients.length === 0}
                    className={`w-full py-3 rounded-md font-medium transition-colors ${
                      loading || selectedPatients.length === 0
                        ? "bg-curai-control text-curai-muted cursor-not-allowed"
                        : "bg-curai-blue text-white hover:bg-curai-blue"
                    }`}
                   {...permissionProps(user, "broadcast_view", "broadcast_edit", "patients_view")}>
                    {loading ? 'Отправка...' : `Отправить (${selectedPatients.length})`}
                  </button>
                </div>

                {/* Правая колонка - Список пациентов */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-curai-ink ">
                    Выберите получателей ({selectedPatients.length} выбрано)
                  </h3>

                  {/* Поиск */}
                  <input
                    type="text"
                    placeholder="Поиск по имени или телефону..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus "
                  />

                  {/* Выбрать всех */}
                  <div className="flex items-center space-x-2 p-3 bg-curai-subtle rounded-md">
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={selectedPatients.length === filteredPatients.length && filteredPatients.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-curai-blue border-curai-control rounded focus:ring-curai-focus"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium text-curai-ink ">
                      Выбрать всех ({filteredPatients.length})
                    </label>
                  </div>

                  {/* Список пациентов */}
                  <div className="max-h-[600px] overflow-y-auto space-y-2 border border-curai-border rounded-md p-3">
                    {filteredPatients.length === 0 ? (
                      <p className="text-center text-curai-muted py-8">Пациенты не найдены</p>
                    ) : (
                      filteredPatients.map(patient => (
                        <div
                          key={patient.id}
                          className={`flex items-center space-x-3 p-3 rounded-md cursor-pointer transition-colors ${
                            selectedPatients.includes(patient.id)
                              ? "bg-curai-selected border border-curai-control"
                              : "bg-curai-surface border border-curai-border hover:bg-curai-subtle "
                          }`}
                          onClick={() => handleSelectPatient(patient.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPatients.includes(patient.id)}
                            onChange={() => {}}
                            className="w-4 h-4 text-curai-blue border-curai-control rounded focus:ring-curai-focus"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-curai-ink truncate">
                              {patient.full_name}
                            </p>
                            <p className="text-sm text-curai-muted ">
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
                  <h3 className="text-lg font-semibold text-curai-ink ">Правила уведомлений</h3>
                  <button
                    onClick={openCreateRuleModal}
                    className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue text-sm"
                   {...permissionProps(user, "system_settings")}>
                    + Добавить уведомление
                  </button>
                </div>

                {loadingRules ? (
                  <div className="text-center py-8">
                    <LoadingSpinner />
                    <p className="mt-2 text-curai-muted">Загрузка...</p>
                  </div>
                ) : rules.length === 0 ? (
                  <div className="text-center py-12 bg-curai-subtle rounded-md">
                    <p className="text-curai-muted mb-4">Нет настроенных правил уведомлений</p>
                    <button
                      onClick={openCreateRuleModal}
                      className="px-6 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue"
                     {...permissionProps(user, "system_settings")}>
                      Создать первое правило
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-curai-border ">
                      <thead className="bg-curai-negativeBg ">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            #
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Статус
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Кого уведомляем
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Тип уведомления
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Метод уведомления
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Сообщение
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Врачи
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Услуги
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-curai-ink uppercase tracking-wider">
                            Действия
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-curai-surface divide-y divide-curai-border ">
                        {rules.map((rule, index) => (
                          <tr key={rule.id || rule._id}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-curai-ink ">
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
                                <div className="w-11 h-6 bg-curai-border peer-focus:ring-4 peer-focus:ring-curai-focus rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-curai-surface after:border-curai-control after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-curai-positive"></div>
                              </label>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-curai-ink ">
                              {getRecipientLabel(rule.recipient)}
                            </td>
                            <td className="px-4 py-4 text-sm text-curai-ink ">
                              <div>{getTriggerLabel(rule.trigger)}</div>
                              <div className="text-xs text-curai-muted">Без ограничения по времени</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-curai-ink ">
                              {getMethodLabel(rule.method)}
                            </td>
                            <td className="px-4 py-4 text-sm text-curai-ink max-w-md">
                              <div className="whitespace-pre-wrap text-xs bg-curai-subtle p-2 rounded">
                                {rule.message_template}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-curai-ink ">
                              {rule.doctors ? rule.doctors.join(', ') : 'Все врачи'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-curai-ink ">
                              {rule.services ? rule.services.join(', ') : 'Все услуги'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-curai-ink ">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => { setEditingRule(rule); setEditTemplate(rule.message_template || ''); }}
                                  className="px-3 py-1.5 bg-curai-selected text-curai-blue rounded-md hover:bg-curai-selected text-sm font-medium"
                                >
                                  ✏️ Изменить
                                </button>
                                <button
                                  onClick={() => deleteRule(rule.id || rule._id)}
                                  className="px-3 py-1.5 bg-curai-negativeBg text-curai-negative rounded-md hover:bg-curai-negativeBg text-sm font-medium"
                                 {...permissionProps(user, "system_settings")}>
                                  🗑️ Удалить
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Контент вкладки "Фидбек пациентов" */}
            {activeTab === 'feedback' && (
              <FeedbackView />
            )}
          </div>
        </div>
      </div>

      {/* Модалка редактирования шаблона уведомления */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 curai-glass-modal-layer curai-modal-scrim-soft" onClick={(e) => { if (e.target === e.currentTarget) setEditingRule(null); }}>
          <div className="bg-curai-surface rounded-md shadow-none w-full max-w-2xl curai-glass-shell curai-custom-dialog">
            <div className="curai-glass-header curai-modal-glass-heading"><h3 className="text-lg font-semibold text-curai-ink">Редактировать шаблон уведомления</h3></div><div className="curai-glass-body curai-glass-body-padded">
            <p className="text-sm text-curai-muted mt-1">
              {getTriggerLabel(editingRule.trigger)} · {getRecipientLabel(editingRule.recipient)} · {getMethodLabel(editingRule.method)}
            </p>
            <textarea
              value={editTemplate}
              onChange={(e) => setEditTemplate(e.target.value)}
              rows={12}
              className="w-full mt-3 px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus whitespace-pre-wrap"
            />
            <p className="text-xs text-curai-muted mt-1">
              Доступные макросы: %name%, %doctor%, %time%, %date%, %cabinet%
            </p>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setEditingRule(null)}
                className="px-4 py-2 bg-curai-border text-curai-ink rounded-md hover:bg-curai-control"
              >
                Отмена
              </button>
              <button
                onClick={saveRuleTemplate}
                className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue"
               {...permissionProps(user, "system_settings")}>
                Сохранить
              </button>
            </div>
          </div></div>
        </div>
      )}

      {/* Модалка создания правила уведомления */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 curai-glass-modal-layer curai-modal-scrim-soft" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="bg-curai-surface rounded-md shadow-none w-full max-w-2xl overflow-y-auto max-h-full curai-glass-shell curai-custom-dialog">
            <div className="curai-glass-header curai-modal-glass-heading"><h3 className="text-lg font-semibold text-curai-ink">Новое правило уведомления</h3></div><div className="curai-glass-body curai-glass-body-padded">

            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Кого уведомляем</label>
                <select
                  value={newRule.recipient}
                  onChange={(e) => setNewRule({ ...newRule, recipient: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                >
                  <option value="patient">Пациент</option>
                  <option value="doctor">Врач</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Тип события</label>
                <select
                  value={newRule.trigger}
                  onChange={(e) => setNewRule({ ...newRule, trigger: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                >
                  <option value="appointment_created">Создание записи</option>
                  <option value="appointment_reminder">Напоминание о записи</option>
                  <option value="appointment_cancelled">Отмена записи</option>
                  <option value="appointment_no_show">Неявка на приём</option>
                  <option value="appointment_rescheduled">Перенос записи</option>
                  <option value="appointment_completed">Завершение приёма (обратная связь)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Метод отправки</label>
                <select
                  value={newRule.method}
                  onChange={(e) => setNewRule({ ...newRule, method: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                >
                  <option value="wazzup">Wazzup</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Текст сообщения</label>
                <textarea
                  value={newRule.message_template}
                  onChange={(e) => setNewRule({ ...newRule, message_template: e.target.value })}
                  rows={8}
                  className="w-full px-4 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus whitespace-pre-wrap"
                  placeholder="%name%, Ваша запись: Дата: %date% Время: %time% Врач: %doctor%"
                />
                <p className="text-xs text-curai-muted mt-1">
                  Макросы: %name%, %doctor%, %time%, %date%, %cabinet%, %bonusTotal%, %paidSumm%, %zhaloba%, %zametki%
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-curai-border text-curai-ink rounded-md hover:bg-curai-control">
                Отмена
              </button>
              <button onClick={createRule} className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue" {...permissionProps(user, "system_settings")}>
                Создать
              </button>
            </div>
          </div></div>
        </div>
      )}
    </div>
  );
};

export default BroadcastPage;
