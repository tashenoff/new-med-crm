import { useState } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
      const response = await axios.post(`${BACKEND_URL}/api/appointments`, appointmentData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating appointment:', error);
      throw error;
    }
  };

  const updateAppointment = async (appointmentId, appointmentData) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/appointments/${appointmentId}`, appointmentData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error updating appointment:', error);
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
      const response = await axios.post(`${BACKEND_URL}/api/medical-entries`, entryData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating medical entry:', error);
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