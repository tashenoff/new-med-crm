import { useState, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const useRooms = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);

  // Получить все кабинеты с расписанием
  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 useRooms: fetchRooms - загружаем кабинеты с расписанием');
      const response = await axios.get(`${API}/rooms-with-schedule`);
      console.log('🔄 useRooms: fetchRooms - получили', response.data.length, 'кабинетов с расписанием');
      console.log('🔄 useRooms: первый кабинет с расписанием:', response.data[0]);
      setRooms(response.data);
    } catch (error) {
      console.error('Ошибка при загрузке кабинетов:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Создать кабинет
  const createRoom = useCallback(async (roomData) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API}/rooms`, roomData);
      setRooms(prev => [...prev, response.data]);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при создании кабинета:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при создании кабинета';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Обновить кабинет
  const updateRoom = useCallback(async (id, roomData) => {
    try {
      setLoading(true);
      const response = await axios.put(`${API}/rooms/${id}`, roomData);
      setRooms(prev => prev.map(room => 
        room.id === id ? response.data : room
      ));
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при обновлении кабинета:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при обновлении кабинета';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Удалить кабинет
  const deleteRoom = useCallback(async (id) => {
    try {
      setLoading(true);
      await axios.delete(`${API}/rooms/${id}`);
      setRooms(prev => prev.filter(room => room.id !== id));
      return { success: true };
    } catch (error) {
      console.error('Ошибка при удалении кабинета:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при удалении кабинета';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    rooms,
    loading,
    fetchRooms,
    createRoom,
    updateRoom,
    deleteRoom
  };
};
