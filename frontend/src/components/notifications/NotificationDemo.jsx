import React from 'react';
import { useNotifications } from '../../context/NotificationContext';

const NotificationDemo = () => {
  const { addNotification } = useNotifications();

  const notificationExamples = [
    {
      title: 'Новая запись',
      message: 'Пациент Иванов И.И. записан на прием к врачу на 15:00',
      type: 'appointment'
    },
    {
      title: 'Платеж получен',
      message: 'Поступила оплата 5000 сом от пациента Петров П.П.',
      type: 'payment'
    },
    {
      title: 'Успешно',
      message: 'Запись успешно создана',
      type: 'success'
    },
    {
      title: 'Внимание',
      message: 'Заканчивается запас материала: Перчатки латексные',
      type: 'warning'
    },
    {
      title: 'Ошибка',
      message: 'Не удалось загрузить данные. Попробуйте еще раз',
      type: 'error'
    },
    {
      title: 'Информация',
      message: 'Система будет недоступна с 23:00 до 01:00 для технического обслуживания',
      type: 'info'
    }
  ];

  const addRandomNotification = () => {
    const random = notificationExamples[Math.floor(Math.random() * notificationExamples.length)];
    addNotification(random);
  };

  const addMultipleNotifications = () => {
    notificationExamples.forEach((notification, index) => {
      setTimeout(() => {
        addNotification(notification);
      }, index * 500);
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Демо системы уведомлений
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Нажмите на кнопки ниже, чтобы добавить тестовые уведомления
      </p>
      
      <div className="flex flex-wrap gap-3">
        <button
          onClick={addRandomNotification}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          Добавить случайное уведомление
        </button>
        
        <button
          onClick={addMultipleNotifications}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
        >
          Добавить все примеры
        </button>

        <button
          onClick={() => addNotification({
            title: 'Новая запись',
            message: 'У вас новая запись на завтра в 10:00',
            type: 'appointment'
          })}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm"
        >
          Запись
        </button>

        <button
          onClick={() => addNotification({
            title: 'Платеж получен',
            message: 'Поступил платеж на сумму 3500 сом',
            type: 'payment'
          })}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-medium text-sm"
        >
          Платеж
        </button>

        <button
          onClick={() => addNotification({
            title: 'Операция выполнена',
            message: 'Данные успешно сохранены',
            type: 'success'
          })}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium text-sm"
        >
          Успех
        </button>

        <button
          onClick={() => addNotification({
            title: 'Требуется внимание',
            message: 'Необходимо пополнить запасы материалов',
            type: 'warning'
          })}
          className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium text-sm"
        >
          Предупреждение
        </button>

        <button
          onClick={() => addNotification({
            title: 'Ошибка',
            message: 'Не удалось выполнить операцию',
            type: 'error'
          })}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium text-sm"
        >
          Ошибка
        </button>
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Как использовать в коде:</h4>
        <pre className="text-xs bg-gray-800 text-gray-100 p-3 rounded overflow-x-auto">
{`import { useNotifications } from '@/context/NotificationContext';

const MyComponent = () => {
  const { addNotification } = useNotifications();
  
  const handleAction = () => {
    addNotification({
      title: 'Заголовок',
      message: 'Текст уведомления',
      type: 'success' // success, error, warning, appointment, payment, info
    });
  };
  
  return <button onClick={handleAction}>Действие</button>;
};`}
        </pre>
      </div>
    </div>
  );
};

export default NotificationDemo;
