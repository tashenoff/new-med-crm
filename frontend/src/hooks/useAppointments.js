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
      console.log('🔄 useAppointments: fetchAppointments - загружаем с сервера');
      const response = await axios.get(`${API}/appointments`);
      console.log('🔄 useAppointments: fetchAppointments - получили', response.data.length, 'записей');
      console.log('🔄 useAppointments: проверяем нашу запись в новых данных:', response.data.find(apt => (apt._id || apt.id) === '6cbc8990-5333-4a09-8de7-da6ea02e3710')?.room_id);
      setAppointmentsWithLog(response.data);
    } catch (error) {
      console.error('Ошибка при загрузке записей:', error);
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
      setAppointments(prev => prev.filter(appointment => appointment._id !== id));
      
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
          appointment._id === id ? { ...appointment, status } : appointment
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
      const updateData = {
        appointment_date: newDate,
        appointment_time: newTime,
        room_id: newRoomId
      };
      
      console.log(`📤 Отправляем PUT запрос:`, updateData);
      const response = await axios.put(`${API}/appointments/${id}`, updateData);
      console.log(`✅ PUT ответ получен:`, response.data);
      
      // Обновляем локальный список
      setAppointments(prev => 
        prev.map(appointment => {
          const appointmentId = appointment._id || appointment.id;
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
