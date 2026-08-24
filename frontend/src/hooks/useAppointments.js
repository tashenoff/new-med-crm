import { useState, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Вспомогательная функция для очистки данных записи
const cleanAppointmentData = (appointmentData) => {
  const cleanData = { ...appointmentData };
  delete cleanData.chair_number; // Удалено поле chair_number
  
  // Конвертируем price в число если оно не пустое
  if (cleanData.price !== undefined && cleanData.price !== '') {
    cleanData.price = parseFloat(cleanData.price) || 0;
  } else {
    cleanData.price = 0;
  }
  
  // Обработка депозита
  if (cleanData.deposit !== undefined && cleanData.deposit !== '' && cleanData.deposit !== null) {
    cleanData.deposit = parseFloat(cleanData.deposit) || 0;
  }
  
  // Логируем данные депозита для отладки
  if (cleanData.deposit || cleanData.deposit_type) {
    console.log('💰 useAppointments: Депозит в данных записи:', {
      deposit: cleanData.deposit,
      deposit_type: cleanData.deposit_type,
      price: cleanData.price
    });
  }
  
  return cleanData;
};

export const useAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Простая обертка для setAppointments
  const setAppointmentsWithLog = (newAppointments) => {
    console.log(`📊 APPOINTMENTS UPDATE: ${appointments.length} -> ${newAppointments.length} записей`);
    setAppointments(newAppointments);
  };

  // Получить все записи
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 useAppointments: fetchAppointments - загружаем с сервера', `${API}/appointments`);
      const response = await axios.get(`${API}/appointments`);
      console.log('🔄 useAppointments: fetchAppointments - получили', response.data.length, 'записей');
      
      if (response.data.length > 0) {
        console.log('🔄 useAppointments: Первая запись из ответа:', response.data[0]);
        console.log('🔄 useAppointments: Все записи:', response.data);
      } else {
        console.warn('⚠️ useAppointments: Сервер вернул пустой массив записей!');
      }
      
      setAppointmentsWithLog(response.data);
    } catch (error) {
      console.error('❌ useAppointments: Ошибка при загрузке записей:', error);
      console.error('❌ URL:', `${API}/appointments`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Создать новую запись
  const createAppointment = useCallback(async (appointmentData) => {
    try {
      const cleanData = cleanAppointmentData(appointmentData);
      
      const response = await axios.post(`${API}/appointments`, cleanData);
      
      // Обновляем локальный список
      setAppointments(prev => [...prev, response.data]);
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при создании записи:', error);
      let errorMessage = 'Ошибка при создании записи';
      
      if (error.response?.data?.detail) {
        // Если detail - это массив ошибок валидации
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail.map(err => 
            `${err.loc ? err.loc.join('.') + ': ' : ''}${err.msg}`
          ).join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return { success: false, error: errorMessage };
    }
  }, []);

  // Обновить запись
  const updateAppointment = useCallback(async (id, appointmentData) => {
    try {
      const cleanData = cleanAppointmentData(appointmentData);
      const response = await axios.put(`${API}/appointments/${id}`, cleanData);
      
      // НЕ обновляем локальное состояние - пусть вызывающий код делает fetchAppointments()
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при обновлении записи:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при обновлении записи';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Удалить запись
  const deleteAppointment = useCallback(async (id) => {
    try {
      await axios.delete(`${API}/appointments/${id}`);
      
      // Обновляем локальный список
      setAppointments(prev => prev.filter(appointment => (appointment.id || appointment._id) !== id));
      
      return { success: true };
    } catch (error) {
      console.error('Ошибка при удалении записи:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при удалении записи';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Обновить статус записи
  const updateAppointmentStatus = useCallback(async (id, status) => {
    try {
      const response = await axios.patch(`${API}/appointments/${id}/status`, { status });
      
      // Обновляем локальный список
      setAppointments(prev => 
        prev.map(appointment => 
          (appointment.id || appointment._id) === id ? { ...appointment, status } : appointment
        )
      );
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при обновлении статуса записи:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при обновлении статуса';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Переместить запись (drag & drop)
  const moveAppointment = useCallback(async (id, newDate, newTime, newRoomId) => {
    console.log(`🚀 MOVE APPOINTMENT: id=${id}, date=${newDate}, time=${newTime}, roomId=${newRoomId}`);
    try {
      // Находим оригинальную запись чтобы вычислить новый end_time
      const originalAppointment = appointments.find(apt => 
        String(apt.id || apt._id) === String(id)
      );
      
      const updateData = {
        appointment_date: newDate,
        appointment_time: newTime,
        room_id: newRoomId
      };
      
      // ВАЖНО: Пересчитываем end_time если была оригинальная продолжительность
      if (originalAppointment && originalAppointment.end_time) {
        const originalStart = originalAppointment.appointment_time;
        const originalEnd = originalAppointment.end_time;
        
        // Вычисляем продолжительность в минутах
        const [startHour, startMin] = originalStart.split(':').map(Number);
        const [endHour, endMin] = originalEnd.split(':').map(Number);
        const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
        
        // Вычисляем новый end_time
        const [newHour, newMin] = newTime.split(':').map(Number);
        const newEndTotalMinutes = (newHour * 60 + newMin) + durationMinutes;
        const newEndHour = Math.floor(newEndTotalMinutes / 60);
        const newEndMin = newEndTotalMinutes % 60;
        
        updateData.end_time = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;
        
        console.log(`⏰ Пересчитан end_time: ${originalStart}-${originalEnd} -> ${newTime}-${updateData.end_time} (${durationMinutes} мин)`);
      }
      
      console.log(`📤 Отправляем PUT запрос:`, updateData);
      const response = await axios.put(`${API}/appointments/${id}`, updateData);
      console.log(`✅ PUT ответ получен:`, response.data);
      
      // Обновляем локальный список
      setAppointments(prev => 
        prev.map(appointment => {
          const appointmentId = appointment.id || appointment._id;
          return String(appointmentId) === String(id) ? response.data : appointment;
        })
      );
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при перемещении записи:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при перемещении записи';
      return { success: false, error: errorMessage };
    }
  }, []);

  return {
    appointments,
    loading,
    fetchAppointments,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    updateAppointmentStatus,
    moveAppointment
  };
};
