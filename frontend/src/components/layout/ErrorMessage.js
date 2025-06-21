import React from 'react';

const ErrorMessage = ({ errorMessage, setErrorMessage }) => {
  if (!errorMessage) return null;

  // Проверяем что errorMessage это строка
  const messageText = typeof errorMessage === 'string' ? errorMessage : String(errorMessage);
  const isSuccess = messageText.startsWith('✅');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className={`px-4 py-3 rounded relative ${
        isSuccess 
          ? 'bg-green-100 border border-green-400 text-green-700' 
          : 'bg-red-100 border border-red-400 text-red-700'
      }`}>
        <strong className="font-bold">
          {isSuccess ? 'Успех: ' : 'Ошибка: '}
        </strong>
        <span className="block sm:inline">{messageText.replace('✅ ', '')}</span>
        <button
          className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
          onClick={() => {
            console.log('Manually closing message');
            setErrorMessage(null);
          }}
        >
          <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <title>Закрыть</title>
            <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ErrorMessage;