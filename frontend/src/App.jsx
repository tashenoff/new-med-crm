import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useDoctors } from './hooks/useDoctors';
import Header from './components/layout/Header';
import Navigation from './components/layout/Navigation';
import ErrorMessage from './components/layout/ErrorMessage';

// Модальные компоненты перенесены в ModalManager

import DoctorSchedule from './components/doctors/DoctorSchedule';
import ServicePrices from './components/directory/ServicePrices';
import Rooms from './components/directory/Rooms';
import Specialties from './components/specialties/Specialties';
import PaymentTypes from './components/payment-types/PaymentTypes';

import CrmDashboard from './components/crm/dashboard/CrmDashboard';
import LeadsView from './components/crm/leads/LeadsView';
import ClientsView from './components/crm/clients/ClientsView';
import DealsView from './components/crm/deals/DealsView';
import ManagersView from './components/crm/managers/ManagersView';
import SourcesView from './components/crm/contacts/ContactsView';

import FinanceDashboard from './components/finance/dashboard/FinanceDashboard';
import IncomeView from './components/finance/income/IncomeView';
import ExpensesView from './components/finance/expenses/ExpensesView';
import SalariesView from './components/finance/salaries/SalariesView';
import ReportsView from './components/finance/reports/ReportsView';

import DoctorStatistics from './components/statistics/DoctorStatistics';
import TreatmentPlanStatistics from './components/statistics/TreatmentPlanStatistics';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import { CalendarPage, PatientsPage, DoctorsPage } from './pages';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModalProvider } from './context/ModalContext';
import ModalManager from './components/modals/ModalManager';
import { useApi } from './hooks/useApi';
import { GlobalRefreshProvider, useGlobalRefresh } from './hooks/useGlobalRefresh';
import { ThemeProvider } from './hooks/useTheme';
import './App.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ClinicApp() {
  // API hook
  const api = useApi();
  
  
  // Doctors hook
  const doctorsHook = useDoctors();
  
  // Отладочная информация для врачей
  console.log('App.jsx - doctorsHook.doctors:', doctorsHook.doctors);
  console.log('App.jsx - doctors length:', doctorsHook.doctors.length);
  
  // Global refresh hook
  const { refreshTriggers } = useGlobalRefresh();
  
  // Auth hook
  const { user, logout } = useAuth();
  
  // Router hooks
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine activeTab from current route
  const getActiveTabFromPath = (pathname) => {
    if (pathname.startsWith('/calendar')) return 'calendar';
    if (pathname.startsWith('/patients')) return 'patients';
    if (pathname.startsWith('/doctors')) return 'doctors';
    if (pathname.startsWith('/statistics')) return 'statistics';
    if (pathname.startsWith('/treatment-statistics')) return 'treatment-statistics';
    if (pathname.startsWith('/doctor-statistics')) return 'doctor-statistics';
    if (pathname.startsWith('/service-prices')) return 'service-prices';
    if (pathname.startsWith('/specialties')) return 'specialties';
    if (pathname.startsWith('/payment-types')) return 'payment-types';
    if (pathname.startsWith('/room-management')) return 'room-management';
    if (pathname.startsWith('/doctor-schedule')) return 'doctor-schedule';
    if (pathname.startsWith('/crm')) return pathname.replace('/', '');
    if (pathname.startsWith('/finance')) return pathname.replace('/', '');
    return 'calendar';
  };
  
  const [activeTab, setActiveTab] = useState(() => getActiveTabFromPath(location.pathname));
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Sync activeTab with URL changes
  useEffect(() => {
    const newActiveTab = getActiveTabFromPath(location.pathname);
    setActiveTab(newActiveTab);
  }, [location.pathname]);
  
  // Navigation function that uses router
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    navigate(`/${tab}`);
  };
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState('hms');

  // Управляем сайдбаром в зависимости от размера экрана
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Модальные окна перенесены в ModalContext
  
  // Clear error after some time
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Permissions
  const canManagePatients = user?.role === 'admin' || user?.role === 'doctor';
  const canManageDoctors = user?.role === 'admin';

  // Функция переключения секций с автоматической установкой первого таба
  const handleSectionChange = (section) => {
    setActiveSection(section);
    
    // При переключении в CRM, устанавливаем первый CRM таб
    if (section === 'crm') {
      handleTabChange('crm-dashboard');
    } else if (section === 'finance') {
      // При переключении в Финансы, устанавливаем финансовый дашборд
      handleTabChange('finance-dashboard');
    } else {
      // При переключении в HMS, устанавливаем календарь
      handleTabChange('calendar');
    }
  };

  // Get available tabs based on user role
  const getAvailableTabs = () => {
    if (activeSection === 'crm') {
      return [
        { key: 'crm-dashboard', label: 'Дашборд' },
        { key: 'crm-leads', label: 'Заявки' },
        { key: 'crm-clients', label: 'Контакты' },
        { key: 'crm-deals', label: 'Сделки' },
        { key: 'crm-managers', label: 'Менеджеры' },
        { key: 'crm-contacts', label: 'Источники' }
      ];
    }
    
    // HMS tabs
    const tabs = [
      { key: 'calendar', label: 'Календарь' }
    ];
    
    if (user?.role === 'admin' || user?.role === 'doctor') {
      tabs.push({ key: 'patients', label: 'Пациенты' });
      tabs.push({ key: 'statistics', label: 'Статистика' });
      tabs.push({ key: 'treatment-statistics', label: 'Планы лечения' });
      tabs.push({ key: 'doctor-statistics', label: 'Статистика врачей' });
    }
    
    if (user?.role === 'patient') {
    }
    
    if (user?.role === 'admin' || user?.role === 'doctor') {
      tabs.push({ key: 'doctors', label: 'Врачи' });
    }
    
    // Справочники (только для админов)
    if (user?.role === 'admin') {
      tabs.push({ key: 'doctor-schedule', label: 'Расписание врачей' });
      tabs.push({ key: 'service-prices', label: 'Прайс услуг' });
      tabs.push({ key: 'room-management', label: 'Кабинеты' });
      tabs.push({ key: 'specialties', label: 'Специальности' });
      tabs.push({ key: 'payment-types', label: 'Типы оплат' });
    }
    
    return tabs;
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar Navigation */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        availableTabs={getAvailableTabs()}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        user={user}
        activeSection={activeSection}
      />

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-0'} flex flex-col min-h-screen`}>
        <Header 
          user={user} 
          onLogout={logout} 
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
          activeSection={activeSection}
          setActiveSection={handleSectionChange}
        />

        <ErrorMessage 
          errorMessage={errorMessage} 
          setErrorMessage={setErrorMessage} 
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        
        <Routes>
          <Route path="/" element={<CalendarPage user={user} />} />
          <Route path="/calendar" element={<CalendarPage user={user} />} />
          <Route path="/patients" element={<PatientsPage user={user} />} />
          <Route path="/doctors" element={<DoctorsPage user={user} />} />
          
          {/* Direct routes for statistics and directories */}
          <Route path="/treatment-statistics" element={<TreatmentPlanStatistics />} />
          <Route path="/doctor-statistics" element={<DoctorStatistics />} />
          <Route path="/service-prices" element={<ServicePrices user={user} />} />
          <Route path="/specialties" element={<Specialties user={user} />} />
          <Route path="/payment-types" element={<PaymentTypes user={user} />} />
          <Route path="/room-management" element={<Rooms user={user} />} />
          <Route path="/doctor-schedule" element={<DoctorSchedule doctors={doctorsHook.doctors} user={user} canEdit={user?.role === 'admin'} />} />
          
          {/* Fallback routes for other tabs */}
          <Route path="/*" element={
            <div>
              {activeTab === 'crm-dashboard' && <CrmDashboard user={user} />}
              {activeTab === 'crm-leads' && <LeadsView user={user} />}
              {activeTab === 'crm-clients' && <ClientsView user={user} />}
              {activeTab === 'crm-deals' && <DealsView user={user} />}
              {activeTab === 'crm-managers' && <ManagersView user={user} />}
              {activeTab === 'crm-contacts' && <SourcesView user={user} />}
              {activeTab === 'finance-dashboard' && <FinanceDashboard user={user} />}
              {activeTab === 'finance-income' && <IncomeView user={user} />}
              {activeTab === 'finance-expenses' && <ExpensesView user={user} />}
              {activeTab === 'finance-salaries' && <SalariesView user={user} />}
              {activeTab === 'finance-reports' && <ReportsView user={user} />}
              {activeTab === 'statistics' && <DoctorStatistics user={user} />}
              {activeTab === 'treatment-statistics' && <TreatmentPlanStatistics />}
              {activeTab === 'doctor-statistics' && <DoctorStatistics />}
              {activeTab === 'doctor-schedule' && <DoctorSchedule doctors={[]} user={user} canEdit={user?.role === 'admin'} />}
              {activeTab === 'service-prices' && <ServicePrices user={user} />}
              {activeTab === 'specialties' && <Specialties user={user} />}
              {activeTab === 'payment-types' && <PaymentTypes user={user} />}
              {activeTab === 'room-management' && <Rooms user={user} />}
            </div>
          } />
        </Routes>
        </main>

      {/* Универсальный менеджер модальных окон */}
      <ModalManager />
      </div>
    </div>
  );
}

// App Content Component
function AppContent() {
  const [isLogin, setIsLogin] = useState(true);
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Загрузка...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return isLogin ? (
      <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
    ) : (
      <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
    );
  }
  
  return <ClinicApp />;
}

// Main App Component
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ModalProvider>
          <GlobalRefreshProvider>
            <AppContent />
          </GlobalRefreshProvider>
        </ModalProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
