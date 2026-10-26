import React, { useEffect, useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useGuide, GUIDE_STEPS } from '../../context/GuideContext';
import CuraiButton from '../common/CuraiButton';
import CuraiIcon from '../common/CuraiIcon';
import { guidePosition } from './guidePosition';

const sameRect = (a, b) => a && b && ['top', 'left', 'width', 'height', 'outline'].every(key => a[key] === b[key]);
const visibleTarget = selector => [...document.querySelectorAll(selector)].find(element => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && !element.closest('[hidden], [aria-hidden="true"]');
});
const nextIsReady = step => Boolean(step.advanceWhenVisible && visibleTarget(step.advanceWhenVisible) && (!step.waitForAbsent || !visibleTarget(step.waitForAbsent)));
export default function GuideTour({ onNavigate }) {
  const { activeGuide, currentStep, nextStep, prevStep, endGuide, totalSteps } = useGuide();
  const step = GUIDE_STEPS[activeGuide]?.[currentStep];
  const [targetRect, setTargetRect] = useState(null);
  const [readiness, setReadiness] = useState({ step: null, next: false, action: false });
  const nextReady = readiness.step === step && readiness.next;
  const canActivate = readiness.step === step && readiness.action;
  const [position, setPosition] = useState({ top: 16, left: 16 });
  const tooltipRef = useRef(null);
  const navigateRef = useRef(onNavigate);
  const advanceRef = useRef(nextStep);
  const continueRef = useRef(null);
  navigateRef.current = onNavigate;
  advanceRef.current = nextStep;
  const id = useId();
  const actionSelector = step?.activateOnNext ? step.targetSelector : (!targetRect ? step?.fallbackSelector : null);
  const continueGuide = () => {
    if (nextIsReady(step)) { nextStep(); return; }
    if (actionSelector) {
      const button = visibleTarget(actionSelector);
      if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') button.click();
      return;
    }
    if (step?.requireInteraction) return;
    nextStep();
  };
  continueRef.current = continueGuide;

  useEffect(() => {
    if (!activeGuide || !step) return;
    let frame = null, target = null, advanced = false;
    let nextWasVisible = nextIsReady(step);
    let targetObserver = null;
    const advance = () => advanceRef.current();
    const attach = next => {
      if (next === target) return;
      if (target && step.advanceOnClick) target.removeEventListener('click', advance);
      targetObserver?.disconnect();
      target = next;
      const anchor = step.targetAncestor ? target?.closest(step.targetAncestor) : target;
      const scrollTarget = anchor?.tagName === 'FORM' ? anchor.querySelector('input:not([type="hidden"]), select, textarea') : anchor;
      const bounds = scrollTarget?.getBoundingClientRect();
      if (bounds && (bounds.top < 64 || bounds.bottom > window.innerHeight - 16)) scrollTarget.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
      if (target && step.advanceOnClick) target.addEventListener('click', advance, { once: true });
      if (target && typeof ResizeObserver !== 'undefined') { targetObserver = new ResizeObserver(schedule); targetObserver.observe(target); }
    };
    const refresh = () => {
      frame = null;
      const found = visibleTarget(step.targetSelector);
      attach(found || null);
      const ready = nextIsReady(step);
      if (!advanced && !nextWasVisible && ready) {
        advanced = true;
        advanceRef.current();
        return;
      }
      nextWasVisible = ready;
      const element = step.targetAncestor ? target?.closest(step.targetAncestor) : target;
      const bounds = element?.getBoundingClientRect();
      const action = step.activateOnNext ? target : (!bounds && step.fallbackSelector ? visibleTarget(step.fallbackSelector) : null);
      const enabled = Boolean(action && !action.disabled && action.getAttribute('aria-disabled') !== 'true');
      setReadiness(previous => previous.step === step && previous.next === ready && previous.action === enabled ? previous : { step, next: ready, action: enabled });
      const rect = bounds ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height, outline: !element.matches('form, [role="dialog"]') } : null;
      setTargetRect(previous => (sameRect(previous, rect) || previous === rect) ? previous : rect);
      const measured = tooltipRef.current?.getBoundingClientRect();
      const next = guidePosition(rect, step.position, { width: measured?.width || 360, height: measured?.height || 240 }, { width: window.innerWidth, height: window.innerHeight });
      setPosition(previous => previous.top === next.top && previous.left === next.left ? previous : next);
    };
    function schedule() { if (frame === null) frame = window.requestAnimationFrame(refresh); }
    setTargetRect(null);
    setReadiness({ step, next: nextWasVisible, action: false });
    if (step.action?.type === 'navigate') navigateRef.current?.(step.action.tab, step.action.section);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-disabled'] });
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
      if (event.key === 'ArrowRight') { event.preventDefault(); continueRef.current?.(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); prevStep(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [activeGuide, endGuide, nextStep, prevStep]);

  if (!activeGuide || !step) return null;
  return createPortal(<div className="guide-tour-overlay">
    {targetRect?.outline && <div className="guide-tour-highlight" style={{ top: targetRect.top - 4, left: targetRect.left - 4, width: targetRect.width + 8, height: targetRect.height + 8 }} />}
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
        <CuraiButton variant="primary" onClick={continueGuide} disabled={Boolean(!nextReady && ((step.requireInteraction && !actionSelector) || (actionSelector && !canActivate)))}>{nextReady ? 'Продолжить' : actionSelector ? ((step.activateOnNext ? step.nextLabel : step.fallbackLabel) || 'Открыть') : step.requireInteraction ? step.nextLabel : currentStep === totalSteps - 1 ? 'Завершить' : 'Далее'}</CuraiButton>
      </div>
    </section>
  </div>, document.body);
}
