import React, { useState } from 'react';

const ScheduleView = ({ 
  appointments, 
  doctors, 
  patients, 
  user, 
  onNewAppointment, 
  onEditAppointment, 
  onDeleteAppointment,
  onStatusChange,
  canEdit 
}) => {
  const [draggedAppointment, setDraggedAppointment] = useState(null);

  const getScheduleAppointments = () => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);
    
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];
    const toDate = sevenDaysFromNow.toISOString().split('T')[0];
    
    return appointments.filter(apt => 
      apt.appointment_date >= fromDate && apt.appointment_date <= toDate
    ).sort((a, b) => {
      if (a.appointment_date !== b.appointment_date) {
        return a.appointment_date.localeCompare(b.appointment_date);
      }
      return a.appointment_time.localeCompare(b.appointment_time);
    });
  };

  const scheduleAppointments = getScheduleAppointments();

  // Канбан колонки с статусами
  const kanbanColumns = [
    {
      id: 'unconfirmed',
      title: 'Не подтверждено',
      color: 'bg-yellow-50 border-yellow-200',
      headerColor: 'bg-yellow-100 text-yellow-800'
    },
    {
      id: 'confirmed',
      title: 'Подтверждено',
      color: 'bg-blue-50 border-blue-200',
      headerColor: 'bg-blue-100 text-blue-800'
    },
    {
      id: 'arrived',
      title: 'Пациент пришел',
      color: 'bg-purple-50 border-purple-200',
      headerColor: 'bg-purple-100 text-purple-800'
    },
    {
      id: 'in_progress',
      title: 'На приеме',
      color: 'bg-orange-50 border-orange-200',
      headerColor: 'bg-orange-100 text-orange-800'
    },
    {
      id: 'completed',
      title: 'Завершено',
      color: 'bg-green-50 border-green-200',
      headerColor: 'bg-green-100 text-green-800'
    },
    {
      id: 'cancelled',
      title: 'Отменено',
      color: 'bg-red-50 border-red-200',
      headerColor: 'bg-red-100 text-red-800'
    },
    {
      id: 'no_show',
      title: 'Не явился',
      color: 'bg-gray-50 border-gray-200',
      headerColor: 'bg-gray-100 text-gray-800'
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'unconfirmed': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'arrived': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'in_progress': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      case 'no_show': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'unconfirmed': return 'Не подтвержден';
      case 'confirmed': return 'Подтвержден';
      case 'arrived': return 'Пациент пришел';
      case 'in_progress': return 'В процессе';
      case 'completed': return 'Завершен';
      case 'cancelled': return 'Отменен';
      case 'no_show': return 'Не явился';
      default: return 'Не подтвержден';
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Расписание (±7 дней)</h2>
        {canEdit && (
          <button
            onClick={onNewAppointment}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новая запись
          </button>
        )}
      </div>

      {scheduleAppointments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Записей на прием нет</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {scheduleAppointments.map(appointment => (
            <div key={appointment.id} className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-lg">
                    {appointment.patient_name}
                  </div>
                  <div className="text-gray-600 mt-1">
                    Врач: {appointment.doctor_name} ({appointment.doctor_specialty})
                  </div>
                  <div className="text-gray-600">
                    📅 {appointment.appointment_date} в {appointment.appointment_time}
                    {appointment.end_time && ` - ${appointment.end_time}`}
                  </div>
                  {appointment.chair_number && (
                    <div className="text-gray-600">
                      🪑 Кресло: {appointment.chair_number}
                    </div>
                  )}
                  {appointment.price && (
                    <div className="text-green-600 font-medium">
                      💰 Цена: {appointment.price} ₸
                    </div>
                  )}
                  {appointment.reason && (
                    <div className="text-gray-600">
                      Причина: {appointment.reason}
                    </div>
                  )}
                  {appointment.notes && (
                    <div className="text-gray-600">
                      Заметки: {appointment.notes}
                    </div>
                  )}
                  {appointment.patient_notes && (
                    <div className="text-gray-600">
                      Заметки о пациенте: {appointment.patient_notes}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col items-end space-y-2">
                  <span className={`px-2 py-1 text-xs rounded font-medium ${getStatusColor(appointment.status)}`}>
                    {getStatusText(appointment.status)}
                  </span>
                  
                  {canEdit && (
                    <div className="flex space-x-2">
                      <select
                        value={appointment.status}
                        onChange={(e) => onStatusChange(appointment.id, e.target.value)}
                        className="text-xs border rounded px-2 py-1"
                      >
                        <option value="pending">Не подтвержден</option>
                        <option value="confirmed">Подтвержден</option>
                        <option value="in_progress">В процессе</option>
                        <option value="completed">Завершен</option>
                        <option value="cancelled">Отменен</option>
                      </select>
                      
                      <button
                        onClick={() => onEditAppointment(appointment)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        ✏️
                      </button>
                      
                      <button
                        onClick={() => onDeleteAppointment(appointment.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScheduleView;