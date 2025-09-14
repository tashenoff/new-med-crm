import React from 'react';
import { useModal } from '../../context/ModalContext';

// Импорты всех модальных окон
import AppointmentModal from './AppointmentModal';
import PatientModal from './PatientModal';
import DoctorModal from './DoctorModal';

const ModalManager = () => {
  const { modals, isModalOpen, getModalProps, closeModal } = useModal();

  return (
    <>
      {/* Appointment Modal */}
      <AppointmentModal
        show={isModalOpen('appointment')}
        onClose={() => closeModal('appointment')}
        {...getModalProps('appointment')}
      />

      {/* Patient Modal */}
      <PatientModal
        show={isModalOpen('patient')}
        onClose={() => closeModal('patient')}
        {...getModalProps('patient')}
      />

      {/* Doctor Modal */}
      <DoctorModal
        show={isModalOpen('doctor')}
        onClose={() => closeModal('doctor')}
        {...getModalProps('doctor')}
      />

    </>
  );
};

export default ModalManager;
