import React, { useCallback, useRef, useState } from 'react';
import CuraiIcon from '../../common/CuraiIcon';
import CuraiPopover from '../../common/CuraiPopover';
import { APPOINTMENT_STATUSES, appointmentStatusReason } from '../../../utils/appointmentStatus';

export function AppointmentStatusOptions({ appointment, onSelect, disabled = false }) {
  return APPOINTMENT_STATUSES.map(status => {
    const reason = appointmentStatusReason(appointment, status.value);
    const choose = event => { event.preventDefault(); event.stopPropagation(); if (!disabled && !reason) onSelect(event, status.value); };
    return <button key={status.value} type="button" role="menuitemradio" aria-checked={appointment.status === status.value} disabled={disabled || Boolean(reason)} title={reason || status.label} className="curai-status-option" onMouseDown={choose} onClick={event => { if (event.detail === 0) choose(event); }}>
      <CuraiIcon name={status.icon}/><span>{status.label}</span>{appointment.status === status.value && <CuraiIcon name="check"/>}
    </button>;
  });
}
export default function AppointmentStatusControl({ appointment, onChange, disabled }) {
  const [open, setOpen] = useState(false), anchor = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const current = APPOINTMENT_STATUSES.find(item => item.value === appointment.status);
  return <><button type="button" ref={anchor} className={`curai-status-control curai-status-${current?.tone || 'muted'}`} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`Статус записи: ${current?.label || appointment.status}`} onClick={() => setOpen(value => !value)}><CuraiIcon name={current?.icon || 'clock'}/><span>{current?.label || appointment.status}</span><CuraiIcon name="chevron"/></button>
    {open && <CuraiPopover anchorRef={anchor} onClose={close} label="Статус записи"><AppointmentStatusOptions appointment={appointment} disabled={disabled} onSelect={(event, status) => { close(); anchor.current?.focus(); onChange(status); }}/></CuraiPopover>}
  </>;
}
