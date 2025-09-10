import React from 'react';

const Header = ({ user, onLogout, onToggleSidebar, sidebarOpen, activeSection, setActiveSection }) => {
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
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 relative z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            {/* Hamburger Menu Button */}
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors lg:hidden z-50 relative"
              aria-label="Toggle sidebar"
              data-testid="mobile-hamburger"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                />
              </svg>
            </button>

            {/* Desktop Hamburger Menu Button */}
            <button
              onClick={onToggleSidebar}
              className="hidden lg:block p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-50 relative"
              aria-label="Toggle sidebar"
              data-testid="desktop-hamburger"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            
            {/* Logo only shows when sidebar is closed */}
            <div className={`flex items-center space-x-2 transition-opacity duration-300 ${sidebarOpen ? 'lg:opacity-0 lg:pointer-events-none' : 'lg:opacity-100'}`}>
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white hidden sm:block">Мед Ассистент</h1>
            </div>
          </div>
          
          {/* Top Navigation Tabs */}
          <div className="flex items-center space-x-6">
            {user && (
              <nav className="hidden md:flex space-x-6">
                <button 
                  onClick={() => setActiveSection('hms')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    activeSection === 'hms' 
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  HMS
                </button>
                <button 
                  onClick={() => setActiveSection('crm')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    activeSection === 'crm' 
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  CRM
                </button>
                <button 
                  onClick={() => setActiveSection('finance')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    activeSection === 'finance' 
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  Финансы
                </button>
              </nav>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {user && (
              <>
                <div className="text-sm text-right hidden sm:block">
                  <div className="text-gray-900 dark:text-white font-medium">{user.full_name}</div>
                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                    {user.role === 'admin' ? 'Администратор' : user.role === 'doctor' ? 'Врач' : 'Пациент'}
                  </div>
                </div>
                
                {/* Theme Toggle Button */}
                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                    {user.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                </div>
                
                <button
                  onClick={onLogout}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-sm"
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