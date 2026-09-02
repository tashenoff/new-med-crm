import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const GuideContext = createContext();

export const useGuide = () => {
  const context = useContext(GuideContext);
  if (!context) {
    throw new Error('useGuide must be used within a GuideProvider');
  }
  return context;
};

// Определение шагов для каждого гида
export const GUIDE_STEPS = {
  // Гид: Как добавить запись на прием
  appointment: [
    {
      id: 'nav-calendar',
      title: 'Шаг 1: Перейдите в Календарь',
      description: 'Нажмите на раздел "Календарь" в левом меню для просмотра расписания приемов.',
      targetSelector: '[data-guide="nav-calendar"]',
      action: { type: 'navigate', tab: 'calendar', section: 'hms' },
      position: 'right'
    },
    {
      id: 'calendar-add-button',
      title: 'Шаг 2: Создайте новую запись',
      description: 'Нажмите кнопку "Новая запись" или кликните на свободный слот в календаре.',
      targetSelector: '[data-guide="add-appointment-btn"]',
      action: { type: 'click' },
      position: 'bottom'
    },
    {
      id: 'appointment-modal',
      title: 'Шаг 3: Заполните форму',
      description: 'Выберите пациента, врача, дату и время приема. Укажите причину визита.',
      targetSelector: '.modal-content',
      action: { type: 'openModal', modal: 'appointment' },
      position: 'left'
    },
    {
      id: 'appointment-save',
      title: 'Шаг 4: Сохраните запись',
      description: 'После заполнения всех полей нажмите кнопку "Сохранить".',
      targetSelector: '[data-guide="save-appointment-btn"]',
      action: { type: 'highlight' },
      position: 'top'
    }
  ],
  
  // Гид: Как добавить план лечения для пациента
  treatmentPlan: [
    {
      id: 'nav-patients',
      title: 'Шаг 1: Перейдите к Пациентам',
      description: 'Нажмите на раздел "Пациенты" в левом меню для просмотра списка пациентов.',
      targetSelector: '[data-guide="nav-patients"]',
      action: { type: 'navigate', tab: 'patients', section: 'hms' },
      position: 'right'
    },
    {
      id: 'patient-select',
      title: 'Шаг 2: Выберите пациента',
      description: 'Нажмите "Далее" и мы откроем карточку первого пациента.',
      targetSelector: '[data-guide="patient-row"]',
      position: 'bottom'
    },
    {
      id: 'consultations-tab',
      title: 'Шаг 3: Перейдите в Консультации',
      description: 'В карточке пациента выберите вкладку "Консультации" для создания консультационного листа.',
      targetSelector: '[data-guide="consultations-tab"]',
      action: { type: 'clickFirstPatient' },
      position: 'bottom'
    },
    {
      id: 'create-consultation',
      title: 'Шаг 4: Создайте консультационный лист',
      description: 'Нажмите кнопку "Добавить", заполните данные осмотра и добавьте услуги.',
      targetSelector: '[data-guide="new-consultation-btn"]',
      action: { type: 'highlight' },
      position: 'bottom'
    },
    {
      id: 'create-treatment-plan',
      title: 'Шаг 5: Сохраните и создайте план лечения',
      description: 'Добавьте услуги в консультационный лист. При сохранении автоматически создастся план лечения с выбранными услугами.',
      targetSelector: '[data-guide="create-treatment-plan-btn"]',
      action: { type: 'highlight' },
      position: 'top'
    }
  ]
};

export function GuideProvider({ children }) {
  const [showStartModal, setShowStartModal] = useState(false);
  const [activeGuide, setActiveGuide] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(() => {
    return localStorage.getItem('guide_dont_show') === 'true';
  });
  
  // Автопоказ гида отключён — модалка открывается только по кнопке "Помощь"
  
  const openGuideModal = useCallback(() => setShowStartModal(true), []);
  
  const closeGuideModal = useCallback((rememberChoice = false) => {
    setShowStartModal(false);
    if (rememberChoice && dontShowAgain) {
      localStorage.setItem('guide_dont_show', 'true');
    }
    localStorage.setItem('guide_seen', 'true');
  }, [dontShowAgain]);
  
  const startGuide = useCallback((guideType) => {
    setActiveGuide(guideType);
    setCurrentStep(0);
    setShowStartModal(false);
    localStorage.setItem('guide_seen', 'true');
  }, []);
  
  const nextStep = useCallback(() => {
    if (!activeGuide) return;
    const steps = GUIDE_STEPS[activeGuide];
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setActiveGuide(null);
      setCurrentStep(0);
    }
  }, [activeGuide, currentStep]);
  
  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }, [currentStep]);
  
  const endGuide = useCallback(() => {
    setActiveGuide(null);
    setCurrentStep(0);
  }, []);
  
  const goToStep = useCallback((stepIndex) => {
    if (!activeGuide) return;
    const steps = GUIDE_STEPS[activeGuide];
    if (stepIndex >= 0 && stepIndex < steps.length) setCurrentStep(stepIndex);
  }, [activeGuide]);
  
  const getCurrentStep = useCallback(() => {
    if (!activeGuide) return null;
    return GUIDE_STEPS[activeGuide][currentStep];
  }, [activeGuide, currentStep]);
  
  const getGuideSteps = useCallback(() => {
    if (!activeGuide) return [];
    return GUIDE_STEPS[activeGuide];
  }, [activeGuide]);
  
  const resetGuide = useCallback(() => {
    localStorage.removeItem('guide_seen');
    localStorage.removeItem('guide_dont_show');
    setDontShowAgain(false);
    setShowStartModal(true);
  }, []);
  
  const value = {
    showStartModal, activeGuide, currentStep, dontShowAgain, setDontShowAgain,
    openGuideModal, closeGuideModal, startGuide, nextStep, prevStep, endGuide,
    goToStep, getCurrentStep, getGuideSteps, resetGuide,
    totalSteps: activeGuide ? GUIDE_STEPS[activeGuide].length : 0
  };
  
  return (
    <GuideContext.Provider value={value}>
      {children}
    </GuideContext.Provider>
  );
}
