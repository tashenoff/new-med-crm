import { useEffect } from 'react';

export default function useDialogFocus(ref, open, onClose) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const node = ref.current.closest('[role="dialog"]') || ref.current;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const targets = () => [...node.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    (targets()[0] || node).focus();
    const keydown = event => {
      const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (dialogs.at(-1) !== node || document.querySelector('[data-curai-popover]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key === 'Tab') {
        const all = targets(), first = all[0], last = all.at(-1);
        if (!first) { event.preventDefault(); node.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.body.style.overflow = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(dialog => dialog !== node) ? 'hidden' : previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose, ref]);
}
