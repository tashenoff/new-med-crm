// Главный файл экспорта всех API модулей
export { apiClient, API_BASE_URL, handleApiError, cleanAppointmentData, getEntityId, compareIds } from './config';

// Основные сущности
export { appointmentsApi } from './appointments';
export { patientsApi } from './patients';
export { doctorsApi } from './doctors';
export { roomsApi } from './rooms';

// Аутентификация
export { authApi } from './auth';

// Справочники и услуги
export { servicesApi } from './services';

// Объединенный API объект для удобства использования
export const api = {
  appointments: appointmentsApi,
  patients: patientsApi,
  doctors: doctorsApi,
  rooms: roomsApi,
  auth: authApi,
  services: servicesApi
};


