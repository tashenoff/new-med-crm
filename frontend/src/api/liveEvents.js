// One owner (LiveNotifications) creates this connection for the signed-in app.
export function liveEventsUrl(backendUrl, origin = window.location.origin) {
  const url = new URL(backendUrl || origin, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/ws/events`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function crmCardNotification(event) {
  if (event?.version !== 1 || event.type !== 'crm.card.created' || event.entity_type !== 'lead' ||
      typeof event.event_id !== 'string' || !event.event_id ||
      typeof event.card_id !== 'string' || !event.card_id ||
      typeof event.title !== 'string' ||
      typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp))) return null;
  return {
    id: `crm.card.created:${event.entity_type}:${event.card_id}`,
    type: 'info',
    title: 'Новая карточка CRM',
    message: event.title,
    timestamp: new Date(event.timestamp),
    toast: true,
  };
}

export function connectLiveEvents({ url, token, onEvent, WebSocketImpl = WebSocket,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false;
  let socket;
  let retryTimer;
  let handshakeTimer;
  let attempt = 0;

  const retry = () => {
    if (!stopped) {
      const delay = Math.min(1000 * (2 ** Math.min(attempt++, 5)), 30000);
      retryTimer = setTimer(connect, delay);
    }
  };

  const connect = () => {
    if (stopped) return;
    try {
      socket = new WebSocketImpl(url);
    } catch {
      retry();
      return;
    }
    const current = socket;
    let authenticated = false;
    handshakeTimer = setTimer(() => current.close(), 10000);
    current.onopen = () => {
      if (!stopped) current.send(JSON.stringify({ type: 'authenticate', token }));
    };
    current.onmessage = ({ data }) => {
      if (stopped || current !== socket) return;
      let event;
      try { event = JSON.parse(data); } catch { return; }
      if (event?.type === 'connection.ready' && event.version === 1) {
        authenticated = true;
        attempt = 0;
        clearTimer(handshakeTimer);
      } else if (authenticated) {
        onEvent(event);
      }
    };
    current.onerror = () => current.close();
    current.onclose = ({ code }) => {
      clearTimer(handshakeTimer);
      // Invalid/expired credentials require login or a new token, not retries.
      if (code !== 1008) retry();
    };
  };

  connect();
  return () => {
    stopped = true;
    clearTimer(retryTimer);
    clearTimer(handshakeTimer);
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  };
}
