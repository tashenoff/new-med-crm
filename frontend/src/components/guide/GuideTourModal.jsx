import React, { useEffect, useRef } from 'react';
import Modal from '../modals/Modal';
import CuraiIcon from '../common/CuraiIcon';
import { useGuide } from '../../context/GuideContext';

export default function GuideTourModal() {
  const { showStartModal, closeGuideModal, startGuide } = useGuide();
  const contentRef = useRef(null);
  useEffect(() => {
    if (!showStartModal) return;
    const trigger = document.activeElement;
    contentRef.current?.querySelector('button')?.focus();
    return () => { if (trigger?.isConnected) trigger.focus(); };
  }, [showStartModal]);
  const close = () => closeGuideModal(true);
  const trapFocus = event => {
    if (event.key !== 'Tab') return;
    const dialog = contentRef.current?.closest('[role="dialog"]');
    const buttons = [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]') || [])];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <Modal show={showStartModal} onClose={close} title="Гид по системе" size="max-w-[640px]"
    className="curai-guide-dialog" onKeyDown={trapFocus}>
    <div ref={contentRef} className="guide-start-content">
      <p>Выберите задачу. Подсказки покажут нужные разделы и действия в интерфейсе.</p>
      <div className="guide-options">
        <button type="button" className="guide-option-card" onClick={() => startGuide('appointment')}>
          <span className="guide-option-icon"><CuraiIcon name="calendar" /></span>
          <span><strong>Как добавить запись на приём</strong><span>Календарь, данные пациента и сохранение записи.</span></span>
          <span className="guide-option-arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" className="guide-option-card" onClick={() => startGuide('treatmentPlan')}>
          <span className="guide-option-icon"><CuraiIcon name="patients" /></span>
          <span><strong>Как добавить план лечения</strong><span>Карточка пациента, консультация и выбор услуг.</span></span>
          <span className="guide-option-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  </Modal>;
}
