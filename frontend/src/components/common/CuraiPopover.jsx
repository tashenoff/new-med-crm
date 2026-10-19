import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function CuraiPopover({ anchorRef, onClose, children, label, width = 240 }) {
  const menu = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width });
  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const actualWidth = Math.min(width, window.innerWidth - 16);
    setPosition({ top: Math.min(anchor.bottom + 4, Math.max(8, window.innerHeight - Math.min(menu.current?.offsetHeight || 300, 360) - 8)), left: Math.max(8, Math.min(anchor.right - actualWidth, window.innerWidth - actualWidth - 8)), width: actualWidth });
  }, [anchorRef, width]);
  useEffect(() => {
    const anchor = anchorRef.current;
    const close = () => { onClose(); anchor?.focus(); };
    const outside = event => { if (!menu.current?.contains(event.target) && !anchor?.contains(event.target)) onClose(); };
    const key = event => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = [...menu.current.querySelectorAll('button:not(:disabled)')], index = items.indexOf(document.activeElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', close); };
  }, [anchorRef, onClose]);
  return createPortal(<div ref={menu} role="menu" aria-label={label} data-curai-popover className="curai-popover curai-surface-root" style={position}>{children}</div>, document.body);
}
