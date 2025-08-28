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
              title="Средний доход"
              value={`${doctorStats.overview.avg_revenue_per_appointment.toFixed(0)} ₸`}
              subtitle="за прием"
              color="indigo"
              icon="💵"
            />
          </div>

          {/* Working Hours and Utilization Statistics */}
          {individualDoctorStats && individualDoctorStats.summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard
                title="Средние рабочие часы"
                value={`${individualDoctorStats.summary.avg_worked_hours || 0}ч`}
                subtitle="на врача"
                color="teal"
                icon="🕒"
              />
              <StatCard
                title="Средняя загруженность"
                value={`${individualDoctorStats.summary.avg_utilization_rate || 0}%`}
                color="cyan"
                icon="📈"
              />
              <StatCard
                title="Высокая загруженность"
                value={individualDoctorStats.summary.high_utilization_doctors || 0}
                subtitle="врачей >80%"
                color="emerald"
                icon="⚡"
              />
              <StatCard
                title="Активные врачи"
                value={individualDoctorStats.summary.active_doctors || 0}
                subtitle="с приемами"
                color="blue"
                icon="👨‍⚕️"
              />
            </div>
          )}
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
                className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Поиск по имени врача, специальности или телефону..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

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
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Детализация по врачам</h3>
                <span className="text-sm text-gray-500">
                  {(() => {
                    const filteredCount = individualDoctorStats.doctor_statistics.filter(doctor => 
                      !searchTerm || 
                      doctor.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      doctor.doctor_specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (doctor.doctor_phone && doctor.doctor_phone.includes(searchTerm))
                    ).length;
                    return searchTerm ? `Найдено: ${filteredCount} из ${individualDoctorStats.doctor_statistics.length}` : `Всего: ${individualDoctorStats.doctor_statistics.length}`;
                  })()}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              {(() => {
                const filteredDoctors = individualDoctorStats.doctor_statistics.filter(doctor => 
                  !searchTerm || 
                  doctor.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doctor.doctor_specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (doctor.doctor_phone && doctor.doctor_phone.includes(searchTerm))
                );
                
                if (filteredDoctors.length === 0) {
                  return (
                    <div className="no-results">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mx-auto mb-4 w-12 h-12 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900 mb-2">Врачи не найдены</p>
                      <p className="text-gray-500">Попробуйте изменить критерии поиска</p>
                    </div>
                  );
                }
                
                return null;
              })()}
              
              <table className="min-w-full divide-y divide-gray-200 searchable-table">
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
                      Рабочих часов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % загруженности
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
                  {individualDoctorStats.doctor_statistics
                    .filter(doctor => 
                      !searchTerm || 
                      doctor.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      doctor.doctor_specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (doctor.doctor_phone && doctor.doctor_phone.includes(searchTerm))
                    )
                    .slice(0, 20)
                    .map((doctor, index) => (
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
                        <div className="flex items-center">
                          <span className="text-blue-600 font-medium">
                            {doctor.total_worked_hours.toFixed(1)}ч
                          </span>
                          <div className="text-xs text-gray-500 ml-2">
                            из {doctor.total_scheduled_hours.toFixed(1)}ч
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center">
                          <span className={`font-medium ${
                            doctor.utilization_rate >= 80 ? 'text-green-600' : 
                            doctor.utilization_rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {doctor.utilization_rate.toFixed(1)}%
                          </span>
                          <div className="ml-2 flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                doctor.utilization_rate >= 80 ? 'bg-green-500' : 
                                doctor.utilization_rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(doctor.utilization_rate, 100)}%` }}
                            ></div>
                          </div>
                        </div>
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
                        <div>
                          <div>{doctor.avg_revenue_per_appointment.toFixed(0)} ₸ / прием</div>
                          <div className="text-xs text-gray-500">
                            {doctor.avg_revenue_per_hour > 0 ? `${doctor.avg_revenue_per_hour.toFixed(0)} ₸ / час` : '—'}
                          </div>
                        </div>
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