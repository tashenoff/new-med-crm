import { useState } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const useMedical = () => {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [medicalSummary, setMedicalSummary] = useState(null);
  const [patientAppointments, setPatientAppointments] = useState([]);

  const fetchMedicalSummary = async (patientId) => {
    try {
      const response = await axios.get(`${API}/patients/${patientId}/medical-summary`);
      setMedicalSummary(response.data);
      
      // Также получаем историю приемов пациента
      await fetchPatientAppointments(patientId);
    } catch (error) {
      console.error('Error fetching medical summary:', error);
      throw new Error('Ошибка при загрузке медицинской карты');
    }
  };

  const fetchPatientAppointments = async (patientId) => {
    try {
      const response = await axios.get(`${API}/appointments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Фильтруем записи только для текущего пациента
      const appointments = response.data.filter(apt => apt.patient_id === patientId);
      setPatientAppointments(appointments);
    } catch (error) {
      console.error('Error fetching patient appointments:', error);
    }
  };

  const selectPatient = async (patient) => {
    setSelectedPatient(patient);
    setMedicalSummary(null);
    setPatientAppointments([]);
    
    try {
      await fetchMedicalSummary(patient.id);
    } catch (error) {
      console.error('Error selecting patient:', error);
    }
  };

  const clearSelection = () => {
    setSelectedPatient(null);
    setMedicalSummary(null);
    setPatientAppointments([]);
  };

  return {
    selectedPatient,
    medicalSummary,
    patientAppointments,
    selectPatient,
    clearSelection,
    fetchMedicalSummary
  };
};