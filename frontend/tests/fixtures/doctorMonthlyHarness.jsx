// Synthetic UI fixture. Real production components; no backend or real records.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DoctorModal from '../../src/components/modals/DoctorModal';
import SalariesView from '../../src/components/finance/salaries/SalariesView';

const user = { role: 'super_admin', is_active: true, permissions: [] };
let savedDoctor = null;
window.fetch = async (url, init = {}) => {
  if (init.method && init.method !== 'GET') throw new Error('Synthetic preview forbids network mutations');
  let body;
  if (String(url).includes('/api/specialties')) body = [{ id: 'therapy', name: 'Терапия' }];
  else if (String(url).includes('/api/service-prices')) body = [{ id: 'synthetic-service', name: 'Синтетическая услуга', category: 'Терапия', price: 5000 }];
  else if (String(url).includes('/api/doctors/salary-report')) {
    const value = savedDoctor?.payment_value ?? 0;
    const params = new URL(String(url), location.origin).searchParams;
    const from = params.get('date_from');
    const to = params.get('date_to');
    const oneMonth = from?.slice(0, 7) === to?.slice(0, 7) && from <= to;
    body = { compensation_complete: true, accounting_blockers: [], salary_data: savedDoctor ? [{
      ...savedDoctor, doctor_id: 'synthetic-monthly', doctor_name: savedDoctor.full_name,
      doctor_specialty: 'Терапия', total_appointments: 0, completed_appointments: 0,
      appointments_revenue: 0, treatment_plans_revenue: 0, total_revenue: 0,
      calculated_salary: oneMonth ? value : null, total_salary: oneMonth ? value : null, monthly_salary: value,
      has_services: false, services_count: 0, revenue_complete: true
    }] : [], summary: { total_doctors: savedDoctor ? 1 : 0, total_revenue: 0,
      total_salary: oneMonth ? value : 0, salary_total_complete: oneMonth } };
  } else throw new Error('Unexpected synthetic endpoint: ' + url);
  return { ok: true, status: 200, json: async () => structuredClone(body) };
};

function Harness() {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [version, setVersion] = useState(0);
  const open = edit => { setEditing(edit ? savedDoctor : null); setForm({}); setShow(true); };
  return <main className="p-4 space-y-4 bg-curai-bg text-curai-ink min-h-screen">
    <p className="text-sm text-curai-muted">Локальная проверка · синтетические данные · 0 пациентов</p>
    <div className="flex gap-3">
      <button onClick={() => open(false)}>Создать врача</button>
      <button disabled={!savedDoctor} onClick={() => open(true)}>Редактировать врача</button>
    </div>
    <SalariesView user={user} refreshVersion={version} />
    <DoctorModal user={user} show={show} onClose={() => setShow(false)} editingItem={editing}
      doctorForm={form} setDoctorForm={setForm} onSave={(event, payload) => {
        event.preventDefault();
        const { editingItem, ...doctor } = payload;
        savedDoctor = { ...doctor, id: 'synthetic-monthly' };
        window.syntheticSavedDoctor = structuredClone(savedDoctor);
        setVersion(value => value + 1); setShow(false);
      }} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
