import React, { useState, useEffect } from 'react';

const TreatmentStatistics = () => {
  const [statistics, setStatistics] = useState(null);
  const [patientStats, setPatientStats] = useState(null);
  const [doctorStats, setDoctorStats] = useState(null);
  const [individualDoctorStats, setIndividualDoctorStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [activeCategory, setActiveCategory] = useState('treatment'); // 'treatment' or 'doctors'

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (activeCategory === 'treatment') {
      fetchStatistics();
      fetchPatientStatistics();
    } else if (activeCategory === 'doctors') {
      fetchDoctorStatistics();
      fetchIndividualDoctorStatistics();
    }
  }, [activeCategory]);

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
    if (activeCategory === 'treatment') {
      fetchStatistics(dateFrom, dateTo);
    } else if (activeCategory === 'doctors') {
      fetchDoctorStatistics(dateFrom, dateTo);
      fetchIndividualDoctorStatistics();
    }
  };

  const resetDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    if (activeCategory === 'treatment') {
      fetchStatistics('', '');
    } else if (activeCategory === 'doctors') {
      fetchDoctorStatistics('', '');
      fetchIndividualDoctorStatistics();
    }
  };

  const StatCard = ({ title, value, subtitle, color = "blue", icon }) => (
    <div className={`bg-curai-surface p-6 rounded-md shadow-none border-l-4 border-${color}-500`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-curai-muted text-sm font-medium">{title}</p>
          <p className={`text-2xl font-semibold text-${color}-600`}>{value}</p>
          {subtitle && <p className="text-curai-muted text-xs mt-1">{subtitle}</p>}
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
        <div className="flex justify-between text-sm font-medium text-curai-ink mb-1">
          <span>{label}</span>
          <span>{value} из {total} ({percentage}%)</span>
        </div>
        <div className="w-full bg-curai-border rounded-full h-2">
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-curai-control mx-auto mb-4"></div>
          <p className="text-curai-muted">Загрузка статистики...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-curai-ink">Статистика клиники</h1>
        
        {/* Date Filter */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-curai-ink">От:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1 border border-curai-control rounded text-sm"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-curai-ink">До:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1 border border-curai-control rounded text-sm"
            />
          </div>
          <button
            onClick={handleDateFilter}
            className="px-4 py-1 bg-curai-blue text-white rounded text-sm hover:bg-curai-blue"
          >
            Применить
          </button>
          <button
            onClick={resetDateFilter}
            className="px-4 py-1 bg-curai-control text-curai-ink rounded text-sm hover:bg-curai-disabled"
          >
            Сбросить
          </button>
        </div>
      </div>

      {/* Category Selection */}
      <div className="border-b border-curai-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setActiveCategory('treatment');
              setActiveTab('overview');
            }}
            className={`py-3 px-1 border-b-2 font-medium text-lg ${
              activeCategory === 'treatment'
                ? "border-curai-control text-curai-blue"
                : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
            }`}
          >
            📋 Планы лечения
          </button>
          <button
            onClick={() => {
              setActiveCategory('doctors');
              setActiveTab('overview');
            }}
            className={`py-3 px-1 border-b-2 font-medium text-lg ${
              activeCategory === 'doctors'
                ? "border-curai-control text-curai-blue"
                : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
            }`}
          >
            👩‍⚕️ Врачи
          </button>
        </nav>
      </div>

      {/* Subcategory Tabs */}
      <div className="border-b border-curai-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? "border-curai-control text-curai-blue"
                : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
            }`}
          >
            Обзор
          </button>
          {activeCategory === 'treatment' && (
            <>
              <button
                onClick={() => setActiveTab('patients')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'patients'
                    ? "border-curai-control text-curai-blue"
                    : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
                }`}
              >
                По пациентам
              </button>
              <button
                onClick={() => setActiveTab('monthly')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'monthly'
                    ? "border-curai-control text-curai-blue"
                    : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
                }`}
              >
                По месяцам
              </button>
            </>
          )}
          {activeCategory === 'doctors' && (
            <>
              <button
                onClick={() => setActiveTab('doctors')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'doctors'
                    ? "border-curai-control text-curai-blue"
                    : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
                }`}
              >
                По врачам
              </button>
              <button
                onClick={() => setActiveTab('monthly')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'monthly'
                    ? "border-curai-control text-curai-blue"
                    : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
                }`}
              >
                По месяцам
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Treatment Plans Overview Tab */}
      {activeCategory === 'treatment' && activeTab === 'overview' && statistics && (
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
          <div className="bg-curai-surface p-6 rounded-md shadow-none">
            <h3 className="text-lg font-semibold text-curai-ink mb-4">Распределение по статусам</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-curai-ink mb-3">Выполнение планов</h4>
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
                <h4 className="font-medium text-curai-ink mb-3">Статус оплаты</h4>
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
      {activeCategory === 'treatment' && activeTab === 'patients' && patientStats && (
        <div className="space-y-6">
          {/* Patient Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>

          {/* Patient Table */}
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-curai-border">
              <h3 className="text-lg font-semibold text-curai-ink">Детализация по пациентам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-curai-border">
                <thead className="bg-curai-subtle">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Пациент
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Выполнено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Не пришел
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Сумма планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Оплачено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      К доплате
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-curai-surface divide-y divide-curai-border">
                  {patientStats.patient_statistics.slice(0, 20).map((patient, index) => (
                    <tr key={patient.patient_id} className="hover:bg-curai-subtle">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-curai-ink">
                            {patient.patient_name}
                          </div>
                          <div className="text-sm text-curai-muted">
                            {patient.patient_phone}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {patient.total_plans}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-curai-positive font-medium">
                          {patient.completed_plans}
                        </span>
                        <span className="text-curai-muted ml-1">
                          ({patient.completion_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-curai-negative font-medium">
                          {patient.no_show_plans}
                        </span>
                        <span className="text-curai-muted ml-1">
                          ({patient.no_show_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {patient.total_cost.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-positive font-medium">
                        {patient.total_paid.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          patient.outstanding_amount > 0 ? "text-curai-negative" : "text-curai-positive"
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

      {/* Treatment Plans Monthly Tab */}
      {activeCategory === 'treatment' && activeTab === 'monthly' && statistics && statistics.monthly_statistics && (
        <div className="space-y-6">
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-curai-border">
              <h3 className="text-lg font-semibold text-curai-ink">Статистика по месяцам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-curai-border">
                <thead className="bg-curai-subtle">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Месяц
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Создано планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Выполнено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Не пришли
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Сумма планов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Получено оплат
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      % выполнения
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      % собираемости
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-curai-surface divide-y divide-curai-border">
                  {statistics.monthly_statistics.map((month, index) => (
                    <tr key={month.month} className="hover:bg-curai-subtle">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-curai-ink">
                        {month.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {month.created}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-positive">
                        {month.completed}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-negative">
                        {month.no_show}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {month.total_cost.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-positive">
                        {month.paid_amount.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          month.completion_rate >= 70 ? "text-curai-positive" :
                          month.completion_rate >= 50 ? "text-curai-warning" : "text-curai-negative"
                        }`}>
                          {month.completion_rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          month.collection_rate >= 80 ? "text-curai-positive" :
                          month.collection_rate >= 60 ? "text-curai-warning" : "text-curai-negative"
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

      {/* Doctor Statistics */}
      {activeCategory === 'doctors' && activeTab === 'overview' && doctorStats && (
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
          <div className="bg-curai-surface p-6 rounded-md shadow-none">
            <h3 className="text-lg font-semibold text-curai-ink mb-4">Показатели эффективности</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-curai-ink mb-3">Статистика приемов</h4>
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
                <h4 className="font-medium text-curai-ink mb-3">Финансовые показатели</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-curai-muted">Средняя нагрузка врача:</span>
                    <span className="font-medium">{doctorStats.overview.avg_appointments_per_doctor} приемов</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-curai-muted">Эффективность сбора:</span>
                    <span className="font-medium">{doctorStats.overview.revenue_efficiency}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-curai-muted">Процент отмен:</span>
                    <span className="font-medium">{doctorStats.overview.cancellation_rate}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual Doctors Tab */}
      {activeCategory === 'doctors' && activeTab === 'doctors' && individualDoctorStats && (
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
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-curai-border">
              <h3 className="text-lg font-semibold text-curai-ink">Детализация по врачам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-curai-border">
                <thead className="bg-curai-subtle">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Врач
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Приемов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Завершено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Не пришли
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Выручка
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Средний доход
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      % завершений
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-curai-surface divide-y divide-curai-border">
                  {individualDoctorStats.doctor_statistics.slice(0, 20).map((doctor, index) => (
                    <tr key={doctor.doctor_id} className="hover:bg-curai-subtle">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-curai-ink">
                            {doctor.doctor_name}
                          </div>
                          <div className="text-sm text-curai-muted">
                            {doctor.doctor_specialty}
                          </div>
                          {doctor.doctor_phone && (
                            <div className="text-sm text-curai-muted">
                              {doctor.doctor_phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {doctor.total_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-curai-positive font-medium">
                          {doctor.completed_appointments}
                        </span>
                        <span className="text-curai-muted ml-1">
                          ({doctor.completion_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-curai-negative font-medium">
                          {doctor.no_show_appointments}
                        </span>
                        <span className="text-curai-muted ml-1">
                          ({doctor.no_show_rate.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-positive font-medium">
                        {doctor.total_revenue.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {doctor.avg_revenue_per_appointment.toFixed(0)} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          doctor.completion_rate >= 80 ? "text-curai-positive" :
                          doctor.completion_rate >= 60 ? "text-curai-warning" : "text-curai-negative"
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

      {/* Doctor Monthly Statistics */}
      {activeCategory === 'doctors' && activeTab === 'monthly' && doctorStats && doctorStats.monthly_statistics && (
        <div className="space-y-6">
          <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-curai-border">
              <h3 className="text-lg font-semibold text-curai-ink">Статистика врачей по месяцам</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-curai-border">
                <thead className="bg-curai-subtle">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Месяц
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Всего приемов
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Завершено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Отменено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Не пришли
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Выручка
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      % завершений
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Средний доход
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-curai-surface divide-y divide-curai-border">
                  {doctorStats.monthly_statistics.map((month, index) => (
                    <tr key={month.month} className="hover:bg-curai-subtle">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-curai-ink">
                        {month.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                        {month.total_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-positive">
                        {month.completed_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-warning">
                        {month.cancelled_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-negative">
                        {month.no_show_appointments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-positive">
                        {month.total_revenue.toLocaleString()} ₸
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${
                          month.completion_rate >= 70 ? "text-curai-positive" :
                          month.completion_rate >= 50 ? "text-curai-warning" : "text-curai-negative"
                        }`}>
                          {month.completion_rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
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

export default TreatmentStatistics;