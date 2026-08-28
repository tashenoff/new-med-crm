import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../../api/config';
import ServiceDetailModal from '../modals/ServiceDetailModal';

const ServicesReport = ({ user }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Состояние для модального окна деталей услуги
  const [detailModal, setDetailModal] = useState({
    show: false,
    serviceName: ''
  });

  const openServiceDetail = (serviceName) => {
    setDetailModal({ show: true, serviceName });
  };

  const closeServiceDetail = () => {
    setDetailModal({ show: false, serviceName: '' });
  };

  // Фильтры периода
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(null); // null = весь год
  const [category, setCategory] = useState(''); // '' = все
  const [doctorId, setDoctorId] = useState(''); // '' = все

  // Опции для фильтров
  const [categories, setCategories] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const months = [
    { value: null, label: 'Весь год' },
    { value: 1, label: 'Январь' },
    { value: 2, label: 'Февраль' },
    { value: 3, label: 'Март' },
    { value: 4, label: 'Апрель' },
    { value: 5, label: 'Май' },
    { value: 6, label: 'Июнь' },
    { value: 7, label: 'Июль' },
    { value: 8, label: 'Август' },
    { value: 9, label: 'Сентябрь' },
    { value: 10, label: 'Октябрь' },
    { value: 11, label: 'Ноябрь' },
    { value: 12, label: 'Декабрь' },
  ];

  // Годы: текущий и несколько предыдущих
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    years.push(y);
  }

  // Загрузка опций фильтров
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/reports/services-report/filters`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const result = await response.json();
          setCategories(result.categories || []);
          setDoctors(result.doctors || []);
        }
      } catch (err) {
        console.error('Ошибка загрузки фильтров:', err);
      }
    };
    fetchFilters();
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('year', year);
      if (month) params.append('month', month);
      if (category) params.append('category', category);
      if (doctorId) params.append('doctor_id', doctorId);
      const response = await fetch(`${API_BASE_URL}/reports/services-report?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Ошибка загрузки отчета');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, month, category, doctorId]);

  useEffect(() => {
    fetchReport();
  }, [year, month]);

  const handleApplyFilters = () => {
    fetchReport();
  };

  const formatMoney = (amount) => {
    return ((amount || 0)).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₸';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl">
        <p className="font-medium">Ошибка загрузки отчета</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchReport}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          📊 Отчет по оказанным услугам
        </h1>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Year */}
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Month */}
          <select
            value={month ?? ''}
            onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {months.map(m => (
              <option key={m.value ?? 'all'} value={m.value ?? ''}>{m.label}</option>
            ))}
          </select>

          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Обновить
          </button>
        </div>
      </div>

      {/* Filters block */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Фильтры:</span>

          {/* Специальность */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Все специальности</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Врач */}
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Все врачи</option>
            {doctors.map(doc => (
              <option key={doc.id} value={doc.id}>{doc.name}</option>
            ))}
          </select>

          {/* Применить */}
          <button
            onClick={handleApplyFilters}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {loading ? 'Загрузка...' : 'Применить'}
          </button>
        </div>
      </div>

      {/* Totals Cards */}
      {data?.totals && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Ожидаемый доход</p>
            <p className="text-2xl font-bold text-blue-600">{formatMoney(data.totals.total_expected)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Фактически оплачено</p>
            <p className="text-2xl font-bold text-green-600">{formatMoney(data.totals.total_paid)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Задолженность</p>
            <p className="text-2xl font-bold text-red-600">{formatMoney(data.totals.total_outstanding)}</p>
          </div>
        </div>
      )}
{/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Название услуги
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Категория
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Цена услуги
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Кол-во
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Ожидаемый доход
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Оплачено
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Задолженность
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data?.items?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    Нет данных для отображения. Создайте планы лечения с услугами.
                  </td>
                </tr>
              ) : (
                data?.items?.map((item, index) => {
                  const outstanding = item.total_expected - item.total_paid;
                  return (
                    <tr
                      key={index}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                      onClick={() => openServiceDetail(item.service_name)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {item.service_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">
                        {formatMoney(item.price)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">
                        {item.quantity_total}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                        {formatMoney(item.total_expected)}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right font-medium">
                        {formatMoney(item.total_paid)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right font-medium">
                        {formatMoney(outstanding)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with count */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Всего услуг: <span className="font-medium">{data?.totals?.services_count || 0}</span>
          </p>
        </div>
      </div>

      {/* Модальное окно деталей услуги */}
      <ServiceDetailModal
        show={detailModal.show}
        onClose={closeServiceDetail}
        serviceName={detailModal.serviceName}
        year={year}
        month={month}
      />
    </div>
  );
};

export default ServicesReport;