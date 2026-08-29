import React, { useState, useEffect } from 'react';
import PanelHeader from '../common/PanelHeader';
import TreatmentPlansModal from '../modals/TreatmentPlansModal';

const TreatmentPlanStatistics = () => {
  const [statistics, setStatistics] = useState(null);
  const [patientStats, setPatientStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [treatmentPlansModal, setTreatmentPlansModal] = useState({ show: false, patient: null, plans: [] });
  const [loadingPlans, setLoadingPlans] = useState(false);

  const API = import.meta.env.VITE_BACKEND_URL;

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

      console.log('🔥 TreatmentPlanStatistics: Загружаем статистику с URL:', url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔥 TreatmentPlanStatistics: Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🔥 TreatmentPlanStatistics: Получены данные:', data);
        setStatistics(data);
      } else {
        const errorText = await response.text();
        console.error('🔥 TreatmentPlanStatistics: Ошибка ответа:', response.status, errorText);
        setError(`Ошибка загрузки статистики: ${response.status}`);
      }
    } catch (err) {
      console.error('🔥 TreatmentPlanStatistics: Ошибка сети:', err);
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientStatistics = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = `${API}/api/treatment-plans/statistics/patients`;
      
      console.log('🔥 TreatmentPlanStatistics: Загружаем статистику пациентов с URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔥 TreatmentPlanStatistics: Patient stats response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🔥 TreatmentPlanStatistics: Получены данные пациентов:', data);
        setPatientStats(data);
      } else {
        const errorText = await response.text();
        console.error('🔥 TreatmentPlanStatistics: Ошибка загрузки пациентов:', response.status, errorText);
      }
    } catch (err) {
      console.error('🔥 TreatmentPlanStatistics: Ошибка сети при загрузке пациентов:', err);
    }
  };

  const handlePatientClick = async (patient) => {
    setLoadingPlans(true);
    setTreatmentPlansModal({ show: true, patient, plans: [] });
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${patient.patient_id}/treatment-plans`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const plans = await response.json();
        setTreatmentPlansModal(prev => ({ ...prev, plans }));
      }
    } catch (err) {
      console.error('Error loading treatment plans:', err);
    } finally {
      setLoadingPlans(false);
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
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-${color}-500`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">{title}</p>
          <p className={`text-2xl font-bold text-${color}-600 dark:text-${color}-400`}>{value}</p>
          {subtitle && <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`text-${color}-500 dark:text-${color}-400 text-2xl`}>
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
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Планы лечения"
          subtitle="Статистика и аналитика планов лечения пациентов"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Date Filter */}
          <div className="flex items-center justify-end space-x-4">
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
                className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Поиск по имени пациента или телефону..."
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Детализация по пациентам</h3>
                <span className="text-sm text-gray-500">
                  {(() => {
                    const filteredCount = patientStats.patient_statistics.filter(patient => 
                      !searchTerm || 
                      patient.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (patient.patient_phone && patient.patient_phone.includes(searchTerm))
                    ).length;
                    return searchTerm ? `Найдено: ${filteredCount} из ${patientStats.patient_statistics.length}` : `Всего: ${patientStats.patient_statistics.length}`;
                  })()}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              {(() => {
                const filteredPatients = patientStats.patient_statistics.filter(patient => 
                  !searchTerm || 
                  patient.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (patient.patient_phone && patient.patient_phone.includes(searchTerm))
                );
                
                if (filteredPatients.length === 0) {
                  return (
                    <div className="no-results">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mx-auto mb-4 w-12 h-12 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900 mb-2">Пациенты не найдены</p>
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
                  {patientStats.patient_statistics
                    .filter(patient => 
                      !searchTerm || 
                      patient.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (patient.patient_phone && patient.patient_phone.includes(searchTerm))
                    )
                    .slice(0, 20)
                    .map((patient, index) => (
                    <tr key={patient.patient_id} 
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handlePatientClick(patient)}
                          title="Нажмите для просмотра планов лечения"
                        >
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
      </div>
    {treatmentPlansModal.show && (
        <TreatmentPlansModal
          show={treatmentPlansModal.show}
          onClose={() => setTreatmentPlansModal({ show: false, patient: null, plans: [] })}
          patient={treatmentPlansModal.patient}
          plans={treatmentPlansModal.plans}
        />
      )}
    </div>
  );
};

export default TreatmentPlanStatistics;
