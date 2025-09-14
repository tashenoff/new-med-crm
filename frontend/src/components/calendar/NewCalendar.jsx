import React, { useState, useEffect, useCallback } from 'react';
import CalendarContainer from './components/CalendarContainer';
import { useDragContext } from './context/DragContext';

/**
 * Главный компонент нового календаря
 */
const NewCalendar = ({
  appointments = [],
  rooms = [],
  patients = [],
  doctors = [],
  currentDate,
  onDateChange,
  user,
  onSlotClick,
  onEditAppointment,
  onMoveAppointment,
  onNewAppointment,
  canEdit = false
}) => {
  // Состояние для управления drag & drop
  const [draggedAppointment, setDraggedAppointment] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);

  // Генерация временных слотов (с 9:00 до 18:00 с шагом 30 минут)
  const timeSlots = React.useMemo(() => {
    const slots = [];
    for (let hour = 9; hour < 18; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  // Обработчик начала перетаскивания
  const handleDragStart = useCallback((appointment) => {
    console.log('🚀 DRAG START:', appointment.id);
    setDraggedAppointment(appointment);
  }, []);

  // Обработчик окончания перетаскивания
  const handleDragEnd = useCallback(() => {
    console.log('🏁 DRAG END');
    setDraggedAppointment(null);
    setHoveredSlot(null);
  }, []);

  // Обработчик наведения на слот
  const handleSlotHover = useCallback((roomId, time) => {
    if (draggedAppointment) {
      setHoveredSlot({ roomId, time });
    }
  }, [draggedAppointment]);

  // Обработчика покидания слота
  const handleSlotLeave = useCallback(() => {
    setHoveredSlot(null);
  }, []);

  // Обработчик сброса на слот
  const handleSlotDrop = useCallback(async (roomId, time) => {
    if (!draggedAppointment || !onMoveAppointment) return;

    console.log('📥 DROP:', { appointmentId: draggedAppointment.id, roomId, time });
    
    try {
      // Валидация - проверяем есть ли врач в это время
      const room = rooms.find(r => r.id === roomId);
      if (!room) {
        alert('Кабинет не найден');
        return;
      }

      // Здесь можно добавить дополнительную валидацию
      // Например, проверка расписания врача, конфликтов и т.д.

      // Вызываем обработчик перемещения
      await onMoveAppointment(
        draggedAppointment.id,
        draggedAppointment.doctor_id, // Сохраняем текущего врача
        currentDate,
        time,
        roomId
      );

      console.log('✅ Перемещение успешно');
    } catch (error) {
      console.error('❌ Ошибка перемещения:', error);
      alert('Ошибка при перемещении записи');
    }
  }, [draggedAppointment, onMoveAppointment, rooms, currentDate]);

  return (
    <div className="calendar-container bg-white rounded-lg shadow-lg">
      <CalendarContainer
        rooms={rooms}
        timeSlots={timeSlots}
        appointments={appointments}
        patients={patients}
        doctors={doctors}
        currentDate={currentDate}
        canEdit={canEdit}
        // Drag & Drop props
        draggedAppointment={draggedAppointment}
        hoveredSlot={hoveredSlot}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onSlotHover={handleSlotHover}
        onSlotLeave={handleSlotLeave}
        onSlotDrop={handleSlotDrop}
        // Обработчики
        onSlotClick={onSlotClick}
        onEditAppointment={onEditAppointment}
        onNewAppointment={onNewAppointment}
      />
    </div>
  );
};

export default NewCalendar;