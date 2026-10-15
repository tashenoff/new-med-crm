import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { connectLiveEvents, crmCardNotification, liveEventsUrl } from '../../api/liveEvents';

export default function LiveNotifications() {
  const { user, token, loading, showPasswordExpiredModal } = useAuth();
  const { addNotification, resetSession } = useNotifications();
  const userId = user?.id;
  const previousUser = useRef(userId);

  useEffect(() => {
    if (previousUser.current !== userId) {
      resetSession();
      previousUser.current = userId;
    }
  }, [userId, resetSession]);

  useEffect(() => {
    if (!userId || !token || loading || showPasswordExpiredModal) return;
    return connectLiveEvents({
      url: liveEventsUrl(import.meta.env.VITE_BACKEND_URL),
      token,
      onEvent: (event) => {
        const notification = crmCardNotification(event);
        if (notification) addNotification(notification);
      },
    });
  }, [userId, token, loading, showPasswordExpiredModal, addNotification]);

  return null;
}
