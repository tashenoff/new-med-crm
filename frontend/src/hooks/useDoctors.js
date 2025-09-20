import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const useDoctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  // Получить всех врачей
  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/doctors`);
      setDoctors(response.data);
    } catch (error) {
      console.error('Ошибка при загрузке врачей:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Создать нового врача
  const createDoctor = useCallback(async (doctorData) => {
    try {
      const response = await axios.post(`${API}/doctors`, doctorData);
      
      // Обновляем локальный список
      setDoctors(prev => [...prev, response.data]);
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при создании врача:', error);
      console.error('Детали ошибки:', error.response?.data);
      console.error('Статус ошибки:', error.response?.status);
      
      // Подробное логирование ошибок валидации
      if (error.response?.data?.detail && Array.isArray(error.response.data.detail)) {
        console.error('📋 Подробности ошибок валидации:');
        error.response.data.detail.forEach((err, index) => {
          console.error(`  ${index + 1}. Поле: ${err.loc?.join('.')} | Тип: ${err.type} | Сообщение: ${err.msg}`);
          if (err.input) {
            console.error(`     Полученные данные:`, err.input);
          }
        });
      }
      
      const errorMessage = error.response?.data?.detail || 'Ошибка при создании врача';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Обновить врача
  const updateDoctor = useCallback(async (id, doctorData) => {
    try {
      const response = await axios.put(`${API}/doctors/${id}`, doctorData);
      
      // Обновляем локальный список
      setDoctors(prev => 
        prev.map(doctor => {
          const doctorId = doctor.id || doctor._id;
          return String(doctorId) === String(id) ? response.data : doctor;
        })
      );
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при обновлении врача:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при обновлении врача';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Удалить врача
  const deleteDoctor = useCallback(async (id) => {
    try {
      await axios.delete(`${API}/doctors/${id}`);
      
      // Обновляем локальный список
      setDoctors(prev => prev.filter(doctor => {
        const doctorId = doctor.id || doctor._id;
        return String(doctorId) !== String(id);
      }));
      
      return { success: true };
    } catch (error) {
      console.error('Ошибка при удалении врача:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при удалении врача';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Получить врача по ID
  const getDoctorById = useCallback((id) => {
    return doctors.find(doctor => doctor._id === id);
  }, [doctors]);

  // Получить доступных врачей (активных)
  const getAvailableDoctors = useCallback(() => {
    return doctors.filter(doctor => doctor.status === 'active');
  }, [doctors]);

  // Поиск врачей
  const searchDoctors = useCallback((searchTerm) => {
    if (!searchTerm) return doctors;
    
    const term = searchTerm.toLowerCase();
    return doctors.filter(doctor => 
      doctor.full_name?.toLowerCase().includes(term) ||
      doctor.specialty?.toLowerCase().includes(term) ||
      doctor.phone?.includes(term) ||
      doctor.email?.toLowerCase().includes(term)
    );
  }, [doctors]);

  // Автоматическая загрузка врачей при монтировании хука
  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  return {
    doctors,
    loading,
    fetchDoctors,
    createDoctor,
    updateDoctor,
    deleteDoctor,
    getDoctorById,
    getAvailableDoctors,
    searchDoctors
  };
};
