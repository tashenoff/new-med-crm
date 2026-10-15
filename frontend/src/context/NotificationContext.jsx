import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import NotificationToasts from '../components/notifications/NotificationToasts';
import { claimNotificationId } from '../utils/notificationIds';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(notification => notification.id !== id));
  }, []);

  // Добавить уведомление
  const addNotification = useCallback((notification) => {
    // Retain explicit IDs even if dismissed/cleared, for this login session.
    if (!claimNotificationId(seenIds.current, notification.id)) return;
    const { toast, ...details } = notification;
    const newNotification = {
      id: Date.now() + Math.random(),
      timestamp: new Date(),
      read: false,
      ...details
    };
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
    if (toast) setToasts(prev => [...prev.slice(-2), newNotification]);
  }, []);

  // Отметить как прочитанное
  const markAsRead = useCallback((id) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Отметить все как прочитанные
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(notif => ({ ...notif, read: true }))
    );
    setUnreadCount(0);
  }, []);

  // Удалить уведомление
  const removeNotification = useCallback((id) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id);
      if (notification && !notification.read) {
        setUnreadCount(count => Math.max(0, count - 1));
      }
      return prev.filter(notif => notif.id !== id);
    });
  }, []);

  // Очистить все уведомления
  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const resetSession = useCallback(() => {
    seenIds.current.clear();
    setNotifications([]);
    setUnreadCount(0);
    setToasts([]);
    setIsOpen(false);
  }, []);

  // Переключить панель уведомлений
  const togglePanel = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // Открыть панель
  const openPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  // Закрыть панель
  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = {
    notifications,
    unreadCount,
    isOpen,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    resetSession,
    togglePanel,
    openPanel,
    closePanel
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationToasts notifications={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
};
