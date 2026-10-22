import React, { useCallback, useEffect, useRef, useState } from 'react';
import WhatsAppInbox from './WhatsAppInbox';
import WhatsAppFloatingButton from '../../layout/WhatsAppFloatingButton';
import { useModal } from '../../../context/ModalContext';
import { canAction } from '../../../utils/permissions';
import { OPEN_WHATSAPP_CHAT, normalizeWhatsAppPhone } from '../../../utils/openWhatsAppChat';

export default function WhatsAppWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(null);
  const [suspended, setSuspended] = useState(null);
  const sequence = useRef(0);
  const { isModalOpen } = useModal();
  const canRead = canAction(user, 'crm_view');
  const close = useCallback(() => { setOpen(false); setSuspended(null); }, []);

  useEffect(() => {
    if (!canRead) { close(); return undefined; }
    const receive = event => {
      const target = event.detail;
      if (!target || normalizeWhatsAppPhone(target.phone) !== target.phone) return;
      setRequest({ ...target, requestId: ++sequence.current });
      setSuspended(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_WHATSAPP_CHAT, receive);
    return () => window.removeEventListener(OPEN_WHATSAPP_CHAT, receive);
  }, [canRead, close]);

  useEffect(() => {
    if (suspended && !isModalOpen?.(suspended)) setSuspended(null);
  }, [suspended, isModalOpen]);

  if (!canRead) return null;
  return <>
    <WhatsAppFloatingButton isOpen={open} onToggle={() => {
      if (open) close();
      else { setRequest(null); setOpen(true); }
    }} />
    <WhatsAppInbox user={user} isOpen={open} onClose={close} openRequest={request}
      suspended={Boolean(suspended)} onSuspend={setSuspended} />
  </>;
}
