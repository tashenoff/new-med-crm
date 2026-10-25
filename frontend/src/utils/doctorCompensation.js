export const initializeDoctorForm = (doctor = {}) => {
  const services = Array.isArray(doctor.services) ? doctor.services : [];
  const specialties = doctor.specialties?.length ? [...doctor.specialties] : doctor.specialty ? [doctor.specialty] : [];
  return {
    full_name: doctor.full_name ?? '',
    specialty: doctor.specialty || specialties[0] || null,
    specialties,
    phone: doctor.phone ?? '',
    calendar_color: doctor.calendar_color || '#3B82F6',
    payment_type: doctor.payment_type || 'percentage',
    payment_value: doctor.payment_value ?? 0,
    hybrid_fixed_amount: doctor.hybrid_fixed_amount ?? 0,
    hybrid_percentage_value: doctor.hybrid_percentage_value ?? 0,
    currency: doctor.currency || 'KZT',
    services: services.map(service => typeof service === 'object' ? { ...service } : service),
    payment_mode: doctor.payment_mode || (services.some(service => typeof service === 'object') ? 'individual' : 'general'),
    consultation_compensation_mode: doctor.consultation_compensation_mode ?? '',
    consultation_currency: doctor.consultation_currency || 'KZT',
    consultation_hybrid_fixed_amount: doctor.consultation_hybrid_fixed_amount ?? 0,
    consultation_payment_type: doctor.consultation_payment_type || 'percentage',
    consultation_payment_value: doctor.consultation_payment_value ?? 0,
    consultation_hybrid_percentage_value: doctor.consultation_hybrid_percentage_value ?? 0
  };
};

const hasServiceOverride = service => service && typeof service === 'object' &&
  ['commission_type', 'commission_value', 'commission_currency'].some(field => Object.hasOwn(service, field));

// Untouched selection is just a service ID; never manufacture a zero tariff.
export const serializeDoctorServices = (selected, commissions, mode) => selected.map(serviceId => {
  const commission = commissions[serviceId];
  if (mode !== 'individual' || !commission) return serviceId;
  return { service_id: serviceId, commission_type: commission.type,
    commission_value: commission.value, commission_currency: commission.currency ?? 'KZT' };
});

export const updateServiceCommission = (commissions, serviceId, field, value) => {
  const next = { ...commissions };
  if ((field === 'type' && value === 'inherit') || (field === 'value' && value === '')) {
    delete next[serviceId];
  } else {
    next[serviceId] = { type: 'percentage', value: '', currency: 'KZT', ...next[serviceId], [field]: value };
  }
  return next;
};

export const initializeDoctorServices = (form) => {
  const commissions = {};
  const selected = form.services.map(service => {
    if (typeof service !== 'object') return service;
    const serviceId = service.service_id || service.id;
    if (hasServiceOverride(service)) {
      commissions[serviceId] = {
        type: service.commission_type ?? '',
        value: service.commission_value,
        currency: service.commission_currency ?? 'KZT'
      };
    }
    return serviceId;
  });
  return { selected, commissions };
};

const numericValue = value => value === '' || value == null ? 0 : Number(value);

const boundedValue = (value, percentage = false) => {
  const number = numericValue(value);
  return Number.isFinite(number) && number >= 0 && (!percentage || number <= 100) ? number : 0;
};

const validateValue = (value, percentage, label) => {
  const number = numericValue(value);
  if (!Number.isFinite(number) || number < 0 || (percentage && number > 100)) {
    throw new Error(`${label}: ${percentage ? 'процент должен быть от 0 до 100' : 'сумма KZT должна быть неотрицательной'}.`);
  }
};

const validateScheme = (type, value, hybridPercentage, label) => {
  if (!['percentage', 'fixed', 'hybrid'].includes(type)) throw new Error(`${label}: выберите тип оплаты.`);
  validateValue(value, type === 'percentage', label);
  if (type === 'hybrid') validateValue(hybridPercentage, true, `${label}, процентная часть`);
};

