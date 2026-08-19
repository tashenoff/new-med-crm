import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const QualityAssessmentPage = ({ user }) => {
  const [activeTab, setActiveTab] = useState('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [settings, setSettings] = useState({
    ai_whatsapp_analysis_enabled: false,
    ai_custom_instructions: '',
    ai_clinic_context: '',
    ai_model_temperature: 0.3,
    ai_min_message_length: 10,
    ai_batch_size: 10,
    ai_evaluation_criteria: {
      response_time: { enabled: true, weight: 1.0, description: 'Скорость ответов оператора' },
      politeness: { enabled: true, weight: 1.0, description: 'Вежливость и уважительность' },
      helpfulness: { enabled: true, weight: 1.0, description: 'Полезность предоставленной информации' },
      professionalism: { enabled: true, weight: 1.0, description: 'Профессионализм в общении' },
      problem_resolution: { enabled: true, weight: 1.0, description: 'Эффективность решения вопроса клиента' },
      communication: { enabled: true, weight: 1.0, description: 'Качество коммуникации в целом' }
    }
  });

  const [stats, setStats] = useState(null);
  const [userSummaries, setUserSummaries] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  useEffect(() => { loadSettings(); }, []);

  useEffect(() => {
    if (activeTab === 'dashboard' || activeTab === 'operators' || activeTab === 'history') {
      loadStats();
    }
  }, [activeTab, selectedPeriod]);

  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/service-quality/settings`, { headers: getAuthHeaders() });
      setSettings(prev => ({ ...prev, ...response.data }));
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
      showMessage('Ошибка загрузки настроек', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const [statsRes, summRes, analRes] = await Promise.all([
        axios.get(`${API_URL}/api/service-quality/dashboard/stats?days=${selectedPeriod}`, { headers: getAuthHeaders() }),
        axios.get(`${API_URL}/api/service-quality/summary/users?days=${selectedPeriod}`, { headers: getAuthHeaders() }),
        axios.get(`${API_URL}/api/service-quality/analyses?limit=100`, { headers: getAuthHeaders() })
      ]);
      setStats(statsRes.data);
      setUserSummaries(summRes.data);
      setAnalyses(analRes.data.items || []);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/service-quality/settings`, settings, { headers: getAuthHeaders() });
      showMessage('Настройки успешно сохранены', 'success');
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      showMessage('Ошибка сохранения настроек', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAI = async () => {
    const newState = !settings.ai_whatsapp_analysis_enabled;
    try {
      await axios.post(`${API_URL}/api/service-quality/settings/toggle?enabled=${newState}`, {}, { headers: getAuthHeaders() });
      setSettings(prev => ({ ...prev, ai_whatsapp_analysis_enabled: newState }));
      showMessage(newState ? 'AI анализ включен' : 'AI анализ выключен', 'success');
    } catch (error) {
      showMessage('Ошибка переключения AI', 'error');
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const updateCriteria = (key, field, value) => {
    setSettings(prev => ({
      ...prev,
      ai_evaluation_criteria: {
        ...prev.ai_evaluation_criteria,
        [key]: { ...prev.ai_evaluation_criteria[key], [field]: value }
      }
    }));
  };

  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <div className="p-6">
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
          У вас нет доступа к этому разделу
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  const criteriaLabels = {
    response_time: 'Скорость ответа',
    politeness: 'Вежливость',
    helpfulness: 'Полезность',
    professionalism: 'Профессионализм',
    problem_resolution: 'Решение проблем',
    communication: 'Коммуникация'
  };

  const renderSettingsTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white mb-4">Основные настройки AI</h2>
      <div className={`p-4 rounded-lg flex items-center gap-3 ${settings.ai_whatsapp_analysis_enabled ? 'bg-green-500/20 border border-green-500' : 'bg-gray-500/20 border border-gray-500'}`}>
        <span className={`w-3 h-3 rounded-full ${settings.ai_whatsapp_analysis_enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white">{settings.ai_whatsapp_analysis_enabled ? 'AI анализ активен - все новые диалоги будут анализироваться автоматически' : 'AI анализ отключен - диалоги не анализируются'}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-white/80 text-sm mb-2">Температура модели</label>
          <input type="range" min="0" max="1" step="0.1" value={settings.ai_model_temperature} onChange={(e) => setSettings(prev => ({ ...prev, ai_model_temperature: parseFloat(e.target.value) }))} className="w-full" />
          <div className="flex justify-between text-xs text-white/60 mt-1"><span>Точный</span><span className="text-white font-medium">{settings.ai_model_temperature}</span><span>Креативный</span></div>
        </div>
        <div>
          <label className="block text-white/80 text-sm mb-2">Мин. длина сообщения</label>
          <input type="number" min="1" max="100" value={settings.ai_min_message_length} onChange={(e) => setSettings(prev => ({ ...prev, ai_min_message_length: parseInt(e.target.value) || 10 }))} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white" />
        </div>
        <div>
          <label className="block text-white/80 text-sm mb-2">Размер пакета</label>
          <input type="number" min="5" max="50" value={settings.ai_batch_size} onChange={(e) => setSettings(prev => ({ ...prev, ai_batch_size: parseInt(e.target.value) || 10 }))} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white" />
        </div>
      </div>
      <button onClick={saveSettings} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Сохранение...' : 'Сохранить настройки'}</button>
    </div>
  );

  const renderInstructionsTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white mb-4">Инструкции для AI</h2>
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <p className="text-blue-300 text-sm">💡 Задайте дополнительные инструкции для AI при анализе качества коммуникаций WhatsApp.</p>
      </div>
      <div>
        <label className="block text-white font-medium mb-2">🏥 Контекст клиники</label>
        <p className="text-white/60 text-sm mb-2">Опишите специфику вашей клиники: виды услуг, особенности работы</p>
        <textarea value={settings.ai_clinic_context} onChange={(e) => setSettings(prev => ({ ...prev, ai_clinic_context: e.target.value }))} placeholder="Например: Мы стоматологическая клиника премиум-класса. Основные услуги: имплантация, протезирование..." rows={4} className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 resize-none focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-white font-medium mb-2">📝 Дополнительные инструкции для AI</label>
        <p className="text-white/60 text-sm mb-2">Укажите специфические требования к анализу качества общения</p>
        <textarea value={settings.ai_custom_instructions} onChange={(e) => setSettings(prev => ({ ...prev, ai_custom_instructions: e.target.value }))} placeholder="Например:&#10;- Обращай внимание на приветствие и прощание&#10;- Оценивай, предложил ли оператор записать пациента&#10;- Проверяй, уточнил ли оператор контактные данные&#10;- Оператор должен представиться в начале диалога" rows={8} className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 resize-none focus:outline-none focus:border-blue-500" />
      </div>
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">💡 Примеры инструкций:</h3>
        <div className="space-y-2 text-sm text-white/70">
          <p>• "Особо отмечай случаи, когда оператор проявляет эмпатию к пациенту"</p>
          <p>• "Снижай оценку, если оператор не предложил альтернативные варианты"</p>
          <p>• "Проверяй, был ли предложен обратный звонок при необходимости"</p>
        </div>
      </div>
      <button onClick={saveSettings} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Сохранение...' : 'Сохранить инструкции'}</button>
    </div>
  );

  const renderCriteriaTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white mb-4">Критерии оценки качества</h2>
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
        <p className="text-yellow-300 text-sm">⚠️ Настройте критерии, по которым AI будет оценивать качество коммуникаций.</p>
      </div>
      <div className="space-y-4">
        {Object.entries(settings.ai_evaluation_criteria).map(([key, value]) => (
          <div key={key} className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={value.enabled} onChange={(e) => updateCriteria(key, 'enabled', e.target.checked)} className="w-5 h-5 rounded" />
                <span className="text-white font-medium">{criteriaLabels[key] || key}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-sm">Вес:</span>
                <input type="number" min="0.1" max="3" step="0.1" value={value.weight} onChange={(e) => updateCriteria(key, 'weight', parseFloat(e.target.value) || 1)} disabled={!value.enabled} className="w-20 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-center disabled:opacity-50" />
              </div>
            </div>
            <input type="text" value={value.description} onChange={(e) => updateCriteria(key, 'description', e.target.value)} disabled={!value.enabled} placeholder="Описание критерия..." className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white/80 disabled:opacity-50" />
          </div>
        ))}
      </div>
      <button onClick={saveSettings} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Сохранение...' : 'Сохранить критерии'}</button>
    </div>
  );

  const renderDashboardTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Статистика качества</h2>
        <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(Number(e.target.value))} className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white">
          <option value={7}>7 дней</option><option value={14}>14 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option>
        </select>
      </div>
      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/10 rounded-lg p-4"><p className="text-white/60 text-sm">Всего анализов</p><p className="text-3xl font-bold text-white">{stats.total_analyses}</p></div>
          <div className="bg-white/10 rounded-lg p-4"><p className="text-white/60 text-sm">Средняя оценка</p><p className={`text-3xl font-bold ${stats.average_score >= 4 ? 'text-green-400' : stats.average_score >= 3 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.average_score}/5</p></div>
          <div className="bg-white/10 rounded-lg p-4"><p className="text-white/60 text-sm">Отличных</p><p className="text-3xl font-bold text-green-400">{stats.rating_distribution?.excellent || 0}</p></div>
          <div className="bg-white/10 rounded-lg p-4"><p className="text-white/60 text-sm">Требуют внимания</p><p className="text-3xl font-bold text-red-400">{(stats.rating_distribution?.poor || 0) + (stats.rating_distribution?.very_poor || 0)}</p></div>
        </div>
      ) : <div className="text-center text-white/60 py-8">Загрузка статистики...</div>}
    </div>
  );

  const renderOperatorsTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white">Рейтинг операторов</h2>
      {userSummaries.length > 0 ? (
        <div className="space-y-3">
          {userSummaries.map((s, i) => (
            <div key={s.user_id} className="bg-white/10 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-gray-400 text-black' : 'bg-white/20 text-white'}`}>{i + 1}</span>
                <div><p className="text-white font-medium">{s.user_name || 'Неизвестный'}</p><p className="text-white/60 text-sm">{s.total_analyses} анализов</p></div>
              </div>
              <p className={`text-2xl font-bold ${s.average_score >= 4 ? 'text-green-400' : s.average_score >= 3 ? 'text-yellow-400' : 'text-red-400'}`}>{s.average_score}/5</p>
            </div>
          ))}
        </div>
      ) : <div className="text-center text-white/60 py-8">Нет данных</div>}
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white">История анализов</h2>
      {analyses.length > 0 ? (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {analyses.map((a) => (
            <div key={a.id} className="bg-white/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div><p className="text-white font-medium">{a.user_name || 'Оператор'}</p><p className="text-white/60 text-sm">Клиент: {a.contact_name || a.phone}</p></div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${a.overall_score >= 4 ? 'text-green-400' : a.overall_score >= 3 ? 'text-yellow-400' : 'text-red-400'}`}>{a.overall_score}/5</p>
                  <p className="text-white/60 text-xs">{new Date(a.analyzed_at).toLocaleDateString('ru-RU')}</p>
                </div>
              </div>
              {a.ai_summary && <p className="text-white/80 text-sm mt-2 border-t border-white/10 pt-2">{a.ai_summary}</p>}
            </div>
          ))}
        </div>
      ) : <div className="text-center text-white/60 py-8">Нет истории анализов</div>}
    </div>
  );

  const tabs = [
    { id: 'settings', label: '⚙️ Настройки AI' },
    { id: 'instructions', label: '📝 Инструкции' },
    { id: 'criteria', label: '📊 Критерии' },
    { id: 'dashboard', label: '📈 Дашборд' },
    { id: 'operators', label: '👥 Операторы' },
    { id: 'history', label: '📋 История' }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3"><span className="text-4xl">🤖</span>Оценка качества коммуникаций</h1>
          <p className="text-white/60 mt-1">Настройка AI-анализа качества общения в WhatsApp</p>
        </div>
        <div className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-3">
          <span className="text-white text-sm font-medium">AI Анализ:</span>
          <button onClick={toggleAI} className={`relative w-14 h-7 rounded-full transition-colors ${settings.ai_whatsapp_analysis_enabled ? 'bg-green-500' : 'bg-gray-600'}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${settings.ai_whatsapp_analysis_enabled ? 'translate-x-7' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-sm ${settings.ai_whatsapp_analysis_enabled ? 'text-green-400' : 'text-gray-400'}`}>{settings.ai_whatsapp_analysis_enabled ? 'Вкл' : 'Выкл'}</span>
        </div>
      </div>
      {message && <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 border border-green-500 text-green-400' : 'bg-red-500/20 border border-red-500 text-red-400'}`}>{message.text}</div>}
      <div className="flex gap-2 border-b border-white/20 pb-2 flex-wrap">
        {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === t.id ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>{t.label}</button>)}
      </div>
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        {activeTab === 'settings' && renderSettingsTab()}
        {activeTab === 'instructions' && renderInstructionsTab()}
        {activeTab === 'criteria' && renderCriteriaTab()}
        {activeTab === 'dashboard' && renderDashboardTab()}
        {activeTab === 'operators' && renderOperatorsTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>
    </div>
  );
};

export default QualityAssessmentPage;
