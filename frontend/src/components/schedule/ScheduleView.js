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
  const [dragOverColumn, setDragOverColumn] = useState(null);

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
      headerColor: 'bg-yellow-100 text-yellow-800',
      icon: '⏳'
    },
    {
      id: 'confirmed',
      title: 'Подтверждено',
      color: 'bg-blue-50 border-blue-200',
      headerColor: 'bg-blue-100 text-blue-800',
      icon: '✅'
    },
    {
      id: 'arrived',
      title: 'Пациент пришел',
      color: 'bg-purple-50 border-purple-200',
      headerColor: 'bg-purple-100 text-purple-800',
      icon: '🏥'
    },
    {
      id: 'in_progress',
      title: 'На приеме',
      color: 'bg-orange-50 border-orange-200',
      headerColor: 'bg-orange-100 text-orange-800',
      icon: '🔄'
    },
    {
      id: 'completed',
      title: 'Завершено',
      color: 'bg-green-50 border-green-200',
      headerColor: 'bg-green-100 text-green-800',
      icon: '✔️'
    },
    {
      id: 'cancelled',
      title: 'Отменено',
      color: 'bg-red-50 border-red-200',
      headerColor: 'bg-red-100 text-red-800',
      icon: '❌'
    },
    {
      id: 'no_show',
      title: 'Не явился',
      color: 'bg-gray-50 border-gray-200',
      headerColor: 'bg-gray-100 text-gray-800',
      icon: '👻'
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

  // Группировка встреч по статусам
  const getAppointmentsByStatus = (status) => {
    return scheduleAppointments.filter(apt => apt.status === status);
  };

  // Drag & Drop функции с улучшенной визуализацией
  const handleDragStart = (e, appointment) => {
    if (!canEdit) return;
    
    setDraggedAppointment(appointment);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', appointment.id);
    
    // Создаем кастомное изображение для перетаскивания
    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        background: white; 
        border: 2px dashed #3B82F6; 
        border-radius: 8px; 
        padding: 12px; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: system-ui;
        font-size: 14px;
        max-width: 200px;
      ">
        <div style="font-weight: bold; color: #1F2937;">📋 ${appointment.patient_name}</div>
        <div style="color: #6B7280; margin-top: 4px;">🕒 ${appointment.appointment_time}</div>
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    
    // Устанавливаем кастомное изображение
    e.dataTransfer.setDragImage(dragImage, 100, 30);
    
    // Удаляем элемент после установки
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
    
    console.log('🔄 Начинаем перетаскивание:', appointment.patient_name);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragEnter = (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = (e, columnId) => {
    e.preventDefault();
    // Проверяем, действительно ли мы покинули колонку
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    
    if (!canEdit || !draggedAppointment) return;
    
    const appointmentId = e.dataTransfer.getData('text/plain');
    
    if (draggedAppointment.status !== newStatus) {
      console.log(`🔄 Меняем статус записи ${draggedAppointment.patient_name} с "${draggedAppointment.status}" на "${newStatus}"`);
      onStatusChange(draggedAppointment.id, newStatus);
      
      // Показываем уведомление об успехе
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div style="
          position: fixed; 
          top: 20px; 
          right: 20px; 
          background: #10B981; 
          color: white; 
          padding: 12px 20px; 
          border-radius: 8px; 
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          font-family: system-ui;
        ">
          ✅ Статус изменен: ${draggedAppointment.patient_name}
        </div>
      `;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    }
    
    setDraggedAppointment(null);
  };

  const handleDragEnd = () => {
    setDraggedAppointment(null);
    setDragOverColumn(null);
    console.log('🔄 Перетаскивание завершено');
  };

  // Компонент карточки встречи с улучшенным drag & drop
  const AppointmentCard = ({ appointment }) => {
    const isDragging = draggedAppointment?.id === appointment.id;
    
    return (
      <div
        draggable={canEdit}
        onDragStart={(e) => handleDragStart(e, appointment)}
        onDragEnd={handleDragEnd}
        className={`
          bg-white p-4 rounded-lg shadow-sm border-l-4 mb-3 transition-all duration-300
          ${canEdit ? 'cursor-move hover:shadow-lg hover:scale-105' : 'cursor-default'}
          ${isDragging ? 'opacity-30 transform rotate-3 scale-95 shadow-2xl' : 'opacity-100'}
          ${getStatusColor(appointment.status).replace('bg-', 'border-').replace('text-', '').replace('100', '400')}
        `}
        style={{
          transform: isDragging ? 'rotate(5deg) scale(0.95)' : 'none',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        {/* Индикатор перетаскивания */}
        {canEdit && (
          <div className="absolute top-2 right-2 text-gray-400 text-lg opacity-70">
            ⋮⋮
          </div>
        )}
        
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            {/* Имя пациента с иконкой */}
            <div className="font-semibold text-lg truncate flex items-center">
              <span className="mr-2">👤</span>
              {appointment.patient_name}
            </div>
            
            {/* Врач */}
            <div className="text-gray-600 text-sm flex items-center mt-1">
              👨‍⚕️ {appointment.doctor_name} 
              <span className="ml-1 text-xs text-gray-500">({appointment.doctor_specialty})</span>
            </div>
            
            {/* Дата и время */}
            <div className="text-gray-600 text-sm flex items-center mt-2 bg-gray-50 rounded px-2 py-1">
              📅 {appointment.appointment_date} в {appointment.appointment_time}
              {appointment.end_time && ` - ${appointment.end_time}`}
            </div>
            
            {/* Дополнительная информация в ряд */}
            <div className="flex flex-wrap gap-2 mt-2">
              {appointment.chair_number && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  🪑 Кресло {appointment.chair_number}
                </span>
              )}
              
              {appointment.price && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                  💰 {appointment.price} ₸
                </span>
              )}
            </div>
            
            {/* Причина */}
            {appointment.reason && (
              <div className="text-gray-600 text-sm mt-2 p-2 bg-yellow-50 rounded border-l-2 border-yellow-300">
                📝 {appointment.reason}
              </div>
            )}
            
            {/* Заметки */}
            {appointment.notes && (
              <div className="text-gray-500 text-xs mt-2 p-2 bg-gray-50 rounded">
                💭 {appointment.notes}
              </div>
            )}
            
            {/* Заметки о пациенте */}
            {appointment.patient_notes && (
              <div className="text-gray-500 text-xs mt-2 p-2 bg-purple-50 rounded">
                👤 {appointment.patient_notes}
              </div>
            )}
          </div>
          
          {/* Действия */}
          {canEdit && (
            <div className="flex flex-col space-y-1 ml-2">
              {/* Переключение статуса */}
              <div className="relative group">
                <button
                  className="text-purple-600 hover:text-purple-800 p-2 rounded-full hover:bg-purple-50 transition-colors"
                  title="Изменить статус"
                >
                  🔄
                </button>
                
                {/* Dropdown статусов */}
                <div className="absolute right-0 top-10 hidden group-hover:block z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
                  {[
                    { id: 'unconfirmed', text: 'Не подтвержден', icon: '⏳' },
                    { id: 'confirmed', text: 'Подтвержден', icon: '✅' },
                    { id: 'arrived', text: 'Пациент пришел', icon: '🚪' },
                    { id: 'in_progress', text: 'В процессе', icon: '⚕️' },
                    { id: 'completed', text: 'Завершен', icon: '✅' },
                    { id: 'cancelled', text: 'Отменен', icon: '❌' },
                    { id: 'no_show', text: 'Не явился', icon: '👻' }
                  ].filter(status => status.id !== appointment.status).map(status => (
                    <button
                      key={status.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(appointment.id, status.id);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center"
                    >
                      <span className="mr-2">{status.icon}</span>
                      {status.text}
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditAppointment(appointment);
                }}
                className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                title="Редактировать"
              >
                ✏️
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteAppointment(appointment.id);
                }}
                className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
                title="Удалить"
              >
                🗑️
              </button>
            </div>
          )}
        </div>
        
        {/* Статус бейдж */}
        <div className="mt-3 flex justify-between items-center">
          <span className={`px-3 py-1 text-xs rounded-full font-medium flex items-center ${getStatusColor(appointment.status)}`}>
            <span className="mr-1">{kanbanColumns.find(col => col.id === appointment.status)?.icon || '📋'}</span>
            {getStatusText(appointment.status)}
          </span>
          
          {/* Инструкция по перетаскиванию */}
          {canEdit && (
            <span className="text-xs text-gray-400 italic">
              Перетащите для смены статуса
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Расписание - Канбан (±7 дней)</h2>
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
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
          {kanbanColumns.map(column => {
            const columnAppointments = getAppointmentsByStatus(column.id);
            const isDropTarget = dragOverColumn === column.id;
            const canDropHere = draggedAppointment && draggedAppointment.status !== column.id;
            
            return (
              <div
                key={column.id}
                className={`
                  flex-shrink-0 w-80 border-2 rounded-lg transition-all duration-300
                  ${column.color}
                  ${isDropTarget && canDropHere ? 'border-blue-400 shadow-lg scale-105 bg-blue-50' : ''}
                  ${draggedAppointment && !canDropHere ? 'opacity-50' : ''}
                `}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragEnter={(e) => handleDragEnter(e, column.id)}
                onDragLeave={(e) => handleDragLeave(e, column.id)}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Заголовок колонки */}
                <div className={`${column.headerColor} p-4 rounded-t-lg border-b-2 transition-colors duration-300`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <span className="text-2xl mr-2">{column.icon}</span>
                      <h3 className="font-semibold text-lg">{column.title}</h3>
                    </div>
                    <span className="bg-white bg-opacity-70 text-sm px-3 py-1 rounded-full font-medium">
                      {columnAppointments.length}
                    </span>
                  </div>
                  
                  {/* Индикатор возможности дропа */}
                  {isDropTarget && canDropHere && (
                    <div className="mt-2 text-sm text-blue-700 font-medium animate-pulse">
                      ⬇️ Отпустите для смены статуса
                    </div>
                  )}
                </div>
                
                {/* Drop зона с визуальным индикатором */}
                <div className={`
                  p-4 min-h-96 transition-all duration-300 relative
                  ${isDropTarget && canDropHere ? 'bg-blue-50 bg-opacity-50' : ''}
                `}>
                  {/* Визуальный индикатор drop зоны */}
                  {isDropTarget && canDropHere && (
                    <div className="absolute inset-0 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50 bg-opacity-30 flex items-center justify-center">
                      <div className="text-blue-600 font-medium text-lg animate-bounce">
                        📥 Перенести сюда
                      </div>
                    </div>
                  )}
                  
                  {/* Карточки встреч */}
                  <div className={`space-y-3 ${isDropTarget && canDropHere ? 'relative z-10' : ''}`}>
                    {columnAppointments.map(appointment => (
                      <AppointmentCard 
                        key={appointment.id} 
                        appointment={appointment} 
                      />
                    ))}
                    
                    {/* Пустое состояние */}
                    {columnAppointments.length === 0 && !isDropTarget && (
                      <div className="text-center py-8 text-gray-400">
                        <div className="text-4xl mb-2">{column.icon}</div>
                        <p className="text-sm font-medium">Нет записей</p>
                        {canEdit && (
                          <p className="text-xs mt-2 text-gray-500">
                            Перетащите карточку сюда для смены статуса
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScheduleView;