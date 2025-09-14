/**
 * Менеджер для обработки drag & drop операций
 */
export class DragDropManager {
  constructor({ 
    appointments, 
    rooms, 
    patients, 
    doctors, 
    onMoveAppointment,
    checkTimeConflicts,
    canAppointmentFitInSchedule,
    getAvailableDoctorForSlot 
  }) {
    this.appointments = appointments;
    this.rooms = rooms;
    this.patients = patients;
    this.doctors = doctors;
    this.onMoveAppointment = onMoveAppointment;
    this.checkTimeConflicts = checkTimeConflicts;
    this.canAppointmentFitInSchedule = canAppointmentFitInSchedule;
    this.getAvailableDoctorForSlot = getAvailableDoctorForSlot;
  }

  /**
   * Обработчик начала перетаскивания
   */
  handleDragStart = (e, appointmentId) => {
    e.dataTransfer.setData('appointmentId', appointmentId);
  };

  /**
   * Обработчик drag over
   */
  handleDragOver = (e) => {
    e.preventDefault();
  };

  /**
   * Вычисляет доступное время окончания для слота
   */
  calculateSlotEndTime = (room, date, time) => {
    if (!room || !room.schedule) return null;
    
    const dayOfWeek = new Date(date).getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const activeSchedule = room.schedule.find(schedule => 
      schedule.day_of_week === adjustedDayOfWeek &&
      schedule.is_active &&
      time >= schedule.start_time &&
      time < schedule.end_time
    );
    
    return activeSchedule ? activeSchedule.end_time : null;
  };

  /**
   * Обработчик drop
   */
  handleDrop = (e, roomId, date, time) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData('appointmentId');
    
    
    if (!appointmentId || !this.onMoveAppointment) {
      return;
    }

    // Находим перемещаемую запись
    const movingAppointment = this.appointments.find(apt => 
      (apt._id || apt.id) === appointmentId
    );
    
    if (!movingAppointment) {
      alert('Запись не найдена');
      return;
    }

    // Проверяем помещается ли запись в расписание
    const room = this.rooms.find(r => r.id === roomId);
    const endTime = movingAppointment.end_time || null;
    
    if (room && endTime && !this.canAppointmentFitInSchedule(room, date, time, endTime)) {
      const appointmentDuration = `${movingAppointment.appointment_time} - ${endTime}`;
      const targetSlotEnd = this.calculateSlotEndTime(room, date, time);
      
      alert(
        `❌ ЗАПРЕЩЕНО: Запись НЕ ПОМЕЩАЕТСЯ в новое место!\n\n` +
        `Продолжительность записи: ${appointmentDuration}\n` +
        `Доступное время в новом слоте: ${time} - ${targetSlotEnd || 'конец рабочего дня'}\n\n` +
        `КАРТОЧКА ОСТАЕТСЯ НА ПРЕЖНЕМ МЕСТЕ.`
      );
      return; // ЖЕСТКО блокируем перемещение
    }

    // Проверяем конфликты времени
    const conflicts = this.checkTimeConflicts(roomId, date, time, endTime, appointmentId);
    if (conflicts.length > 0) {
      const conflictNames = conflicts.map(apt => {
        const patient = this.patients.find(p => p.id === apt.patient_id);
        return patient ? patient.full_name : 'Неизвестный пациент';
      }).join(', ');
      
      const confirm = window.confirm(
        `Время пересекается с другими записями: ${conflictNames}.\n\n` +
        `Перемещаемая запись: ${time}${endTime ? ` - ${endTime}` : ''}\n` +
        `Конфликтующие записи: ${conflicts.map(apt => 
          `${apt.appointment_time}${apt.end_time ? ` - ${apt.end_time}` : ''}`
        ).join(', ')}\n\n` +
        `Продолжить перемещение?`
      );
      
      if (!confirm) {
        return;
      }
    }

    // Определяем целевого врача
    const originalDoctorId = movingAppointment.doctor_id;
    const availableDoctor = this.getAvailableDoctorForSlot(room, date, time);
    
    let targetDoctorId;
    
    // Если в новом кабинете работает тот же врач - сохраняем его
    if (availableDoctor && availableDoctor.id === originalDoctorId) {
      targetDoctorId = originalDoctorId;
    } else if (availableDoctor) {
      // СНАЧАЛА проверяем помещается ли запись в расписание НОВОГО врача
      if (endTime && !this.canAppointmentFitInSchedule(room, date, time, endTime)) {
        const appointmentDuration = `${movingAppointment.appointment_time} - ${endTime}`;
        const newDoctorName = availableDoctor.full_name;
        const targetSlotEnd = this.calculateSlotEndTime(room, date, time);
        
        alert(
          `❌ НЕВОЗМОЖНО: Запись НЕ ПОМЕЩАЕТСЯ в расписание нового врача!\n\n` +
          `Врач: ${newDoctorName}\n` +
          `Продолжительность записи: ${appointmentDuration}\n` +
          `Доступное время врача: ${time} - ${targetSlotEnd || 'конец рабочего дня'}\n\n` +
          `КАРТОЧКА ОСТАЕТСЯ НА ПРЕЖНЕМ МЕСТЕ.`
        );
        return; // ЖЕСТКО блокируем смену врача
      }
      
      // Если помещается - спрашиваем пользователя
      const confirmDoctorChange = window.confirm(
        `Внимание! В кабинете "${room.name}" в это время работает другой врач: ${availableDoctor.full_name}.\n\n` +
        `Оригинальный врач: ${this.doctors.find(d => d.id === originalDoctorId)?.full_name || 'Неизвестный'}\n` +
        `Новый врач: ${availableDoctor.full_name}\n\n` +
        `Переназначить запись на нового врача?`
      );
      
      if (!confirmDoctorChange) {
        return;
      }
      
      targetDoctorId = availableDoctor.id;
    } else {
      alert('В это время в данном кабинете нет доступного врача');
      return;
    }
    
    // Вызываем перемещение
    this.onMoveAppointment(appointmentId, targetDoctorId, date, time, roomId);
  };
}
