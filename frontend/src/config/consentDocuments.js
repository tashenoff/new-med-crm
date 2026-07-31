// Конфигурация документов согласий для различных услуг
// Базовое информационное согласие применяется всегда
// Специфические согласия применяются в зависимости от выбранной услуги

export const CONSENT_DOCUMENTS = {
  // Базовое согласие (обязательно для всех)
  base: {
    id: 'informed_consent',
    title: 'Информирован​ное согласие на медицинское вмешательство',
    description: 'Общее согласие на оказание медицинских услу​г',
    url: import.meta.env.VITE_INFORMED_CONSENT_URL,
    required: true
  },
  
  // Специфические согласия по категориям услуг
  specific: {
    // Анестезия
    anesthesia: {
      id: 'anesthesia_consent',
      title: 'Согласие на анестезию',
      description: 'Согласие на проведение анестезии (местной/общей)',
      url: 'https://drive.google.com/file/d/ANESTHESIA_FILE_ID/view',
      required: true,
      keywords: ['анестезия', 'обезболивание', 'наркоз']
    },
    
    // Хирургические вмешательства
    surgery: {
      id: 'surgery_consent',
      title: 'Согласие на хирургическое вмешательство',
      description: 'Согласие на проведение хирургических операций',
      url: 'https://drive.google.com/file/d/SURGERY_FILE_ID/view',
      required: true,
      keywords: ['имплантация', 'удаление', 'резекция', 'операция', 'хирург']
    },
    
    // Рентгенологические исследования
    xray: {
      id: 'xray_consent',
      title: 'Согласие на рентгенологическое исследование',
      description: 'Согласие на проведение рентгеновских снимков',
      url: 'https://drive.google.com/file/d/XRAY_FILE_ID/view',
      required: true,
      keywords: ['рентген', 'снимок', 'ортопантомограмма', 'кт', 'томография']
    },
    
    // Ортодонтическое лечение
    orthodontics: {
      id: 'orthodontics_consent',
      title: 'Согласие на ортодонтическое лечение',
      description: 'Согласие на установку и ношение ортодонтических конструкций',
      url: 'https://drive.google.com/file/d/ORTHODONTICS_FILE_ID/view',
      required: true,
      keywords: ['брекеты', 'ортодонтия', 'исправление прикуса', 'элайнеры']
    },
    
    // Протезирование
    prosthetics: {
      id: 'prosthetics_consent',
      title: 'Согласие на протезирование',
      description: 'Согласие на изготовление и установку протезов',
      url: 'https://drive.google.com/file/d/PROSTHETICS_FILE_ID/view',
      required: true,
      keywords: ['протез', 'коронка', 'мост', 'винир']
    },
    
    // Отбеливание
    whitening: {
      id: 'whitening_consent',
      title: 'Согласие на отбеливание зубов',
      description: 'Согласие на профессиональное отбеливание',
      url: 'https://drive.google.com/file/d/WHITENING_FILE_ID/view',
      required: true,
      keywords: ['отбеливание', 'осветление']
    }
  }
};

/**
 * Определяет необходимые согласия на основе выбранных услуг
 * @param {Array} services - Массив выбранных услуг из плана лечения
 * @returns {Array} - Массив необходимых документов согласий
 */
export const getRequiredConsents = (services = []) => {
  const requiredConsents = [CONSENT_DOCUMENTS.base]; // Базовое согласие всегда
  
  if (!services || services.length === 0) {
    return requiredConsents;
  }
  
  const addedConsentIds = new Set(['informed_consent']); // Чтобы избежать дубликатов
  
  services.forEach(service => {
    const serviceName = (service.service_name || '').toLowerCase();
    
    // Проверяем каждую категорию специфических согласий
    Object.values(CONSENT_DOCUMENTS.specific).forEach(consent => {
      // Если уже добавили это согласие, пропускаем
      if (addedConsentIds.has(consent.id)) {
        return;
      }
      
      // Проверяем, содержит ли название услуги какое-либо ключевое слово
      const matchesKeyword = consent.keywords.some(keyword => 
        serviceName.includes(keyword.toLowerCase())
      );
      
      if (matchesKeyword) {
        requiredConsents.push(consent);
        addedConsentIds.add(consent.id);
      }
    });
  });
  
  return requiredConsents;
};

export default CONSENT_DOCUMENTS;
