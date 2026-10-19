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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-curai-control"></div>
        </div>
      ) : error ? (
        <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-6 py-4 rounded-md">
          <p className="font-medium">Ошибка загрузки</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchDetails}
            className="mt-3 px-4 py-2 bg-curai-negative text-white rounded-md hover:bg-curai-negative text-sm"
          >
            Повторить
          </button>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Итоги */}
          {data.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-curai-selected rounded-md p-4 text-center">
                <div className="text-2xl font-semibold text-curai-blue ">
                  {data.totals.patients_count}
                </div>
                <div className="text-sm text-curai-blue mt-1">Пациентов</div>
              </div>
              <div className="bg-curai-positiveBg rounded-md p-4 text-center">
                <div className="text-2xl font-semibold text-curai-positive ">
                  {formatMoney(data.totals.total_expected)}
                </div>
                <div className="text-sm text-curai-positive mt-1">Ожидаемый доход</div>
              </div>
              <div className="bg-curai-positiveBg rounded-md p-4 text-center">
                <div className="text-2xl font-semibold text-curai-positive ">
                  {formatMoney(data.totals.total_paid)}
                </div>
                <div className="text-sm text-curai-positive mt-1">Оплачено</div>
              </div>
              <div className="bg-curai-negativeBg rounded-md p-4 text-center">
                <div className="text-2xl font-semibold text-curai-negative ">
                  {formatMoney(data.totals.total_outstanding)}
                </div>
                <div className="text-sm text-curai-negative mt-1">Задолженность</div>
              </div>
            </div>
          )}

          {/* Таблица пациентов */}
          {data.patients && data.patients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-curai-surface ">
                <thead>
                  <tr className="bg-curai-subtle text-curai-muted ">
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
                <tbody className="divide-y divide-curai-border ">
                  {data.patients.map((patient, index) => {
                    const outstanding = patient.total_expected - patient.total_paid;
                    return (
                      <tr key={patient.patient_id || index} className="hover:bg-curai-subtle transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-curai-ink ">
                          {patient.patient_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-curai-muted ">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-selected text-curai-blue ">
                            {patient.room_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-curai-ink text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-curai-subtle text-curai-ink text-xs font-semibold">
                            {patient.plans_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-curai-ink text-right font-medium">
                          {formatMoney(patient.total_expected)}
                        </td>
                        <td className="px-4 py-3 text-sm text-curai-positive text-right font-medium">
                          {formatMoney(patient.total_paid)}
                        </td>
                        <td className="px-4 py-3 text-sm text-curai-negative text-right font-medium">
                          {formatMoney(outstanding)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-curai-muted ">
              <div className="text-2xl mb-3">📭</div>
              <p>Нет пациентов, использовавших эту услугу в выбранный период</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 bg-curai-subtle border-t border-curai-border -mx-6 -mb-6 rounded-b-md">
            <p className="text-sm text-curai-muted ">
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

