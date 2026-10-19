import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Проверяем сохраненную тему в localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    // Если нет сохраненной темы, проверяем системные настройки
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Сохраняем тему в localStorage
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Добавляем/убираем класс dark в html элемент
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const value = {
    isDarkMode,
    toggleTheme,
    theme: isDarkMode ? 'dark' : 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Утилитарные функции для классов темной темы
export const themeClasses = {
  // Фоны
  bg: {
    primary: "bg-curai-surface ",
    secondary: "bg-curai-subtle ",
    card: "bg-curai-surface ",
    hover: "hover:bg-curai-subtle ",
    selected: "bg-curai-selected "
  },
  
  // Текст
  text: {
    primary: "text-curai-ink ",
    secondary: "text-curai-muted ",
    muted: "text-curai-muted ",
    inverse: "text-white "
  },
  
  // Границы
  border: {
    default: "border-curai-border ",
    light: "border-curai-border ",
    strong: "border-curai-control "
  },
  
  // Формы
  input: {
    default: "bg-curai-surface border-curai-control text-curai-ink placeholder-curai-muted ",
    focus: "focus:ring-curai-focus focus:border-curai-control "
  },
  
  // Кнопки
  button: {
    primary: "bg-curai-blue hover:bg-curai-blue text-white",
    secondary: "bg-curai-border hover:bg-curai-control text-curai-ink ",
    ghost: "hover:bg-curai-subtle text-curai-ink "
  },
  
  // Тени
  shadow: {
    sm: "shadow-none ",
    default: "shadow-none ",
    lg: "shadow-none "
  }
};

// Функция для объединения классов темы
export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ');
};


