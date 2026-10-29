// Local browser fixture: actual components, synthetic records only.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/theme/curai.variables.css';
import '../../src/theme/curai.css';
import '../../src/theme/curai-foundations.css';
import '../../src/theme/curai-directories.css';
import '../../src/components/calendar/CalendarView.css';
import '../../src/components/common/PagePanel.css';
import DoctorSchedule from '../../src/components/doctors/DoctorSchedule';
import DoctorsView from '../../src/components/doctors/DoctorsView';
import PatientsView from '../../src/components/patients/PatientsView';
import StaffView from '../../src/components/staff/StaffView';
import Rooms from '../../src/components/directory/Rooms';
import Specialties from '../../src/components/specialties/Specialties';
import PaymentTypes from '../../src/components/payment-types/PaymentTypes';
import ServicePrices from '../../src/components/directory/ServicePrices';
import FinanceDashboard from '../../src/components/finance/dashboard/FinanceDashboard';
import TasksView from '../../src/components/crm/tasks/TasksView';
import WarehouseMaterials from '../../src/components/warehouse/WarehouseMaterials';
import BroadcastPage from '../../src/pages/BroadcastPage';
import { ThemeProvider } from '../../src/hooks/useTheme';
import { ModalProvider } from '../../src/context/ModalContext';
import DoctorStatistics from '../../src/components/statistics/DoctorStatistics';
import TreatmentPlanStatistics from '../../src/components/statistics/TreatmentPlanStatistics';
import EnhancedCrmDashboard from '../../src/components/crm/dashboard/EnhancedCrmDashboard';
import EnhancedLeadsView from '../../src/components/crm/leads/EnhancedLeadsView';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'schedule';
const state = params.get('state') || 'filled';
if (state === 'loading') {
  const fetchFixture = window.fetch.bind(window);
  window.fetch = (...args) => String(args[0]).includes('/schedule')
    ? new Promise(() => {}) : fetchFixture(...args);
}
const user = state === 'viewer' ? { role: 'doctor', permissions: ['calendar_view','doctors_view','patients_view','directory_view'] } : { role: 'super_admin' };
const doctors = state === 'empty' ? [] : Array.from({ length: state === 'pages' ? 12 : 3 }, (_,i) => ({
  id: `doctor-${i}`, full_name: `Тестовый Врач ${i+1}`, specialty: 'Терапия', is_active: true,
  phone: '+77000000000', payment_type: 'percentage', salary_percentage: 30, created_at: '2026-10-01'
}));
function Fixture() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [planStatusFilter, setPlanStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const props = { user, searchTerm,setSearchTerm,filterType,setFilterType,filterRole,setFilterRole,
    planStatusFilter,setPlanStatusFilter,dateFrom,setDateFrom,dateTo,setDateTo,
    canManage: state !== 'viewer',onAddDoctor(){window.fixtureAction='add-doctor';},onAddPatient(){window.fixtureAction='add-patient';} };
  const views = {
    schedule: <DoctorSchedule doctors={doctors} user={user} canEdit={state !== 'viewer'} />,
    doctors: <DoctorsView {...props} doctors={doctors} />,
    patients: <PatientsView {...props} patients={state === 'empty' ? [] : [{id:'patient-1',full_name:'Тестовый Пациент',phone:'+77000000000',created_at:'2026-10-01'}].filter(p=>p.full_name.toLowerCase().includes(searchTerm.toLowerCase()))} />,
    staff: <StaffView {...props} staff={doctors.map(d=>({...d,role:'doctor'}))} />,
    rooms: <Rooms user={user} />,
    specialties: <Specialties user={user} />,
    payments: <PaymentTypes user={user} />,
    prices: <ServicePrices user={user} />,
    finance: <FinanceDashboard user={user} />,
    tasks: <TasksView user={user} />,
    warehouse: <WarehouseMaterials user={user} />,
    broadcast: <BroadcastPage user={user} />,
    'doctor-statistics': <DoctorStatistics />,
    'plan-statistics': <TreatmentPlanStatistics />,
    'crm-dashboard': <EnhancedCrmDashboard user={user} />,
    leads: <EnhancedLeadsView user={user} />,
  };
  return <main className="curai-workspace curai-workspace-main" style={{background:'linear-gradient(130deg,#adc6de,#476d93)',minHeight:'100vh'}}>{views[view]}</main>;
}
createRoot(document.getElementById('root')).render(<ThemeProvider><ModalProvider><Fixture /></ModalProvider></ThemeProvider>);
