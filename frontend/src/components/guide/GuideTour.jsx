import React, { useEffect, useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useGuide, GUIDE_STEPS } from '../../context/GuideContext';
import CuraiButton from '../common/CuraiButton';
import CuraiIcon from '../common/CuraiIcon';
import { guidePosition } from './guidePosition';

const sameRect = (a, b) => a && b && ['top', 'left', 'width', 'height'].every(key => a[key] === b[key]);
export default function GuideTour({ onNavigate }) {
  const { activeGuide, currentStep, nextStep, prevStep, endGuide, totalSteps } = useGuide();
  const step = GUIDE_STEPS[activeGuide]?.[currentStep];
  const [targetRect, setTargetRect] = useState(null);
  const [position, setPosition] = useState({ top: 16, left: 16 });
  const tooltipRef = useRef(null);
  const navigateRef = useRef(onNavigate);
  const advanceRef = useRef(nextStep);
  navigateRef.current = onNavigate;
  advanceRef.current = nextStep;
  const id = useId();

  useEffect(() => {
    if (!activeGuide || !step) return;
    let frame = null, target = null;
    let targetObserver = null;
    const advance = () => advanceRef.current();
    const attach = next => {
      if (next === target) return;
      if (target && step.advanceOnClick) target.removeEventListener('click', advance);
      targetObserver?.disconnect();
      target = next;
      if (target && step.advanceOnClick) target.addEventListener('click', advance, { once: true });
      if (target && typeof ResizeObserver !== 'undefined') { targetObserver = new ResizeObserver(schedule); targetObserver.observe(target); }
    };
    const refresh = () => {
      frame = null;
      const found = [...document.querySelectorAll(step.targetSelector)].find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.closest('[hidden], [aria-hidden="true"]');
      });
      attach(found || null);
      const element = step.targetAncestor ? target?.closest(step.targetAncestor) : target;
      const bounds = element?.getBoundingClientRect();
      const rect = bounds ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height } : null;
      setTargetRect(previous => (sameRect(previous, rect) || previous === rect) ? previous : rect);
      const measured = tooltipRef.current?.getBoundingClientRect();
      const next = guidePosition(rect, step.position, { width: measured?.width || 360, height: measured?.height || 240 }, { width: window.innerWidth, height: window.innerHeight });
      setPosition(previous => previous.top === next.top && previous.left === next.left ? previous : next);
    };
    function schedule() { if (frame === null) frame = window.requestAnimationFrame(refresh); }
    setTargetRect(null);
    if (step.action?.type === 'navigate') navigateRef.current?.(step.action.tab, step.action.section);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const tooltipObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (tooltipRef.current) tooltipObserver?.observe(tooltipRef.current);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect(); tooltipObserver?.disconnect(); targetObserver?.disconnect();
      if (target && step.advanceOnClick) target.removeEventListener('click', advance);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [activeGuide, currentStep, step]);

  useEffect(() => {
    if (!activeGuide) return;
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); endGuide(); return; }
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
          event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); nextStep(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); prevStep(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [activeGuide, endGuide, nextStep, prevStep]);

  if (!activeGuide || !step) return null;
  return createPortal(<div className="guide-tour-overlay">
    <svg className="guide-tour-mask" width="100%" height="100%" aria-hidden="true">
      <defs><mask id={`${id}-mask`}><rect width="100%" height="100%" fill="white" />
        {targetRect && <rect x={targetRect.left - 4} y={targetRect.top - 4} width={targetRect.width + 8} height={targetRect.height + 8} rx="6" fill="black" />}
      </mask></defs>
      <rect width="100%" height="100%" fill="var(--curai-color-ink)" opacity="0.16" mask={`url(#${id}-mask)`} />
    </svg>
    {targetRect && <div className="guide-tour-highlight" style={{ top: targetRect.top - 4, left: targetRect.left - 4, width: targetRect.width + 8, height: targetRect.height + 8 }} />}
    <section ref={tooltipRef} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} className="guide-tour-tooltip curai-surface-root" style={position}>
      <div className="guide-tour-tooltip-header"><span aria-live="polite">Шаг {currentStep + 1} из {totalSteps}</span>
        <CuraiButton variant="ghost" iconOnly onClick={endGuide} aria-label="Закрыть гид"><CuraiIcon name="close" /></CuraiButton>
      </div>
      <div className="guide-tour-tooltip-content"><h3 id={`${id}-title`}>{step.title}</h3><p>{step.description}</p>
        {!targetRect && <p className="guide-tour-waiting" role="status">Откройте элемент по описанию шага. Если он недоступен, можно продолжить или закрыть гид.</p>}
      </div>
      <div className="guide-tour-tooltip-actions">
        <CuraiButton disabled={currentStep === 0} onClick={prevStep}>Назад</CuraiButton>
        <CuraiButton variant="ghost" onClick={endGuide}>Пропустить</CuraiButton>
        <CuraiButton variant="primary" onClick={nextStep}>{currentStep === totalSteps - 1 ? 'Завершить' : 'Далее'}</CuraiButton>
      </div>
    </section>
  </div>, document.body);
}
