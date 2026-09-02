import React from 'react';
import { createPortal } from 'react-dom';
import { useGuide } from '../../context/GuideContext';

const GuideTourModal = () => {
  const { 
    showStartModal, 
    closeGuideModal, 
    startGuide, 
    dontShowAgain, 
    setDontShowAgain 
  } = useGuide();

  if (!showStartModal) return null;

  const handleClose = () => {
    closeGuideModal(true);
  };

  const handleStartGuide = (guideType) => {
    startGuide(guideType);
  };

  const modalContent = (
    <div className="guide-modal-overlay">
      <div className="guide-modal-backdrop" onClick={handleClose} />
      <div className="guide-modal-container">
        <div className="guide-modal-content">
          {/* Заголовок */}
          <div className="guide-modal-header">
            <div className="guide-modal-icon">
              <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="guide-modal-title">Добро пожаловать в Мед Ассистент!</h2>
            <p className="guide-modal-subtitle">
              Выберите раздел, о котором хотите узнать подробнее. 
              Мы проведём вас по основным функциям системы.
            </p>
          </div>

          {/* Опции гида */}
          <div className="guide-options">
            {/* Опция 1: Запись на прием */}
            <button
              onClick={() => handleStartGuide('appointment')}
              className="guide-option-card"
            >
              <div className="guide-option-icon guide-option-icon-blue">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="guide-option-content">
                <h3 className="guide-option-title">Как добавить запись на прием</h3>
                <p className="guide-option-description">
                  Узнайте, как быстро создать новую запись пациента на прием к врачу
                </p>
              </div>
              <div className="guide-option-arrow">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Опция 2: План лечения */}
            <button
              onClick={() => handleStartGuide('treatmentPlan')}
              className="guide-option-card"
            >
              <div className="guide-option-icon guide-option-icon-green">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div className="guide-option-content">
                <h3 className="guide-option-title">Как добавить план лечения</h3>
                <p className="guide-option-description">
                  Научитесь создавать планы лечения для пациентов с услугами и ценами
                </p>
              </div>
              <div className="guide-option-arrow">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>

          {/* Чекбокс "Больше не показывать" */}
          <div className="guide-modal-checkbox">
            <label className="guide-checkbox-label">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="guide-checkbox-input"
              />
              <span className="guide-checkbox-custom"></span>
              <span className="guide-checkbox-text">Больше не показывать это окно</span>
            </label>
          </div>

          {/* Кнопка закрытия */}
          <div className="guide-modal-footer">
            <button
              onClick={handleClose}
              className="guide-skip-button"
            >
              Пропустить
            </button>
          </div>

          {/* Кнопка закрытия (крестик) */}
          <button
            onClick={handleClose}
            className="guide-close-button"
            aria-label="Закрыть"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default GuideTourModal;
