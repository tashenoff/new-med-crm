import { useState, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const usePatients = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);

  // Получить всех пациентов
  const fetchPatients = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Создаем параметры запроса
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.is_returning) params.append('is_returning', filters.is_returning);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const url = `${API}/patients${params.toString() ? '?' + params.toString() : ''}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setPatients(response.data);
    } catch (error) {
      console.error('Ошибка при загрузке пациентов:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Создать нового пациента
  const createPatient = useCallback(async (patientData) => {
    try {
      console.log('🔍 Отправляемые данные пациента:', patientData);
      console.log('🔍 Тип patientData:', typeof patientData);
      console.log('🔍 Ключи patientData:', Object.keys(patientData || {}));

      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/patients`, patientData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔍 Ответ сервера при создании:', response.data);
      console.log('🔍 ID созданного пациента:', response.data.id || response.data._id);

      // НЕ обновляем локальный список здесь - это делается в компоненте после создания
      // setPatients(prev => [...prev, response.data]);

      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при создании пациента:', error);
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

      const errorMessage = error.response?.data?.detail || 'Ошибка при создании пациента';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Обновить пациента
  const updatePatient = useCallback(async (id, patientData) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API}/patients/${id}`, patientData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // НЕ обновляем локальный список здесь - это делается в компоненте после обновления
      // setPatients(prev => ...);

      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при обновлении пациента:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при обновлении пациента';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Удалить пациента
  const deletePatient = useCallback(async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/patients/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // НЕ обновляем локальный список здесь - это делается в компоненте после удаления
      // setPatients(prev => ...);

      return { success: true };
    } catch (error) {
      console.error('Ошибка при удалении пациента:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при удалении пациента';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Получить пациента по ID
  const getPatientById = useCallback((id) => {
    return patients.find(patient => patient._id === id);
  }, [patients]);

  // Поиск пациентов
  const searchPatients = useCallback((searchTerm) => {
    if (!searchTerm) return patients;
    
    const term = searchTerm.toLowerCase();
    return patients.filter(patient => 
      patient.full_name?.toLowerCase().includes(term) ||
      patient.phone?.includes(term) ||
      patient.email?.toLowerCase().includes(term)
    );
  }, [patients]);

  return {
    patients,
    loading,
    fetchPatients,
    createPatient,
    updatePatient,
    deletePatient,
    getPatientById,
    searchPatients
  };
};
