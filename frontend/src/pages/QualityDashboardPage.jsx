import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const QualityDashboardPage = ({ user }) => {
  const [stats, setStats] = useState(null);
  const [userSummaries, setUserSummaries] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [aiSettings, setAiSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => { loadData(); }, [selectedPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [statsRes, summRes, analRes, setRes] = await Promise.all([
        axios.get(`${API_URL}/api/service-quality/dashboard/stats?days=${selectedPeriod}`, {headers:h}),
        axios.get(`${API_URL}/api/service-quality/summary/users?days=${selectedPeriod}`, {headers:h}),
        axios.get(`${API_URL}/api/service-quality/analyses?limit=100`, {headers:h}),
        axios.get(`${API_URL}/api/service-quality/settings`, {headers:h})
      ]);
      setStats(statsRes.data);
      setUserSummaries(summRes.data);
      setAnalyses(analRes.data.items || []);
      setAiSettings(setRes.data);
    } catch(e){console.error(e);}
    setLoading(false);
  };

  const toggleAi = async (en) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/service-quality/settings/toggle?enabled=${en}`, {}, {headers:{Authorization:`Bearer ${token}`}});
      setAiSettings(p=>({...p, ai_whatsapp_analysis_enabled:en}));
    } catch(e){alert('Error');}
  };

  const rc = r=>({excellent:'text-green-500',good:'text-blue-500',satisfactory:'text-yellow-500',poor:'text-orange-500',very_poor:'text-red-500'}[r]||'text-gray-500');
  const rb = r=>({excellent:'bg-green-500/20',good:'bg-blue-500/20',satisfactory:'bg-yellow-500/20',poor:'bg-orange-500/20',very_poor:'bg-red-500/20'}[r]||'bg-gray-500/20');
  const rl = r=>({excellent:'Отлично',good:'Хорошо',satisfactory:'Удовл.',poor:'Плохо',very_poor:'Плохо'}[r]||r);
  const cl = c=>({response_time:'Скорость',politeness:'Вежливость',helpfulness:'Полезность',professionalism:'Профессионализм',problem_resolution:'Решение',communication:'Общение'}[c]||c);
  const sc = s=>s>=4.5?'text-green-500':s>=3.5?'text-blue-500':s>=2.5?'text-yellow-500':'text-red-500';

  if(!user||(user.role!=='admin'&&user.role!=='super_admin'))return<div className="p-6 text-red-500">Нет доступа</div>;
  if(loading)return<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"/></div>;

  return(
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-white">🤖 AI-Анализ качества</h1><p className="text-white/60">Автоматический анализ WhatsApp</p></div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2">
            <span className="text-white text-sm">AI:</span>
            <button onClick={()=>toggleAi(!aiSettings?.ai_whatsapp_analysis_enabled)} className={`relative w-12 h-6 rounded-full ${aiSettings?.ai_whatsapp_analysis_enabled?'bg-green-500':'bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${aiSettings?.ai_whatsapp_analysis_enabled?'translate-x-6':'translate-x-0.5'}`}/>
            </button>
          </div>
          <select value={selectedPeriod} onChange={e=>setSelectedPeriod(Number(e.target.value))} className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2">
            <option value={7}>7 дней</option><option value={14}>14 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option>
          </select>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/20 pb-2">
        {[{id:'overview',l:'📊 Обзор'},{id:'operators',l:'👥 Операторы'},{id:'history',l:'📋 История'},{id:'settings',l:'⚙️ Настройки'}].map(t=><button key={t.id} onClick={()=>setActiveTab(t.id)} className={`px-4 py-2 rounded-t-lg font-medium ${activeTab===t.id?'bg-white/20 text-white':'text-white/60 hover:text-white'}`}>{t.l}</button>)}
      </div>
      {/* PLACEHOLDER */}
    </div>
  );
};

export default QualityDashboardPage;
