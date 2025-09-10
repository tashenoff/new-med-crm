import React, { useState, useEffect } from 'react';

const BackgroundSelector = () => {
  const [currentBg, setCurrentBg] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const backgrounds = [
    {
      name: "Голубые горы",
      url: "https://images.unsplash.com/photo-1538947151057-dfe933d688d1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwyfHxtb3VudGFpbnN8ZW58MHx8fGJsdWV8MTc1MDU5MTUyOXww&ixlib=rb-4.1.0&q=85"
    },
    {
      name: "Снежные вершины",
      url: "https://images.unsplash.com/photo-1594717527389-a590b56e8d0a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxtb3VudGFpbnN8ZW58MHx8fGJsdWV8MTc1MDU5MTUyOXww&ixlib=rb-4.1.0&q=85"
    },
    {
      name: "Океанский берег",
      url: "https://images.unsplash.com/photo-1505142468610-359e7d316be0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxuYXR1cmV8ZW58MHx8fGJsdWV8MTc1MDU5MTUzNnww&ixlib=rb-4.1.0&q=85"
    },
    {
      name: "Темная тема",
      url: "dark"
    },
    {
      name: "Светлая тема",
      url: "none"
    }
  ];

  // Загружаем сохраненные настройки при монтировании
  useEffect(() => {
    const savedBg = localStorage.getItem('selectedBackground');
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    
    if (savedBg !== null) {
      const bgIndex = parseInt(savedBg);
      setCurrentBg(bgIndex);
      changeBackground(bgIndex, false);
    }
    
    setIsDarkMode(savedDarkMode);
    applyDarkMode(savedDarkMode);
  }, []);

  const applyDarkMode = (dark) => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const changeBackground = (index, save = true) => {
    setCurrentBg(index);
    const bg = backgrounds[index];
    
    if (save) {
      localStorage.setItem('selectedBackground', index.toString());
    }
    
    if (bg.url === "none") {
      // Светлая тема
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "#f9fafb";
      setIsDarkMode(false);
      applyDarkMode(false);
      localStorage.setItem('darkMode', 'false');
    } else if (bg.url === "dark") {
      // Темная тема
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "#1f2937";
      setIsDarkMode(true);
      applyDarkMode(true);
      localStorage.setItem('darkMode', 'true');
    } else {
      // Изображение фона
      document.body.style.backgroundImage = `url('${bg.url}')`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.backgroundRepeat = "no-repeat";
      setIsDarkMode(false);
      applyDarkMode(false);
      localStorage.setItem('darkMode', 'false');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`rounded-lg shadow-lg p-4 border ${
        isDarkMode 
          ? 'bg-gray-800 border-gray-600' 
          : 'bg-white border-gray-200'
      }`}>
        <h4 className={`text-sm font-medium mb-2 ${
          isDarkMode ? 'text-gray-200' : 'text-gray-700'
        }`}>
          🖼️ Тема и фон
        </h4>
        <div className="space-y-2">
          {backgrounds.map((bg, index) => {
            let icon = '🖼️';
            if (bg.url === 'dark') icon = '🌙';
            if (bg.url === 'none') icon = '☀️';
            
            return (
              <button
                key={index}
                onClick={() => changeBackground(index)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center space-x-2 ${
                  currentBg === index
                    ? isDarkMode 
                      ? 'bg-blue-700 text-blue-100 border border-blue-500'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                    : isDarkMode
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{icon}</span>
                <span>{bg.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BackgroundSelector;