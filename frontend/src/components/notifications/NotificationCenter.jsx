import React, { useRef } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import useDialogFocus from '../../hooks/useDialogFocus';
import CuraiIcon from '../common/CuraiIcon';
import CuraiButton from '../common/CuraiButton';

export function notificationDate(timestamp) {
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Bishkek', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date).replace(' г.,', ' ·');
}
export default function NotificationCenter() {
  const { notifications, isOpen, unreadCount, markAsRead, markAllAsRead, removeNotification, clearAll, closePanel } = useNotifications();
  const panel = useRef(null);
  useDialogFocus(panel, isOpen, closePanel);
  if (!isOpen) return null;
  return <div className="curai-surface-root">
    <div className="curai-notification-backdrop" onClick={closePanel} aria-hidden="true"/>
    <aside ref={panel} role="dialog" aria-modal="true" aria-label="Уведомления" tabIndex={-1} className="curai-notification-drawer">
      <header className="curai-notification-header"><div><h2>Уведомления</h2>{notifications.length > 0 && <p>{unreadCount ? `${unreadCount} непрочитанных` : 'Все прочитаны'}</p>}</div><CuraiButton variant="ghost" iconOnly onClick={closePanel} aria-label="Закрыть уведомления"><CuraiIcon name="close"/></CuraiButton></header>
      {notifications.length > 0 && <div className="curai-notification-actions"><CuraiButton variant="ghost" disabled={!unreadCount} onClick={markAllAsRead}>Отметить всё</CuraiButton><CuraiButton variant="ghost" onClick={clearAll}>Очистить</CuraiButton></div>}
      <div className="curai-notification-scroll">
        {!notifications.length ? <div className="curai-notification-empty"><CuraiIcon name="notifications"/><strong>Нет уведомлений</strong><p>Новые уведомления<br/>появятся здесь.</p></div> : <ul className="curai-notification-list">
          {notifications.map(notification => <li key={notification.id} className={`curai-notification-row${notification.read ? '' : ' is-unread'}`}>
            <CuraiIcon name={notification.type === 'success' ? 'check' : notification.type === 'error' ? 'close' : 'crm-card'}/>
            <button type="button" className="curai-notification-summary" aria-disabled={notification.read || undefined} aria-label={`${notification.title}: ${notification.message}. ${notification.read ? 'Прочитано' : 'Не прочитано'}`} onClick={() => { if (!notification.read) markAsRead(notification.id); }}>
              <strong>{notification.title}</strong><span>{notification.message}</span>
              <span className="curai-notification-meta"><time dateTime={new Date(notification.timestamp).toString() !== 'Invalid Date' ? new Date(notification.timestamp).toISOString() : undefined}>{notificationDate(notification.timestamp)}</time><span>{notification.read ? 'Прочитано' : 'Не прочитано'}</span></span>
            </button>
            <CuraiButton variant="ghost" iconOnly className="curai-notification-delete" aria-label={`Удалить уведомление: ${notification.title}`} onClick={() => removeNotification(notification.id)}><CuraiIcon name="delete"/></CuraiButton>
          </li>)}
        </ul>}
      </div>
    </aside>
  </div>;
}
