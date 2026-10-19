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
    <div className="bg-curai-surface rounded-md shadow-none p-6 mb-6">
      <h3 className="text-lg font-semibold text-curai-ink mb-4">
        Демо системы уведомлений
      </h3>
      <p className="text-sm text-curai-muted mb-4">
        Нажмите на кнопки ниже, чтобы добавить тестовые уведомления
      </p>
      
      <div className="flex flex-wrap gap-3">
        <button
          onClick={addRandomNotification}
          className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue transition-colors font-medium text-sm"
        >
          Добавить случайное уведомление
        </button>
        
        <button
          onClick={addMultipleNotifications}
          className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue transition-colors font-medium text-sm"
        >
          Добавить все примеры
        </button>

        <button
          onClick={() => addNotification({
            title: 'Новая запись',
            message: 'У вас новая запись на завтра в 10:00',
            type: 'appointment'
          })}
          className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue transition-colors font-medium text-sm"
        >
          Запись
        </button>

        <button
          onClick={() => addNotification({
            title: 'Платеж получен',
            message: 'Поступил платеж на сумму 3500 сом',
            type: 'payment'
          })}
          className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue transition-colors font-medium text-sm"
        >
          Платеж
        </button>

        <button
          onClick={() => addNotification({
            title: 'Операция выполнена',
            message: 'Данные успешно сохранены',
            type: 'success'
          })}
          className="px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive transition-colors font-medium text-sm"
        >
          Успех
        </button>

        <button
          onClick={() => addNotification({
            title: 'Требуется внимание',
            message: 'Необходимо пополнить запасы материалов',
            type: 'warning'
          })}
          className="px-4 py-2 bg-curai-warning text-white rounded-md hover:bg-curai-warning transition-colors font-medium text-sm"
        >
          Предупреждение
        </button>

        <button
          onClick={() => addNotification({
            title: 'Ошибка',
            message: 'Не удалось выполнить операцию',
            type: 'error'
          })}
          className="px-4 py-2 bg-curai-negative text-white rounded-md hover:bg-curai-negative transition-colors font-medium text-sm"
        >
          Ошибка
        </button>
      </div>

      <div className="mt-4 p-4 bg-curai-subtle rounded-md border border-curai-border">
        <h4 className="text-sm font-semibold text-curai-ink mb-2">Как использовать в коде:</h4>
        <pre className="text-xs bg-curai-ink text-curai-disabled p-3 rounded overflow-x-auto">
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
