import React, { useState, useEffect } from 'react';
import { formatCompensation, formatConsultationCompensation } from '../../../utils/doctorCompensation';

const formatReportDetail = (value) => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatReportDetail).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, detail]) => `${key}: ${formatReportDetail(detail)}`).join('; ');
  }
  return String(value);
};

const SalariesView = ({ user }) => {
  const [salaryData, setSalaryData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reportError, setReportError] = useState('');
  const [accountingBlockers, setAccountingBlockers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const API = import.meta.env.VITE_BACKEND_URL;

  const fetchSalaryData = async () => {
    setLoading(true);
    setSalaryData([]);
    setSummary(null);
    setReportError('');
    setAccountingBlockers([]);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors/salary-report?date_from=${dateFrom}&date_to=${dateTo}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      let data;
      try {
        data = await response.json();
      } catch {
        setReportError(`Не удалось загрузить отчёт${response.ok ? '' : ` (HTTP ${response.status})`}: сервер вернул некорректный JSON. Повторите загрузку.`);
        return;
      }

      const blockers = data?.detail?.accounting_blockers ?? data?.accounting_blockers;
      setAccountingBlockers(Array.isArray(blockers) ? blockers : blockers == null ? [] : [blockers]);

      if (!response.ok) {
        const detail = data?.detail && typeof data.detail === 'object' && !Array.isArray(data.detail)
          ? Object.fromEntries(Object.entries(data.detail).filter(([key]) => key !== 'accounting_blockers'))
          : data?.detail;
        const explanation = response.status === 409
          ? 'Расчёт зарплаты заблокирован: необходимо устранить проблемы учёта.'
          : 'Не удалось загрузить отчёт по зарплате.';
        setReportError(`${explanation} HTTP ${response.status}. ${formatReportDetail(detail)} Повторите загрузку после устранения ошибки.`);
        return;
      }

      if (!Array.isArray(data?.salary_data) || !data.salary_data.every(row => row && typeof row === 'object' && !Array.isArray(row)) || !data.summary || typeof data.summary !== 'object' || Array.isArray(data.summary)) {
        setReportError('Не удалось загрузить отчёт: сервер вернул некорректные данные расчёта. Повторите загрузку.');
        return;
      }

      setSalaryData(data.salary_data);
      setSummary(data.summary);
      if (data.compensation_complete === false || (Array.isArray(blockers) ? blockers.length > 0 : blockers != null)) {
        setReportError('Расчёт зарплаты неполный: необходимо устранить проблемы учёта и обновить отчёт.');
      }
    } catch {
      setReportError('Не удалось загрузить отчёт по зарплате. Проверьте соединение и повторите загрузку.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaryData();
  }, [dateFrom, dateTo]);

  const getPaymentTypeLabel = (type) => {
    return type === 'hybrid' ? 'Гибридная' : type === 'fixed' ? 'Фиксированная' : type === 'percentage' ? 'Процентная' : 'Не указан';
  };

  const getPaymentTypeIcon = (type) => {
    return type === 'hybrid' ? '🔗' : type === 'fixed' ? '💰' : '📊';
  };

  const formatCurrency = (amount) => {
    return `${Number(amount ?? 0).toLocaleString('ru-RU')} KZT`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">👨‍⚕️ Зарплата врачей</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Расчет заработной платы врачей на основе выполненных услуг</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📅 Период расчета</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата по</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={fetchSalaryData}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Загрузка...' : '🔄 Обновить'}
            </button>
          </div>
        </div>
      </div>

      {(reportError || accountingBlockers.length > 0) && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          <p>{reportError}</p>
          {accountingBlockers.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {accountingBlockers.map((blocker, index) => <li key={index}>{formatReportDetail(blocker)}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
                <span className="text-2xl">👨‍⚕️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Всего врачей</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total_doctors || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Общая выручка</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(summary.total_revenue || 0)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900">
                <span className="text-2xl">💳</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Общая зарплата</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(summary.total_salary || 0)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">% от выручки</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.salary_percentage || 0}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Salary Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Детализация по врачам</h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-400">Загрузка данных...</span>
          </div>
        ) : salaryData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Врач
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Тип оплаты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Размер оплаты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Записи
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Выручка записей
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Выручка планов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Общая выручка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Услуги
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Зарплата
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {salaryData.map((doctor) => (
                  <tr key={doctor.doctor_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{doctor.doctor_name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{doctor.doctor_specialty}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                        doctor.payment_type === 'fixed' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                      }`}>
                        {getPaymentTypeIcon(doctor.payment_type)} {getPaymentTypeLabel(doctor.payment_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      <div>{doctor.payment_mode === 'individual' ? 'Услуги плана: индивидуальные комиссии' : formatCompensation(doctor.payment_type, doctor.payment_value, doctor.hybrid_percentage_value, doctor.currency || 'KZT')}</div>
                      {doctor.payment_mode === 'individual' && <div className="text-xs text-gray-500">Основная схема: {formatCompensation(doctor.payment_type, doctor.payment_value, doctor.hybrid_percentage_value, doctor.currency || 'KZT')}</div>}
                      <div className="text-xs text-gray-500">{formatConsultationCompensation(doctor)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      <div>
                        <div>Всего: {doctor.total_appointments}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Завершено: {doctor.completed_appointments}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {formatCurrency(doctor.appointments_revenue || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {formatCurrency(doctor.treatment_plans_revenue || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(doctor.total_revenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      <div className="flex items-center">
                        {doctor.has_services ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                            ✅ {doctor.services_count} услуг
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            ❌ Не настроены
                          </span>
                        )}
                      </div>

                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(doctor.calculated_salary)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>Данные не найдены за выбранный период</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalariesView;
