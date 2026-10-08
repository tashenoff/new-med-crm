import React, { useState, useEffect } from 'react';
import { ledgerFetch, positiveKzt, requireSessionId } from '../../utils/accountingLedger';

const AppointmentsSchedule = ({ patientId }) => {
  const [appointments, setAppointments] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [sessionPayment, setSessionPayment] = useState(null);
  const [sessionAmount, setSessionAmount] = useState('');
  const [commandLoading, setCommandLoading] = useState(false);

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (patientId) {
      fetchAppointments();
    }
  }, [patientId, currentDate]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${patientId}/treatment-plans`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        processAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const processAppointments = (treatmentPlans) => {
    const courseServices = [];
    
    treatmentPlans.forEach(plan => {
      if (plan.services) {
        plan.services.forEach(service => {
          if (service.is_course) {
            courseServices.push({
              ...service,
              planId: plan.id,
              doctorName: plan.doctor_name
            });
          }
        });
      }
    });

    setAppointments(courseServices);
  };

  // Генерация дат для отображения (7 дней начиная с currentDate)
  const generateDates = () => {
    const dates = [];
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  };

  const dates = generateDates();

  // Функция для проверки, есть ли процедура в этот день
  const getProceduresForDate = (service, date) => {
    if (!service.sessions || service.sessions.length === 0) {
      return [];
    }
    
    const dateStr = date.toISOString().split('T')[0];
    return service.sessions.filter(session => {
      const sessionDate = new Date(session.date).toISOString().split('T')[0];
      return sessionDate === dateStr;
    });
  };

  // Отметить процедуру как выполненную
  const markProcedureComplete = async (service, session) => {
    if (commandLoading || session.completed) return;
    try {
      const session_id = requireSessionId(session);
      setCommandLoading(true);
      await ledgerFetch(`${API}/api/treatment-plans/${service.planId}/service/${service.service_id}/complete`, { session_id, date: session.date });
      await fetchAppointments();
    } catch (error) {
      alert('Ошибка при завершении сеанса: ' + error.message);
    } finally { setCommandLoading(false); }
  };

  // Отметить оплату сессии для курсов с поэтапной оплатой
  const markSessionPaid = async () => {
    if (!sessionPayment || commandLoading) return;
    try {
      const { service, session, operation_id } = sessionPayment;
      const session_id = requireSessionId(session);
      const maximum = Number(session.amount_due_kzt ?? session.price ?? service.session_price ?? service.price_per_unit ?? 0) - Number(session.paid_amount || 0);
      const amount_kzt = positiveKzt(sessionAmount, maximum);
      setCommandLoading(true);
      await ledgerFetch(`${API}/api/treatment-plans/${service.planId}/services/${service.service_id}/sessions/${session_id}/mark-paid`, { session_id, amount_kzt, operation_id });
      setSessionPayment(null);
      setSessionAmount('');
      await fetchAppointments();
    } catch (error) {
      alert('Ошибка при оплате сеанса: ' + error.message);
    } finally { setCommandLoading(false); }
  };

  const formatDate = (date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString('ru-RU', { month: 'short' });
    return `${day} ${month}`;
  };

  const formatWeekday = (date) => {
    return date.toLocaleDateString('ru-RU', { weekday: 'short' });
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  if (loading && appointments.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
        <div className="text-4xl mb-2">📅</div>
        <div className="font-medium">Нет назначений</div>
        <div className="text-sm">Курсовые процедуры будут отображаться здесь</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Фильтры и навигация */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>Показать все</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Сегодня
          </button>
          <button
            onClick={goToPreviousWeek}
            className="px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            ◄
          </button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {formatDate(dates[0])} - {formatDate(dates[6])}
          </span>
          <button
            onClick={goToNextWeek}
            className="px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            ►
          </button>
        </div>
      </div>

      {/* Календарная сетка */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left font-medium min-w-[200px]">
                Назначения
              </th>
              {dates.map((date, index) => (
                <th key={index} className="border border-gray-300 px-2 py-3 text-center min-w-[80px]">
                  <div className="font-medium">{formatDate(date)}</div>
                  <div className="text-xs text-gray-500 font-normal">{formatWeekday(date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appointments.map((service, serviceIndex) => (
              <tr key={serviceIndex} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-3">
                  <div className="font-medium text-gray-900">{service.service_name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    👨‍⚕️ {service.doctorName}
                  </div>
                  <div className="text-xs text-gray-500">
                    📊 {service.quantity_completed || 0} из {service.quantity_total} выполнено
                  </div>
                </td>
                {dates.map((date, dateIndex) => {
                  const procedures = getProceduresForDate(service, date);
                  const hasCompleted = procedures.some(p => p.completed);
                  const expectedCount = service.course_frequency_per_day || 1;
                  const completedCount = procedures.filter(p => p.completed).length;
                  
                  return (
                    <td 
                      key={dateIndex} 
                      className={`border border-gray-300 px-2 py-3 text-center cursor-pointer transition-colors ${
                        hasCompleted ? 'bg-green-100 hover:bg-green-200' : 
                        procedures.length > 0 ? 'bg-yellow-100 hover:bg-yellow-200' : 
                        'hover:bg-blue-50'
                      }`}
                      title={hasCompleted ? 'Выполнено' : 'Выберите конкретный сеанс'}
                    >
                      {procedures.length > 0 ? (
                        <div>
                          <div className="text-lg font-semibold">
                            {completedCount > 0 ? '✅' : '⏳'}
                          </div>
                          <div className="text-xs text-gray-600">
                            {completedCount}/{expectedCount}
                          </div>
                          {procedures.map((session, sessionIndex) => (
                            <div key={session.session_id || session.id || sessionIndex} className="mt-2 space-y-1">
                              <div className="text-xs">Сеанс {sessionIndex + 1}</div>
                              {!session.completed && <button type="button" disabled={commandLoading} className="block text-xs text-blue-700" onClick={() => markProcedureComplete(service, session)}>Завершить сеанс</button>}
                              {!session.paid && !session.is_paid && session.payment_status !== 'paid' && <button type="button" disabled={commandLoading} className="block text-xs text-green-700" onClick={() => {
                                try {
                                  requireSessionId(session);
                                  setSessionPayment({ service, session, operation_id: crypto.randomUUID() });
                                  setSessionAmount('');
                                } catch (error) { alert(error.message); }
                              }}>Оплатить сеанс</button>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-300">−</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sessionPayment && <div role="dialog" aria-label="Оплата сеанса" className="p-4 border rounded bg-white">
        <label className="block">Фактически получено за сеанс, ₸
          <input aria-label="Фактически получено за сеанс, ₸" type="number" min="0.01" step="0.01" required value={sessionAmount} disabled={commandLoading} onChange={event => setSessionAmount(event.target.value)} className="border rounded p-2" />
        </label>
        <button type="button" disabled={commandLoading} onClick={markSessionPaid} className="p-2 text-green-700">Подтвердить оплату</button>
        <button type="button" disabled={commandLoading} onClick={() => setSessionPayment(null)} className="p-2">Отмена</button>
      </div>}
      {/* Легенда */}
      <div className="flex items-center justify-center space-x-6 text-sm text-gray-600">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-green-100 border border-green-300 rounded"></div>
          <span>Выполнено</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-yellow-100 border border-yellow-300 rounded"></div>
          <span>В процессе</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-white border border-gray-300 rounded"></div>
          <span>Не назначено</span>
        </div>
      </div>
    </div>
  );
};

export default AppointmentsSchedule;
