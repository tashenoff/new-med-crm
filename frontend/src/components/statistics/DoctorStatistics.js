import React, { useState, useEffect } from 'react';

const DoctorStatistics = () => {
  const [doctorStats, setDoctorStats] = useState(null);
  const [individualDoctorStats, setIndividualDoctorStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    fetchDoctorStatistics();
    fetchIndividualDoctorStatistics();
  }, []);

  const fetchDoctorStatistics = async (customDateFrom = null, customDateTo = null) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      let url = `${API}/api/doctors/statistics`;
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
        setDoctorStats(data);
      } else {
        setError('Ошибка загрузки статистики врачей');
      }
    } catch (err) {
      setError('Ошибка сети');
      console.error('Error fetching doctor statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndividualDoctorStatistics = async () => {
    try {
      const token = localStorage.getItem('token');
      
      let url = `${API}/api/doctors/statistics/individual`;
      const params = new URLSearchParams();
      
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      
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
        setIndividualDoctorStats(data);
      }
    } catch (err) {
      console.error('Error fetching individual doctor statistics:', err);
    }
  };

  const handleDateFilter = () => {
    fetchDoctorStatistics(dateFrom, dateTo);
    fetchIndividualDoctorStatistics();
  };

  const resetDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    fetchDoctorStatistics('', '');
    fetchIndividualDoctorStatistics();
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
          <p className="text-gray-600">Загрузка статистики врачей...</p>
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
        <h1 className="text-3xl font-bold text-gray-900">Статистика врачей</h1>
        
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
            onClick={() => setActiveTab('doctors')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'doctors'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            По врачам
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
      {activeTab === 'overview' && doctorStats && (
        <div className="space-y-6">
          {/* Main Doctor Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Всего врачей"
              value={doctorStats.overview.total_doctors}
              color="blue"
              icon="👨‍⚕️"
            />
            <StatCard
              title="Всего приемов"
              value={doctorStats.overview.total_appointments}
              color="green"
              icon="📅"
            />
            <StatCard
              title="Завершено"
              value={doctorStats.overview.completed_appointments}
              subtitle={`${doctorStats.overview.completion_rate}% от общего`}
              color="green"
              icon="✅"
            />
            <StatCard
              title="Не пришли"
              value={doctorStats.overview.no_show_appointments}
              subtitle={`${doctorStats.overview.no_show_rate}% от общего`}
              color="red"
              icon="❌"
            />
          </div>

          {/* Revenue Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Общая выручка"
              value={`${doctorStats.overview.total_revenue.toLocaleString()} ₸`}
              color="purple"
              icon="💰"
            />
            <StatCard
              title="Потенциальная выручка"
              value={`${doctorStats.overview.potential_revenue.toLocaleString()} ₸`}
              subtitle={`${doctorStats.overview.revenue_efficiency}% эффективность`}
              color="orange"
              icon="📊"
            />
            <StatCard
              title="Средний доход за прием"
              value={`${doctorStats.overview.avg_revenue_per_appointment.toLocaleString()} ₸`}
              color="green"
              icon="💳"
            />
          </div>

          {/* Performance Metrics */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Показатели эффективности</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Статистика приемов</h4>
                <ProgressBar
                  label="Завершено"
                  value={doctorStats.overview.completed_appointments}
                  total={doctorStats.overview.total_appointments}
                  color="green"
                />
                <ProgressBar
                  label="Отменено"
                  value={doctorStats.overview.cancelled_appointments}
                  total={doctorStats.overview.total_appointments}
                  color="yellow"
                />
                <ProgressBar
                  label="Не пришли"
                  value={doctorStats.overview.no_show_appointments}
                  total={doctorStats.overview.total_appointments}
                  color="red"
                />
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-3">Финансовые показатели</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Средняя нагрузка врача:</span>
                    <span className="font-medium">{doctorStats.overview.avg_appointments_per_doctor} приемов</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Эффективность сбора:</span>
                    <span className="font-medium">{doctorStats.overview.revenue_efficiency}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Процент отмен:</span>
                    <span className="font-medium">{doctorStats.overview.cancellation_rate}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual Doctors Tab */}
      {activeTab === 'doctors' && individualDoctorStats && (
        <div className="space-y-6">
          {/* Doctor Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              title="Всего врачей"
              value={individualDoctorStats.summary.total_doctors}
              color="blue"
              icon="👥"
            />
            <StatCard
              title="Активные врачи"
              value={individualDoctorStats.summary.active_doctors}
              subtitle="С приемами в периоде"
              color="green"
              icon="🟢"
            />
            <StatCard
              title="Топ исполнители"
              value={individualDoctorStats.summary.top_performers}
              subtitle="> 80% завершений"
              color="purple"
              icon="⭐"
            />
            <StatCard
              title="Высокий доход"
              value={individualDoctorStats.summary.high_revenue_doctors}
              subtitle="> 100,000 ₸"
              color="orange"
              icon="💎"
            />
          </div>

          {/* Doctors Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Детализация по врачам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Врач
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Приемов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Завершено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Не пришли
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Выручка
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Средний доход
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % завершений
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {individualDoctorStats.doctor_statistics.slice(0, 20).map((doctor, index) => (
                    <tr key={doctor.doctor_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {doctor.doctor_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {doctor.doctor_specialty}
                          </div>
                          {doctor.doctor_phone && (
                            <div className="text-sm text-gray-400">
                              {doctor.doctor_phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {doctor.total_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-green-600 font-medium">
                          {doctor.completed_appointments}
                        </span>
                        <span className="text-gray-500 ml-1">
                          ({doctor.completion_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-red-600 font-medium">
                          {doctor.no_show_appointments}
                        </span>
                        <span className="text-gray-500 ml-1">
                          ({doctor.no_show_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                        {doctor.total_revenue.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {doctor.avg_revenue_per_appointment.toFixed(0)} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          doctor.completion_rate >= 80 ? 'text-green-600' : 
                          doctor.completion_rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {doctor.completion_rate.toFixed(1)}%
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

      {/* Monthly Statistics */}
      {activeTab === 'monthly' && doctorStats && doctorStats.monthly_statistics && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Статистика врачей по месяцам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Месяц
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Всего приемов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Завершено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Отменено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Не пришли
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Выручка
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % завершений
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Средний доход
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {doctorStats.monthly_statistics.map((month, index) => (
                    <tr key={month.month} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {month.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {month.total_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {month.completed_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                        {month.cancelled_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        {month.no_show_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {month.total_revenue.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          month.completion_rate >= 70 ? 'text-green-600' : 
                          month.completion_rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {month.completion_rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {month.avg_revenue_per_appointment.toFixed(0)} ₸
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

export default DoctorStatistics;