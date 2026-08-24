import { useState, useCallback, useRef, useEffect } from 'react';

// Количество цифр для валидного номера: код страны (+7) + 10 цифр номера
export const PHONE_MAX_DIGITS = 11;
export const PHONE_VALID_DIGITS = 11;

// Форматирование телефона: убираем всё кроме цифр, ограничиваем длину, добавляем + в начало
export const formatPhoneNumber = (value = '') => {
  // Убираем всё кроме цифр
  let digits = String(value).replace(/\D/g, '');

  // Ограничиваем максимальное количество цифр
  digits = digits.slice(0, PHONE_MAX_DIGITS);

  // Если нет цифр, возвращаем пустую строку
  if (digits.length === 0) {
    return '';
  }

  // Просто добавляем + в начало
  return '+' + digits;
};

// Проверка полноты номера (11 цифр с кодом страны +7)
export const isValidPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === PHONE_VALID_DIGITS;
};

// Хук для работы с полем телефона: форматирование, ограничение, валидация
// и проверка наличия номера в базе (если передан onCheckPatient)
export const usePhoneInput = (initialValue = '', onChange, onCheckPatient = null) => {
  // Форматируем начальное значение (на случай если пришло из БД без форматирования)
  const [value, setValue] = useState(() => formatPhoneNumber(initialValue));
  const [isChecking, setIsChecking] = useState(false);
  const [foundData, setFoundData] = useState(null); // { patient, active_lead } из check-phone
  const checkTimeoutRef = useRef(null);

  // Очищаем таймер при размонтировании
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  // Проверка телефона в базе (как в CRM — только при полном номере, с debounce)
  const runPhoneCheck = useCallback(
    async (formattedPhone) => {
      if (!onCheckPatient) return;

      // Очищаем предыдущий таймер
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }

      const digits = String(formattedPhone || '').replace(/\D/g, '');

      // Проверяем только если введён полный номер (11 цифр с +7)
      if (digits.length < PHONE_VALID_DIGITS) {
        setFoundData(null);
        setIsChecking(false);
        return;
      }

      setIsChecking(true);

      // Небольшая задержка для плавности UI
      checkTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await onCheckPatient(formattedPhone);
          setFoundData(result || null);
        } catch (error) {
          console.error('Error checking phone:', error);
          setFoundData(null);
        } finally {
          setIsChecking(false);
        }
      }, 300);
    },
    [onCheckPatient]
  );

  const handlePhoneChange = useCallback(
    (e) => {
      const formatted = formatPhoneNumber(e.target.value);
      setValue(formatted);
      if (onChange) {
        onChange(formatted);
      }
      // Запускаем проверку наличия номера в базе
      runPhoneCheck(formatted);
    },
    [onChange, runPhoneCheck]
  );

  const reset = useCallback(() => {
    setValue('');
    setFoundData(null);
    setIsChecking(false);
  }, []);

  return {
    value,
    setValue,
    handlePhoneChange,
    reset,
    // Обновляем внешнее состояние если значение изменилось снаружи (форматированное)
    syncValue: useCallback((newValue) => {
      setValue(formatPhoneNumber(newValue));
      setFoundData(null);
    }, []),
    // Готовый объект пропсов для <input>
    phoneInputProps: {
      type: 'tel',
      value,
      onChange: handlePhoneChange,
    },
    // Вспомогательные проверки
    isValid: isValidPhone(value),
    numericValue: value.replace(/\D/g, ''),
    // Результат проверки на дубликат
    isChecking,
    foundData,
    hasMatch: Boolean(foundData?.patient || foundData?.active_lead),
  };
};

export default usePhoneInput;