export const buildDoctorPayload = (doctor, { includeCompensation = true } = {}) => {
  const form = initializeDoctorForm(doctor);
  // Match DoctorCreate's optional phone validation before sending a rejected request.
  const phone = String(form.phone || '').trim();
  if (phone && (!/^[0-9 +()\-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7)) {
    throw new Error('Телефон: укажите не менее 7 цифр; допустимы только цифры, пробелы и символы + - ( ).');
  }
  if (!includeCompensation) {
    return { full_name: form.full_name.trim(), specialty: form.specialty,
      specialties: form.specialties, phone: phone || null, calendar_color: form.calendar_color };
  }
  if (form.currency !== 'KZT' || form.consultation_currency !== 'KZT' || form.services.some(service => typeof service === 'object' && service.commission_currency && service.commission_currency !== 'KZT')) {
    throw new Error('В записи есть иностранная валюта. Автоматическая конвертация запрещена; требуется явное согласование значений в KZT.');
  }
  if (!['general', 'individual'].includes(form.payment_mode)) throw new Error('Выберите режим комиссий.');
  if (!['none', 'inherit', 'separate'].includes(form.consultation_compensation_mode)) {
    throw new Error('Выберите режим оплаты консультаций.');
  }
  if (form.payment_mode === 'general' || form.consultation_compensation_mode === 'inherit' || form.services.some(service => !hasServiceOverride(service))) {
    validateScheme(form.payment_type, form.payment_value, form.hybrid_percentage_value, 'Основная оплата');
  }
  if (form.consultation_compensation_mode === 'separate') {
    validateScheme(form.consultation_payment_type, form.consultation_payment_value, form.consultation_hybrid_percentage_value, 'Оплата консультаций');
  }
  if (form.payment_mode === 'individual') {
    for (const service of form.services) {
      if (!hasServiceOverride(service)) continue;
      if (!['percentage', 'fixed'].includes(service.commission_type) || service.commission_value === '' || service.commission_value == null ||
          !['number', 'string'].includes(typeof service.commission_value) || String(service.commission_value).trim() === '') {
        throw new Error('Выберите процентную или фиксированную комиссию услуги.');
      }
      validateValue(service.commission_value, service.commission_type === 'percentage', 'Комиссия услуги');
    }
  }
  return {
    ...form,
    full_name: form.full_name.trim(),
    phone: form.phone || null,
    hybrid_fixed_amount: form.hybrid_fixed_amount ? boundedValue(form.payment_value) : 0,
    consultation_hybrid_fixed_amount: form.consultation_hybrid_fixed_amount ? boundedValue(form.consultation_payment_value) : 0,
    payment_value: boundedValue(form.payment_value, form.payment_type === 'percentage'),
    hybrid_percentage_value: boundedValue(form.hybrid_percentage_value, true),
    consultation_payment_value: boundedValue(form.consultation_payment_value, form.consultation_payment_type === 'percentage'),
    consultation_hybrid_percentage_value: boundedValue(form.consultation_hybrid_percentage_value, true),
    services: form.services.map(service => hasServiceOverride(service) ? {
      service_id: service.service_id || service.id,
      commission_type: service.commission_type,
      commission_value: boundedValue(service.commission_value, service.commission_type === 'percentage'),
      commission_currency: service.commission_currency || 'KZT'
    } : typeof service === 'object' ? service.service_id || service.id : service)
  };
};

export const formatCompensation = (type, value, hybridPercentage, currency = 'KZT', occurrence = 'услугу/приём') => {
  const amount = Number(value ?? 0).toLocaleString('ru-RU');
  if (type === 'percentage') return `${amount}% от выручки`;
  const fixed = `${amount} ${currency} за завершённую ${occurrence}`;
  if (type === 'hybrid') return `${fixed} + ${hybridPercentage ?? 0}% от выручки`;
  if (type === 'fixed') return fixed;
  return 'Не указан';
};

export const formatConsultationCompensation = doctor => {
  if (doctor.consultation_compensation_mode === 'none') return 'Консультации: без оплаты';
  if (doctor.consultation_compensation_mode === 'inherit') return `Консультации: основная схема — ${formatCompensation(doctor.payment_type, doctor.payment_value, doctor.hybrid_percentage_value, doctor.currency || 'KZT', 'консультацию')}`;
  if (doctor.consultation_compensation_mode === 'separate') return `Консультации: ${formatCompensation(doctor.consultation_payment_type, doctor.consultation_payment_value, doctor.consultation_hybrid_percentage_value, 'KZT', 'консультацию')}`;
  return 'Консультации: режим не указан';
};
