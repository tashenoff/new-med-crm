import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useGuide, GUIDE_STEPS } from '../../context/GuideContext';
import { useModal } from '../../context/ModalContext';

const GuideTour = ({ onNavigate }) => {
  const { openModal } = useModal();
  const { activeGuide, currentStep, nextStep, prevStep, endGuide, totalSteps } = useGuide();

  const [targetRect, setTargetRect] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const retryTimeoutRef = useRef(null);
  const lastStepRef = useRef(null);

  // Получаем текущий шаг напрямую
  const step = useMemo(() => {
    if (!activeGuide || !GUIDE_STEPS[activeGuide]) return null;
    return GUIDE_STEPS[activeGuide][currentStep] || null;
  }, [activeGuide, currentStep]);

  const calculateTooltipPosition = (rect, position = 'bottom') => {
    if (!rect) return { top: 0, left: 0 };
    const tooltipWidth = 380, tooltipHeight = 200, offset = 16, padding = 20;
    let top, left;

    switch (position) {
      case 'top':
        top = rect.top - tooltipHeight - offset;
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        break;
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        break;
      case 'left':
        top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
        left = rect.left - tooltipWidth - offset;
        break;
      case 'right':
        top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
        left = rect.right + offset;
        break;
      default:
        top = rect.bottom + offset;
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    }

    const windowWidth = window.innerWidth, windowHeight = window.innerHeight;
    if (left < padding) left = padding;
    if (left + tooltipWidth > windowWidth - padding) left = windowWidth - tooltipWidth - padding;
    if (top < padding) top = padding;
    if (top + tooltipHeight > windowHeight - padding) top = windowHeight - tooltipHeight - padding;

    return { top, left };
  };

  const findAndHighlight = () => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      setTooltipPosition(calculateTooltipPosition(rect, step.position));
    }
  };

  // Эффект для выполнения действий при смене шага
  useEffect(() => {
    if (!step || !activeGuide) return;
    
    // Проверяем, изменился ли шаг
    const stepKey = `${activeGuide}-${currentStep}`;
    if (lastStepRef.current === stepKey) return;
    lastStepRef.current = stepKey;

    // Очищаем предыдущие таймеры
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    // Сбрасываем подсветку при смене шага, чтобы старая не оставалась
    setTargetRect(null);

    // Выполняем действие шага
    if (step.action?.type === 'navigate' && onNavigate) {
      onNavigate(step.action.tab, step.action.section);
    }
    
    if (step.action?.type === 'openModal') {
      setTimeout(() => openModal(step.action.modal, {}), 300);
    }
    
    // Клик на первого пациента для открытия модалки
    if (step.action?.type === 'clickFirstPatient') {
      setTimeout(() => {
        const patientRow = document.querySelector('[data-guide="patient-row"]');
        if (patientRow) {
          patientRow.click();
          console.log('[Guide] Clicked patient row, waiting for modal...');
        } else {
          console.log('[Guide] Patient row not found');
        }
      }, 300);
    }

    // Ищем элемент с задержкой
    const findElement = (attempts = 0) => {
      if (attempts > 20) return;
      
      const target = document.querySelector(step.targetSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        setTooltipPosition(calculateTooltipPosition(rect, step.position));
      } else {
        retryTimeoutRef.current = setTimeout(() => findElement(attempts + 1), 500);
      }
    };

    // Если это клик на пациента - ждём дольше чтобы модалка открылась
    const initialDelay = step.action?.type === 'clickFirstPatient' ? 1000 : 400;
    retryTimeoutRef.current = setTimeout(findElement, initialDelay);

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [activeGuide, currentStep, step, onNavigate, openModal]);



  // Обработка клавиш
  useEffect(() => {
    if (!activeGuide) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') endGuide();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      else if (e.key === 'ArrowLeft') prevStep();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeGuide, nextStep, prevStep, endGuide]);

  // Сброс при закрытии
  useEffect(() => {
    if (!activeGuide) {
      lastStepRef.current = null;
      setTargetRect(null);
    }
  }, [activeGuide]);

  if (!activeGuide || !step) return null;

  return createPortal(
    <div className="guide-tour-overlay" style={{ pointerEvents: 'none' }}>
      <svg className="guide-tour-mask" width="100%" height="100%" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="guide-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect x={targetRect.left - 8} y={targetRect.top - 8}
                width={targetRect.width + 16} height={targetRect.height + 16} rx="8" fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0, 0, 0, 0.5)" mask="url(#guide-mask)" style={{ pointerEvents: 'none' }} />
      </svg>

      {targetRect && (
        <div className="guide-tour-highlight" style={{
          top: targetRect.top - 8, left: targetRect.left - 8,
          width: targetRect.width + 16, height: targetRect.height + 16,
          pointerEvents: 'none'
        }} />
      )}

      <div className="guide-tour-tooltip" style={{ top: tooltipPosition.top, left: tooltipPosition.left }}>
        <div className="guide-tour-tooltip-header">
          <div className="guide-tour-tooltip-step-badge">{currentStep + 1} / {totalSteps}</div>
          <button onClick={endGuide} className="guide-tour-tooltip-close" aria-label="Закрыть гид">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="guide-tour-tooltip-content">
          <h3 className="guide-tour-tooltip-title">{step.title}</h3>
          <p className="guide-tour-tooltip-description">{step.description}</p>
        </div>

        <div className="guide-tour-progress">
          {GUIDE_STEPS[activeGuide].map((_, index) => (
            <div key={index} className={`guide-tour-progress-dot ${
              index === currentStep ? 'active' : index < currentStep ? 'completed' : ''
            }`} />
          ))}
        </div>

        <div className="guide-tour-tooltip-actions">
          <button onClick={prevStep} disabled={currentStep === 0} className="guide-tour-btn guide-tour-btn-secondary">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>
          <button onClick={endGuide} className="guide-tour-btn guide-tour-btn-ghost">Пропустить</button>
          <button onClick={nextStep} className="guide-tour-btn guide-tour-btn-primary">
            {currentStep === totalSteps - 1 ? 'Завершить' : 'Далее'}
            {currentStep !== totalSteps - 1 && (
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GuideTour;
