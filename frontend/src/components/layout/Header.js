import React from 'react';

const Header = ({ user, logout }) => {
  const getUserRoleText = (role) => {
    switch (role) {
      case 'admin': return 'Администратор';
      case 'doctor': return 'Врач';
      case 'patient': return 'Пациент';
      default: return 'Пользователь';
    }
  };

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <h1 className="text-3xl font-bold text-gray-900">Система управления клиникой</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              {user?.full_name} ({getUserRoleText(user?.role)})
            </span>
            <button
              onClick={logout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;