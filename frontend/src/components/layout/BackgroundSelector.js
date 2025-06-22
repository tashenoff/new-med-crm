import React, { useState } from 'react';

const BackgroundSelector = () => {
  const [currentBg, setCurrentBg] = useState(0);
  
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
      name: "Без фона",
      url: "none"
    }
  ];

  const changeBackground = (index) => {
    setCurrentBg(index);
    const bg = backgrounds[index];
    
    if (bg.url === "none") {
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "#f9fafb";
    } else {
      document.body.style.backgroundImage = `url('${bg.url}')`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.backgroundRepeat = "no-repeat";
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-4 border">
        <h4 className="text-sm font-medium text-gray-700 mb-2">🖼️ Фон</h4>
        <div className="space-y-2">
          {backgrounds.map((bg, index) => (
            <button
              key={index}
              onClick={() => changeBackground(index)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                currentBg === index
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {bg.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BackgroundSelector;