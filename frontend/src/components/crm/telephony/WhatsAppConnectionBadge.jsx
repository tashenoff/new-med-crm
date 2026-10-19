import React from 'react';
import useWazzupConnection from '../../../hooks/useWazzupConnection';

export default function WhatsAppConnectionBadge({ isOpen }) {
  const status = useWazzupConnection(isOpen);
  return <span className="curai-connection-slot" role="status" aria-live="polite" aria-atomic="true">
    {status ? <span className={'curai-connection-badge is-' + status}>{status}</span>
      : <span className="sr-only">Статус подключения WhatsApp неизвестен</span>}
  </span>;
}
