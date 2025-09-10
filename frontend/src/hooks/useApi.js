import { useState } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const useApi = () => {
  const [loading, setLoading] = useState(false);

  // Medical Records API
  const checkMedicalRecord = async (patientId) => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/medical-records/${patientId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  };

  const createMedicalRecord = async (recordData) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/medical-records`, recordData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating medical record:', error);
      throw error;
    }
  };

  const updateMedicalRecord = async (patientId, recordData) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/medical-records/${patientId}`, recordData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error updating medical record:', error);
      throw error;
    }
  };

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
          // Для цены и chair_number преобразуем в правильные типы
          if (key === 'price') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              cleanData[key] = numValue;
            }
          } else if (key === 'chair_number') {
            cleanData[key] = String(value);
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

  // Diagnosis API
  const createDiagnosis = async (diagnosisData) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/diagnoses`, diagnosisData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating diagnosis:', error);
      throw error;
    }
  };

  // Medication API
  const createMedication = async (medicationData) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/medications`, medicationData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating medication:', error);
      throw error;
    }
  };

  // Medical Entry API
  const createMedicalEntry = async (entryData) => {
    try {
      console.log('Creating medical entry with data:', entryData);
      const response = await axios.post(`${BACKEND_URL}/api/medical-entries`, entryData, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating medical entry:', error);
      console.error('Error response:', error.response?.data);
      throw error;
    }
  };

  return {
    loading,
    setLoading,
    checkMedicalRecord,
    createMedicalRecord,
    updateMedicalRecord,
    createAppointment,
    updateAppointment,
    createDiagnosis,
    createMedication,
    createMedicalEntry,
    API
  };
};