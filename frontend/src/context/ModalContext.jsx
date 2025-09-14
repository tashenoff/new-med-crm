import React, { createContext, useContext, useState } from 'react';

const ModalContext = createContext();

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export function ModalProvider({ children }) {
  const [modals, setModals] = useState({});

  const openModal = (modalId, props = {}) => {
    setModals(prev => ({
      ...prev,
      [modalId]: {
        isOpen: true,
        props
      }
    }));
  };

  const closeModal = (modalId) => {
    setModals(prev => ({
      ...prev,
      [modalId]: {
        ...prev[modalId],
        isOpen: false
      }
    }));
  };

  const updateModalProps = (modalId, newProps) => {
    setModals(prev => ({
      ...prev,
      [modalId]: {
        ...prev[modalId],
        props: {
          ...prev[modalId]?.props,
          ...newProps
        }
      }
    }));
  };

  const isModalOpen = (modalId) => {
    return modals[modalId]?.isOpen || false;
  };

  const getModalProps = (modalId) => {
    const modalData = modals[modalId];
    const props = modalData?.props || {};
    
    // Добавляем значения по умолчанию для различных модальных окон
    if (modalId === 'appointment') {
      // Если модальное окно не открыто или props пустые, возвращаем defaults
      if (!modalData?.isOpen) {
        return {
          appointmentForm: {},
          setAppointmentForm: () => {},
          patients: [],
          doctors: [],
          editingItem: null,
          loading: false,
          errorMessage: null,
          onSave: () => {},
          onCreatePatient: () => {},
          appointments: []
        };
      }
      
      const result = {
        // Сначала defaults
        appointmentForm: {},
        setAppointmentForm: () => {},
        patients: [],
        doctors: [],
        editingItem: null,
        loading: false,
        errorMessage: null,
        onSave: () => {},
        onCreatePatient: () => {},
        appointments: [],
        // Потом переданные props (они перезапишут defaults)
        ...props
      };
      return result;
    }
    
    if (modalId === 'patient') {
      return {
        patientForm: {},
        setPatientForm: () => {},
        editingItem: null,
        loading: false,
        errorMessage: null,
        onSave: () => {},
        ...props
      };
    }
    
    if (modalId === 'doctor') {
      return {
        doctorForm: {},
        setDoctorForm: () => {},
        editingItem: null,
        loading: false,
        errorMessage: null,
        onSave: () => {},
        ...props
      };
    }
    
    return props;
  };

  const closeAllModals = () => {
    setModals({});
  };

  const value = {
    openModal,
    closeModal,
    updateModalProps,
    isModalOpen,
    getModalProps,
    closeAllModals,
    modals
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
}
