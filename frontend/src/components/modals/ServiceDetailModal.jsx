import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { API_BASE_URL } from '../../api/config';

const ServiceDetailModal = ({
  show,
  onClose,
  serviceName,
  year,
  month
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDetails = async () => {
    if (!serviceName) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (year) params.append('year', year);
      if (month) params.append('month', month);
      const response = await fetch(
        `${API_BASE_URL}/reports/services-report/${encodeURIComponent(serviceName)}/details?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (!response.ok) throw new Error('Ошибка загрузки деталей услуги');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && serviceName) {
      fetchDetails();
    }
  }, [show, serviceName]);

  const formatMoney = (amount) => {
    return ((amount || 0)).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₸';
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={`📋 Детали услуги: ${serviceName || ''}`}
      size="max-w-[98vw]"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl">
          <p className="font-medium">Ошибка загрузки</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchDetails}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
          >
            Повторить
          </button>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Итоги */}
          {data.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {data.totals.patients_count}
                </div>
                <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">Пациентов</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatMoney(data.totals.total_expected)}
                </div>
                <div className="text-sm text-green-600 dark:text-green-400 mt-1">Ожидаемый доход</div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(data.totals.total_paid)}
                </div>
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">Оплачено</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatMoney(data.totals.total_outstanding)}
                </div>
                <div className="text-sm text-red-600 dark:text-red-400 mt-1">Задолженность</div>
              </div>
            </div>
          )}

          {/* Таблица пациентов */}
          {data.patients && data.patients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white dark:bg-gray-800">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                      Пациент
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                      Кабинет
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                      Планов лечения
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                      Должен
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                      Оплатил
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                      Задолженность
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.patients.map((patient, index) => {
                    const outstanding = patient.total_expected - patient.total_paid;
                    return (
                      <tr key={patient.patient_id || index} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                          {patient.patient_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            {patient.room_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold">
                            {patient.plans_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                          {formatMoney(patient.total_expected)}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right font-medium">
                          {formatMoney(patient.total_paid)}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right font-medium">
                          {formatMoney(outstanding)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-3">📭</div>
              <p>Нет пациентов, использовавших эту услугу в выбранный период</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 -mx-6 -mb-6 rounded-b-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Всего пациентов: <span className="font-medium">{data.totals?.patients_count || 0}</span>
              {data.patients && (
                <>
                  {' • '}Всего планов лечения: <span className="font-medium">
                    {data.patients.reduce((sum, p) => sum + (p.plans_count || 0), 0)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default ServiceDetailModal;

