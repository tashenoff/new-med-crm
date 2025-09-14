import { useState, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const usePatients = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);

  // Получить всех пациентов
  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/patients`);
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
      const response = await axios.post(`${API}/patients`, patientData);
      
      // Обновляем локальный список
      setPatients(prev => [...prev, response.data]);
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Ошибка при создании пациента:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при создании пациента';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Обновить пациента
  const updatePatient = useCallback(async (id, patientData) => {
    try {
      const response = await axios.put(`${API}/patients/${id}`, patientData);
      
      // Обновляем локальный список
      setPatients(prev => 
        prev.map(patient => {
          const patientId = patient._id || patient.id;
          return String(patientId) === String(id) ? response.data : patient;
        })
      );
      
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
      await axios.delete(`${API}/patients/${id}`);
      
      // Обновляем локальный список
      setPatients(prev => prev.filter(patient => {
        const patientId = patient._id || patient.id;
        return String(patientId) !== String(id);
      }));
      
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
