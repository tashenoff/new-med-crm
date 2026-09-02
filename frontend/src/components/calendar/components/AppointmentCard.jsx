import React from 'react';

/**
 * Карточка записи пациента
 */
const AppointmentCard = ({
  appointment,
  patient,
  doctor,
  height = 64, // Высота по умолчанию
  canEdit,
  onEdit,
  onDragStart,
  onDragEnd
}) => {
  // Обработчик начала перетаскивания
  const handleDragStart = (e) => {
    console.log('🚀 CARD DRAG START:', appointment.id);
    
    // Настраиваем drag операцию
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData('text/plain', appointment.id);
    
    if (onDragStart) {
      onDragStart(appointment);
    }
  };

  // Обработчик окончания перетаскивания
  const handleDragEnd = (e) => {
    console.log('🏁 CARD DRAG END:', appointment.id);
    
    if (onDragEnd) {
      onDragEnd();
    }
  };

  // Обработчик клика по карточке
  const handleClick = (e) => {
    e.stopPropagation(); // Предотвращаем всплытие к слоту
    
    if (onEdit) {
      onEdit(appointment);
    }
  };

  // Получаем имена с fallback на данные из appointment (бэкенд возвращает patient_name/doctor_name)
  const patientName = patient?.full_name || patient?.name || appointment.patient_name || 'Загрузка...';
  const doctorName = doctor?.full_name || doctor?.name || appointment.doctor_name || 'Загрузка...';

  // Цвет фона карточки в зависимости от статуса, текст всегда чёрный
  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-gray-900';
      case 'confirmed': return 'bg-green-100 text-gray-900';
      case 'completed': return 'bg-gray-100 text-gray-900';
      case 'cancelled': return 'bg-red-100 text-gray-900';
      default: return 'bg-blue-100 text-gray-900';
    }
  };

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`
        appointment-card absolute top-1 left-1 right-1 p-2 rounded cursor-pointer
        transition-all duration-200 hover:shadow-md
        ${getStatusColor(appointment.status)}
        ${canEdit ? 'cursor-move' : 'cursor-pointer'}
      `}
      style={{ height: `${height - 8}px` }}
    >
      {/* Время */}
      <div className="text-xs font-medium mb-1">
        {appointment.appointment_time}
      </div>
      
      {/* Имя пациента */}
      <div className="text-sm font-semibold mb-1 truncate">
        {patientName === 'Загрузка...' ? (
          <div className="h-4 bg-gray-300 rounded animate-pulse w-20"></div>
        ) : patientName}
      </div>
      
      {/* Врач */}
      {doctor && (
        <div className="text-xs truncate">
          {doctorName === 'Загрузка...' ? (
            <div className="h-3 bg-gray-300 rounded animate-pulse w-16"></div>
          ) : `Врач: ${doctorName}`}
        </div>
      )}
      
      {/* Статус */}
      <div className="text-xs opacity-75 mt-1">
        {appointment.status === 'scheduled' && 'Запланировано'}
        {appointment.status === 'confirmed' && 'Подтверждено'}
        {appointment.status === 'completed' && 'Выполнено'}
        {appointment.status === 'cancelled' && 'Отменено'}
      </div>
    </div>
  );
};

export default AppointmentCard;