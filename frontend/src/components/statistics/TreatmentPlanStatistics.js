import React, { useState, useEffect } from 'react';

const TreatmentPlanStatistics = () => {
  const [statistics, setStatistics] = useState(null);
  const [patientStats, setPatientStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    fetchStatistics();
    fetchPatientStatistics();
  }, []);

  const fetchStatistics = async (customDateFrom = null, customDateTo = null) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      let url = `${API}/api/treatment-plans/statistics`;
      const params = new URLSearchParams();
      
      if (customDateFrom || dateFrom) {
        params.append('date_from', customDateFrom || dateFrom);
      }
      if (customDateTo || dateTo) {
        params.append('date_to', customDateTo || dateTo);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStatistics(data);
      } else {
        setError('Ошибка загрузки статистики');
      }
    } catch (err) {
      setError('Ошибка сети');
      console.error('Error fetching statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientStatistics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/treatment-plans/statistics/patients`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPatientStats(data);
      }
    } catch (err) {
      console.error('Error fetching patient statistics:', err);
    }
  };

  const handleDateFilter = () => {
    fetchStatistics(dateFrom, dateTo);
  };

  const resetDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    fetchStatistics('', '');
  };

  const StatCard = ({ title, value, subtitle, color = "blue", icon }) => (
    <div className={`bg-white p-6 rounded-lg shadow border-l-4 border-${color}-500`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
          {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`text-${color}-500 text-2xl`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );

  const ProgressBar = ({ label, value, total, color = "blue" }) => {
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    
    return (
      <div className="mb-4">
        <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
          <span>{label}</span>
          <span>{value} из {total} ({percentage}%)</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`bg-${color}-600 h-2 rounded-full transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка статистики...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Статистика планов лечения</h1>
        
        {/* Date Filter */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">От:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">До:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
          <button
            onClick={handleDateFilter}
            className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Применить
          </button>
          <button
            onClick={resetDateFilter}
            className="px-4 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
          >
            Сбросить
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Обзор
          </button>
          <button
            onClick={() => setActiveTab('patients')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'patients'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            По пациентам
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'monthly'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            По месяцам
          </button>
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && statistics && (
        <div className="space-y-6">
          {/* Main Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Всего планов"
              value={statistics.overview.total_plans}
              color="blue"
              icon="📋"
            />
            <StatCard
              title="Выполнено"
              value={statistics.overview.completed_plans}
              subtitle={`${statistics.overview.completion_rate}% от общего`}
              color="green"
              icon="✅"
            />
            <StatCard
              title="Не пришли"
              value={statistics.overview.no_show_plans}
              subtitle={`${statistics.overview.no_show_rate}% от общего`}
              color="red"
              icon="❌"
            />
            <StatCard
              title="В процессе"
              value={statistics.overview.in_progress_plans}
              color="yellow"
              icon="⏳"
            />
          </div>

          {/* Financial Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Общая стоимость"
              value={`${statistics.overview.total_cost.toLocaleString()} ₸`}
              color="purple"
              icon="💰"
            />
            <StatCard
              title="Получено оплат"
              value={`${statistics.overview.total_paid.toLocaleString()} ₸`}
              subtitle={`${statistics.overview.collection_rate}% собираемость`}
              color="green"
              icon="💳"
            />
            <StatCard
              title="К доплате"
              value={`${statistics.overview.outstanding_amount.toLocaleString()} ₸`}
              color="orange"
              icon="⏰"
            />
          </div>

          {/* Progress Bars */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Распределение по статусам</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Выполнение планов</h4>
                <ProgressBar
                  label="Выполнено"
                  value={statistics.overview.completed_plans}
                  total={statistics.overview.total_plans}
                  color="green"
                />
                <ProgressBar
                  label="В процессе"
                  value={statistics.overview.in_progress_plans}
                  total={statistics.overview.total_plans}
                  color="yellow"
                />
                <ProgressBar
                  label="Не пришли"
                  value={statistics.overview.no_show_plans}
                  total={statistics.overview.total_plans}
                  color="red"
                />
                <ProgressBar
                  label="Ожидание"
                  value={statistics.overview.pending_plans}
                  total={statistics.overview.total_plans}
                  color="gray"
                />
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-3">Статус оплаты</h4>
                <ProgressBar
                  label="Оплачено"
                  value={statistics.payment_summary.paid_plans}
                  total={statistics.overview.total_plans}
                  color="green"
                />
                <ProgressBar
                  label="Частично оплачено"
                  value={statistics.payment_summary.partially_paid_plans}
                  total={statistics.overview.total_plans}
                  color="yellow"
                />
                <ProgressBar
                  label="Не оплачено"
                  value={statistics.payment_summary.unpaid_plans}
                  total={statistics.overview.total_plans}
                  color="red"
                />
                <ProgressBar
                  label="Просрочено"
                  value={statistics.payment_summary.overdue_plans}
                  total={statistics.overview.total_plans}
                  color="purple"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patients Tab */}
      {activeTab === 'patients' && patientStats && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Поиск по имени пациента или телефону..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Patient Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              title="Всего пациентов"
              value={patientStats.summary.total_patients}
              color="blue"
              icon="👥"
            />
            <StatCard
              title="С долгами"
              value={patientStats.summary.patients_with_unpaid}
              color="red"
              icon="💸"
            />
            <StatCard
              title="С пропусками"
              value={patientStats.summary.patients_with_no_shows}
              color="orange"
              icon="⚠️"
            />
            <StatCard
              title="VIP пациенты"
              value={patientStats.summary.high_value_patients}
              subtitle="Планы > 50,000 ₸"
              color="purple"
              icon="⭐"
            />
          </div>

          {/* Patient Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Детализация по пациентам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Пациент
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Выполнено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Не пришел
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сумма планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Оплачено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      К доплате
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {patientStats.patient_statistics.slice(0, 20).map((patient, index) => (
                    <tr key={patient.patient_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {patient.patient_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {patient.patient_phone}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {patient.total_plans}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-green-600 font-medium">
                          {patient.completed_plans}
                        </span>
                        <span className="text-gray-500 ml-1">
                          ({patient.completion_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-red-600 font-medium">
                          {patient.no_show_plans}
                        </span>
                        <span className="text-gray-500 ml-1">
                          ({patient.no_show_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {patient.total_cost.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                        {patient.total_paid.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          patient.outstanding_amount > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {patient.outstanding_amount.toLocaleString()} ₸
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Tab */}
      {activeTab === 'monthly' && statistics && statistics.monthly_statistics && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Статистика по месяцам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Месяц
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Создано планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Выполнено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Не пришли
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сумма планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Получено оплат
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % выполнения
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % собираемости
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {statistics.monthly_statistics.map((month, index) => (
                    <tr key={month.month} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {month.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {month.created}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {month.completed}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        {month.no_show}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {month.total_cost.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {month.paid_amount.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          month.completion_rate >= 70 ? 'text-green-600' : 
                          month.completion_rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {month.completion_rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          month.collection_rate >= 80 ? 'text-green-600' : 
                          month.collection_rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {month.collection_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreatmentPlanStatistics;