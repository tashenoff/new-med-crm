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
  room: [
    {
      id: 'nav-rooms',
      title: 'Шаг 1: Перейдите в кабинеты',
      description: 'Откройте «Кабинеты» в справочнике HMS. Здесь создаются кабинеты; рабочее время задаётся в разделе «Расписание врачей».',
      targetSelector: '.curai-rooms .curai-panel-title',
      action: { type: 'navigate', tab: 'room-management', section: 'hms' },
      position: 'right'
    },
    {
      id: 'room-add-button',
      title: 'Шаг 2: Откройте новый кабинет',
      description: 'Нажмите «Добавить кабинет», чтобы открыть форму.',
      targetSelector: '[data-guide="add-room-btn"]',
      activateOnNext: true,
      nextLabel: 'Открыть форму',
      advanceWhenVisible: '[data-guide="save-room-btn"]',
      position: 'bottom'
    },
    {
      id: 'room-fields',
      title: 'Шаг 3: Заполните кабинет',
      description: 'Введите название кабинета. Номер и описание можно указать дополнительно. При вводе подсказка свернётся, чтобы не закрывать поля.',
      targetSelector: '[data-guide="save-room-btn"]',
      targetAncestor: '[data-guide-form="room"]',
      collapseWhenEditing: true,
      fallbackSelector: '[data-guide="add-room-btn"]',
      fallbackLabel: 'Открыть форму',
      position: 'left'
    },
    {
      id: 'room-save',
      title: 'Шаг 4: Сохраните кабинет',
      description: 'Проверьте данные и нажмите «Сохранить» в форме. После сохранения кабинет появится в списке. «Завершить» закрывает только гид.',
      targetSelector: '[data-guide="save-room-btn"]',
      fallbackSelector: '[data-guide="add-room-btn"]',
      fallbackLabel: 'Открыть форму',
      position: 'top'
    }
  ],
  doctorSchedule: [
    {
      id: 'nav-doctor-schedule',
      title: 'Шаг 1: Откройте расписание врачей',
      description: 'В разделе «Расписание врачей» задаётся рабочее время врача и кабинет. Сначала создайте врача и кабинет, если их ещё нет.',
      targetSelector: '[data-guide="nav-doctor-schedule"]',
      action: { type: 'navigate', tab: 'doctor-schedule', section: 'hms' },
      position: 'right'
    },
    {
      id: 'doctor-schedule-add-button',
      title: 'Шаг 2: Добавьте график врача',
      description: 'Нажмите «График врача», чтобы открыть форму для одного дня недели. Для нескольких дней есть отдельная кнопка «На неделю».',
      targetSelector: '[data-guide="add-doctor-schedule-btn"]',
      activateOnNext: true,
      nextLabel: 'Открыть форму',
      advanceWhenVisible: '[data-guide="save-doctor-schedule-btn"]',
      position: 'bottom'
    },
    {
      id: 'doctor-schedule-fields',
      title: 'Шаг 3: Настройте рабочее время',
      description: 'Выберите действующего врача, день недели, время начала и окончания работы и кабинет. Кабинет обязателен. При вводе подсказка свернётся.',
      targetSelector: '[data-guide="save-doctor-schedule-btn"]',
      targetAncestor: '[data-guide-form="doctor-schedule"]',
      collapseWhenEditing: true,
      fallbackSelector: '[data-guide="add-doctor-schedule-btn"]',
      fallbackLabel: 'Открыть форму',
      position: 'left'
    },
    {
      id: 'doctor-schedule-save',
      title: 'Шаг 4: Сохраните расписание',
      description: 'Проверьте врача, день, время и кабинет, затем нажмите «Добавить» в форме. Если кабинет занят, исправьте время или выберите другой кабинет. «Завершить» закрывает только гид.',
      targetSelector: '[data-guide="save-doctor-schedule-btn"]',
      fallbackSelector: '[data-guide="add-doctor-schedule-btn"]',
      fallbackLabel: 'Открыть форму',
      position: 'top'
    }
  ],
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
      activateOnNext: true,
      nextLabel: 'Открыть форму',
      advanceWhenVisible: '[data-guide="save-appointment-btn"]',
      position: 'bottom'
    },
    {
      id: 'appointment-modal',
      collapseWhenEditing: true,
      title: 'Шаг 3: Заполните форму',
      description: 'Выберите пациента, врача, дату и время приема. Укажите причину визита.',
      targetSelector: '[data-guide="save-appointment-btn"]',
      targetAncestor: 'form',
      fallbackSelector: '[data-guide="add-appointment-btn"]',
      fallbackLabel: 'Открыть форму',
      position: 'left'
    },
    {
      id: 'appointment-save',
      title: 'Шаг 4: Создайте запись',
      description: 'После заполнения обязательных полей нажмите «Создать» в форме записи. Кнопка «Завершить» закрывает только гид.',
      targetSelector: '[data-guide="save-appointment-btn"]',
      fallbackSelector: '[data-guide="add-appointment-btn"]',
      fallbackLabel: 'Открыть форму',
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
      requireInteraction: true,
      advanceWhenVisible: '[data-guide="consultations-tab"]',
      title: 'Шаг 2: Выберите пациента',
      description: 'Нажмите на строку нужного пациента в списке. После открытия карточки гид продолжится автоматически.',
      targetSelector: '[data-guide="patient-row"]',
      position: 'bottom'
    },
    {
      id: 'consultations-tab',
      title: 'Шаг 3: Перейдите в Консультации',
      description: 'В открытой карточке пациента выберите вкладку "Консультации".',
      targetSelector: '[data-guide="consultations-tab"]',
      activateOnNext: true,
      nextLabel: 'Открыть консультации',
      advanceWhenVisible: '[data-guide="new-consultation-btn"]',
      position: 'bottom'
    },
    {
      id: 'create-consultation',
      activateOnNext: true,
      nextLabel: 'Открыть форму',
      advanceWhenVisible: '.curai-consultation-form',
      title: 'Шаг 4: Создайте консультационный лист',
      description: 'Нажмите кнопку "Добавить", заполните данные осмотра и добавьте услуги.',
      targetSelector: '[data-guide="new-consultation-btn"]',
      action: { type: 'highlight' },
      position: 'bottom'
    },
    {
      id: 'consultation-fields',
      collapseWhenEditing: true,
      title: 'Шаг 5: Заполните консультацию',
      description: 'Выберите врача и заполните клинические данные консультации. Далее добавим услуги из прайса.',
      targetSelector: '.curai-consultation-form select[required]',
      fallbackSelector: '[data-guide="new-consultation-btn"]',
      fallbackLabel: 'Открыть форму',
      position: 'bottom'
    },
    {
      id: 'open-services',
      title: 'Шаг 6: Откройте выбор услуг',
      description: 'Нажмите «Выбрать услуги», чтобы открыть прайс-лист в консультации.',
      targetSelector: '.curai-open-service-picker',
      activateOnNext: true,
      nextLabel: 'Выбрать услуги',
      advanceWhenVisible: '.curai-clinical-service-dialog',
      position: 'top'
    },
    {
      id: 'select-services',
      title: 'Шаг 7: Добавьте нужные услуги',
      description: 'Отметьте услуги в прайс-листе, проверьте количество и нажмите «Добавить». Гид продолжится, когда услуги появятся в консультации.',
      targetSelector: '.curai-clinical-service-dialog',
      requireInteraction: true,
      advanceWhenVisible: '.curai-consultation-selected-services',
      waitForAbsent: '.curai-clinical-service-dialog',
      fallbackSelector: '.curai-open-service-picker',
      fallbackLabel: 'Выбрать услуги',
      position: 'right'
    },
    {
      id: 'create-treatment-plan',
      title: 'Шаг 8: Проверьте и сохраните консультацию',
      description: 'Проверьте услуги и сумму. Нажмите «Сохранить» в консультации, чтобы сохранить её и создать план лечения. Кнопка «Завершить» закрывает только гид.',
      targetSelector: '[data-guide="create-treatment-plan-btn"]',
      fallbackSelector: '[data-guide="new-consultation-btn"]',
      fallbackLabel: 'Открыть форму',
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
  
  const openGuideModal = useCallback(() => { setActiveGuide(null); setCurrentStep(0); setShowStartModal(true); }, []);
  
  const closeGuideModal = useCallback((rememberChoice = false) => {
    setShowStartModal(false);
    if (rememberChoice && dontShowAgain) {
      localStorage.setItem('guide_dont_show', 'true');
    }
    localStorage.setItem('guide_seen', 'true');
  }, [dontShowAgain]);
  
  const startGuide = useCallback((guideType) => {
    if (!GUIDE_STEPS[guideType]) return;
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
