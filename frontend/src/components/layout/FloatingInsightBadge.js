import React from 'react';

const FloatingInsightBadge = ({ onOpenChat, aiChatSidebarOpen }) => {
  const handleClick = () => {
    if (onOpenChat) {
      onOpenChat();
    }
  };

  // Скрываем кнопку когда чат-сайдбар открыт
  if (aiChatSidebarOpen) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 cursor-pointer hover:scale-105 transition-transform"
      onClick={handleClick}
      title="Открыть чат с ИИ"
    >
      <div className="w-14 h-14 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all">
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
    </div>
  );
};

export default FloatingInsightBadge;
