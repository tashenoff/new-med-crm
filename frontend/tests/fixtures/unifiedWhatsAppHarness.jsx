import React, { useState } from 'react';
import { ModalProvider, useModal } from '../../src/context/ModalContext';
import { ThemeProvider } from '../../src/hooks/useTheme';
import Widget from '../../src/components/crm/telephony/WhatsAppWidget';
import Patient from '../../src/components/modals/PatientModal';
import Leads from '../../src/components/crm/leads/EnhancedLeadsView';
import { openWhatsAppChat } from '../../src/utils/openWhatsAppChat';

function Contents() {
  const f = globalThis.widgetFixture;
  const modals = useModal();
  const [form, setForm] = useState(f.patient);
  f.form = form;
  f.modals = modals;
  return <>
    <button onClick={() => modals.openModal('patient')}>Open patient</button>
    <button onClick={() => openWhatsAppChat({ phone: f.otherPhone, displayName: 'Synthetic Other' })}>Open other</button>
    <button onClick={() => openWhatsAppChat({ phone: f.patient.phone, patientId: f.patient.id, displayName: f.patient.full_name })}>Open target</button>
    {f.showCrm && <Leads user={f.user} />}
    <Patient user={f.user} show={modals.isModalOpen('patient')} patientForm={form} setPatientForm={setForm}
      editingItem={f.patient} onClose={() => modals.closeModal('patient')} onSave={event => event.preventDefault()} />
    {modals.isModalOpen('appointment') && <section role="dialog" aria-modal="true" aria-label="Synthetic appointment">
      <button onClick={() => modals.closeModal('appointment')}>Cancel appointment</button>
    </section>}
    <Widget user={f.user} />
  </>;
}
export default function Harness() {
  return <ThemeProvider><ModalProvider><Contents /></ModalProvider></ThemeProvider>;
}
