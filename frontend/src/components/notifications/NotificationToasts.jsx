import React, { useEffect } from 'react';

function Toast({ notification, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), 6000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div className="flex gap-3 rounded-md border border-curai-control bg-curai-surface p-4 text-curai-ink shadow-none ">
      <div className="min-w-0 flex-1 break-words" role="status">
        <p className="font-semibold">{notification.title}</p>
        <p className="mt-1 text-sm">{notification.message}</p>
      </div>
      <button type="button" aria-label="Закрыть уведомление" onClick={() => onDismiss(notification.id)}
        className="self-start rounded px-2 text-xl hover:bg-curai-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export default function NotificationToasts({ notifications, onDismiss }) {
  return (
    <div className="fixed bottom-6 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3" aria-label="Новые уведомления">
      {notifications.map(notification => <Toast key={notification.id} notification={notification} onDismiss={onDismiss} />)}
    </div>
  );
}
