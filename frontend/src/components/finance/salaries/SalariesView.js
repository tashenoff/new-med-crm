import React, { useState, useEffect, useRef } from 'react';
import { formatCompensation, formatConsultationCompensation } from '../../../utils/doctorCompensation';

const formatReportDetail = (value) => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatReportDetail).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, detail]) => `${key}: ${formatReportDetail(detail)}`).join('; ');
  }
  return String(value);
};

const SalariesView = ({ user, refreshVersion = 0 }) => {
  const reportRequest = useRef(0);
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
    const request = ++reportRequest.current;
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
      if (request !== reportRequest.current) return;

      let data;
      try {
        data = await response.json();
      } catch {
        if (request !== reportRequest.current) return;
        setReportError(`Не удалось загрузить отчёт${response.ok ? '' : ` (HTTP ${response.status})`}: сервер вернул некорректный JSON. Повторите загрузку.`);
        return;
      }
      if (request !== reportRequest.current) return;

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
      if (request !== reportRequest.current) return;
      setReportError('Не удалось загрузить отчёт по зарплате. Проверьте соединение и повторите загрузку.');
    } finally {
      if (request === reportRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaryData();
    return () => { reportRequest.current += 1; };
  }, [dateFrom, dateTo, refreshVersion]);

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
          <h1 className="text-2xl font-semibold text-curai-ink ">👨‍⚕️ Зарплата врачей</h1>
          <p className="text-curai-muted mt-1">Расчет заработной платы врачей на основе выполненных услуг</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-curai-surface rounded-md shadow-none border border-curai-border p-4">
        <h3 className="text-lg font-semibold text-curai-ink mb-4">📅 Период расчета</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">Дата с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-curai-control rounded-md px-3 py-2 bg-curai-surface text-curai-ink "
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">Дата по</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-curai-control rounded-md px-3 py-2 bg-curai-surface text-curai-ink "
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={fetchSalaryData}
              disabled={loading}
              className="w-full bg-curai-blue text-white px-4 py-2 rounded-md hover:bg-curai-blue disabled:bg-curai-disabled transition-colors"
            >
              {loading ? 'Загрузка...' : '🔄 Обновить'}
            </button>
          </div>
        </div>
      </div>

      {(reportError || accountingBlockers.length > 0) && (
        <div role="alert" className="rounded-md border border-curai-negative bg-curai-negativeBg p-4 text-curai-negative ">
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
          <div className="bg-curai-surface rounded-md shadow-none p-6 border border-curai-border ">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-curai-selected ">
                <span className="text-2xl">👨‍⚕️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-curai-muted ">Всего врачей</p>
                <p className="text-2xl font-semibold text-curai-ink ">{summary.total_doctors || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-curai-surface rounded-md shadow-none p-6 border border-curai-border ">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-curai-positiveBg ">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-curai-muted ">Общая выручка</p>
                <p className="text-2xl font-semibold text-curai-ink ">{formatCurrency(summary.total_revenue || 0)}</p>
              </div>
            </div>
          </div>

          <div className="bg-curai-surface rounded-md shadow-none p-6 border border-curai-border ">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-curai-warningBg ">
                <span className="text-2xl">💳</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-curai-muted ">Общая зарплата</p>
                <p className="text-2xl font-semibold text-curai-ink ">{formatCurrency(summary.total_salary || 0)}</p>
              </div>
            </div>
          </div>

          <div className="bg-curai-surface rounded-md shadow-none p-6 border border-curai-border ">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-curai-selected ">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-curai-muted ">% от выручки</p>
                <p className="text-2xl font-semibold text-curai-ink ">{summary.salary_percentage || 0}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Salary Table */}
      <div className="bg-curai-surface rounded-md shadow-none border border-curai-border ">
        <div className="px-6 py-4 border-b border-curai-border ">
          <h3 className="text-lg font-semibold text-curai-ink ">Детализация по врачам</h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-curai-control"></div>
            <span className="ml-2 text-curai-muted ">Загрузка данных...</span>
          </div>
        ) : salaryData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-curai-border ">
              <thead className="bg-curai-subtle ">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Врач
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Тип оплаты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Размер оплаты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Записи
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Выручка записей
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Выручка планов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Общая выручка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Услуги
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Зарплата
                  </th>
                </tr>
              </thead>
              <tbody className="bg-curai-surface divide-y divide-curai-border ">
                {salaryData.map((doctor) => (
                  <tr key={doctor.doctor_id} className="hover:bg-curai-subtle ">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-curai-ink ">{doctor.doctor_name}</div>
                        <div className="text-sm text-curai-muted ">{doctor.doctor_specialty}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                        doctor.payment_type === 'fixed' 
                          ? "bg-curai-positiveBg text-curai-positive "
                          : "bg-curai-selected text-curai-blue "
                      }`}>
                        {getPaymentTypeIcon(doctor.payment_type)} {getPaymentTypeLabel(doctor.payment_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink ">
                      <div>{doctor.payment_mode === 'individual' ? 'Услуги плана: индивидуальные комиссии' : formatCompensation(doctor.payment_type, doctor.payment_value, doctor.hybrid_percentage_value, doctor.currency || 'KZT')}</div>
                      {doctor.payment_mode === 'individual' && <div className="text-xs text-curai-muted">Основная схема: {formatCompensation(doctor.payment_type, doctor.payment_value, doctor.hybrid_percentage_value, doctor.currency || 'KZT')}</div>}
                      <div className="text-xs text-curai-muted">{formatConsultationCompensation(doctor)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink ">
                      <div>
                        <div>Всего: {doctor.total_appointments}</div>
                        <div className="text-xs text-curai-muted ">
                          Завершено: {doctor.completed_appointments}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink ">
                      {formatCurrency(doctor.appointments_revenue || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink ">
                      {formatCurrency(doctor.treatment_plans_revenue || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-curai-ink ">
                      {formatCurrency(doctor.total_revenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink ">
                      <div className="flex items-center">
                        {doctor.has_services ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-curai-positiveBg text-curai-positive ">
                            ✅ {doctor.services_count} услуг
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-curai-subtle text-curai-ink ">
                            ❌ Не настроены
                          </span>
                        )}
                      </div>

                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-lg font-semibold text-curai-positive ">
                        {formatCurrency(doctor.calculated_salary)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-curai-muted ">
            <p>Данные не найдены за выбранный период</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalariesView;
