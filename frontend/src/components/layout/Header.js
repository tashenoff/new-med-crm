import React from 'react';
import { useNotifications } from '../../context/NotificationContext';

const Header = ({ user, onLogout, onToggleSidebar, sidebarOpen, activeSection, setActiveSection }) => {
  const { unreadCount, togglePanel } = useNotifications();
  // Проверяем текущую тему
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    // Проверяем сохраненное значение при монтировании
    const savedMode = localStorage.getItem('darkMode') === 'true';
    // Применяем тему
    if (savedMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return savedMode;
  });

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);

    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = "#1f2937";
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.backgroundColor = "#f9fafb";
    }
    localStorage.setItem('darkMode', newDarkMode.toString());
  };

  return (
    <header
      className="backdrop-blur-xl shadow-sm border-b border-white/40 relative z-40"
      style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
    >
      <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-6 w-full">
            {!sidebarOpen && (
              <div className="flex items-center gap-3">
                <button
                    onClick={onToggleSidebar}
                    className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Open sidebar"
                    data-testid="mobile-hamburger"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                </div>
              )}
              {user && (
                <div className="hidden md:flex items-center space-x-4 w-full">
                  <nav className="flex-1 flex items-center space-x-6">
                    <button 
                      onClick={() => setActiveSection('hms')}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        activeSection === 'hms' 
                          ? 'text-white border-b-2 border-white/70' 
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      HMS
                    </button>
                    {/* CRM доступ для админов или пользователей с правом crm_view */}
                    {(user.role === 'admin' || user.role === 'super_admin' || (user.permissions && user.permissions.includes('crm_view'))) && (
                      <button 
                        onClick={() => setActiveSection('crm')}
                        className={`px-3 py-2 text-sm font-medium transition-colors ${
                          activeSection === 'crm' 
                            ? 'text-white border-b-2 border-white/70' 
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        CRM
                      </button>
                    )}
                    {/* Склад доступ для админов или пользователей с правом warehouse_view */}
                    {(user.role === 'admin' || user.role === 'super_admin' || (user.permissions && user.permissions.includes('warehouse_view'))) && (
                      <button 
                        onClick={() => setActiveSection('warehouse')}
                        className={`px-3 py-2 text-sm font-medium transition-colors ${
                          activeSection === 'warehouse' 
                            ? 'text-white border-b-2 border-white/70' 
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        Склад
                      </button>
                    )}
                  </nav>
                </div>
              )}
            </div>
          
            <div className="flex items-center space-x-4 text-white">
            {user && (
              <>
                <div className="text-sm text-right hidden sm:block">
                  <div className="font-medium">{user.full_name}</div>
                  <div className="text-xs text-white/70">
                    {user.role === 'super_admin' ? 'Супер-админ' : user.role === 'admin' ? 'Администратор' : user.role === 'doctor' ? 'Врач' : 'Пациент'}
                  </div>
                </div>


                
                {/* Notifications Button */}
                <button
                  onClick={togglePanel}
                  className="relative p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                  aria-label="Уведомления"
                  title="Уведомления"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Theme Toggle Button */}
                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                  aria-label="Toggle dark mode"
                  title={isDarkMode ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
                >
                  {isDarkMode ? (
                    // Иконка солнца для светлой темы
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    // Иконка луны для темной темы  
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>

                {/* User Avatar Dropdown */}
                <div className="relative">
                  <div className="w-8 h-8 bg-transparent border border-white/40 rounded-full flex items-center justify-center text-white font-medium text-sm">
                    {user.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                </div>
                
                <button
                  onClick={onLogout}
                  className="text-white px-4 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm font-medium"
                >
                  Выйти
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
