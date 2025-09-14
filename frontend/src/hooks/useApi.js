import { useState } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const useApi = () => {
  const [loading, setLoading] = useState(false);


  // Appointments API
  const createAppointment = async (appointmentData) => {
    try {
      // Очищаем данные от пустых строк и приводим к правильным типам
      const cleanData = { ...appointmentData };
      
      // Преобразуем price в число или null
      if (cleanData.price === '' || cleanData.price === null || cleanData.price === undefined) {
        cleanData.price = null;
      } else if (typeof cleanData.price === 'string') {
        cleanData.price = parseFloat(cleanData.price) || null;
      }
      
      // Удаляем пустые строки для опциональных полей
      Object.keys(cleanData).forEach(key => {
        if (cleanData[key] === '') {
          if (key === 'price') {
            cleanData[key] = null;
          } else {
            delete cleanData[key];
          }
        }
      });
      
      console.log('Creating appointment with cleaned data:', cleanData);
      const response = await axios.post(`${BACKEND_URL}/api/appointments`, cleanData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating appointment:', error);
      console.error('Request data:', appointmentData);
      console.error('Response data:', error.response?.data);
      throw error;
    }
  };

  const updateAppointment = async (appointmentId, appointmentData) => {
    try {
      // Очищаем данные от пустых строк и приводим к правильным типам
      const cleanData = {};
      
      Object.entries(appointmentData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          // Для цены преобразуем в правильный тип
          if (key === 'price') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              cleanData[key] = numValue;
            }
          } else {
            cleanData[key] = value;
          }
        }
      });

      console.log('Отправляем данные для обновления записи:', cleanData);
      
      const response = await axios.put(`${BACKEND_URL}/api/appointments/${appointmentId}`, cleanData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error updating appointment:', error);
      console.error('Response data:', error.response?.data);
      throw error;
    }
  };


  // Room functions
  const fetchRoomsWithSchedule = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/rooms-with-schedule`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching rooms:', error);
      throw error;
    }
  };

  const getAvailableDoctorForRoom = async (roomId, dayOfWeek, time) => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/rooms/${roomId}/available-doctor`, {
        params: { day_of_week: dayOfWeek, time },
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching available doctor:', error);
      throw error;
    }
  };

  return {
    loading,
    setLoading,
    createAppointment,
    updateAppointment,
    fetchRoomsWithSchedule,
    getAvailableDoctorForRoom,
    API
  };
};

export default useApi;