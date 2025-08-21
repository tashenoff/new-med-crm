import React from 'react';

const Header = ({ user, onLogout, onToggleSidebar, sidebarOpen }) => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 relative z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            {/* Hamburger Menu Button */}
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors lg:hidden z-50 relative"
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
              className="hidden lg:block p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Toggle sidebar"
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 hidden sm:block">Мед Ассистент</h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {user && (
              <>
                <div className="text-sm text-right hidden sm:block">
                  <div className="text-gray-900 font-medium">{user.full_name}</div>
                  <div className="text-gray-500 text-xs">
                    {user.role === 'admin' ? 'Администратор' : user.role === 'doctor' ? 'Врач' : 'Пациент'}
                  </div>
                </div>
                
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