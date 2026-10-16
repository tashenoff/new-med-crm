import { useState, useCallback, useRef, useEffect } from 'react';
import { formatPhoneNumber, formatPhoneChange, PHONE_VALID_DIGITS } from './phoneFormatter';
export { formatPhoneNumber, PHONE_MAX_DIGITS, PHONE_VALID_DIGITS } from './phoneFormatter';

// Проверка полноты номера (11 цифр с кодом страны +7)
export const isValidPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === PHONE_VALID_DIGITS;
};

// Хук для работы с полем телефона: форматирование, ограничение, валидация
// и проверка наличия номера в базе (если передан onCheckPatient)
export const usePhoneInput = (initialValue = '', onChange, onCheckPatient = null, sessionKey = null) => {
  // Keep the existing display formatting for stored values.
  const [value, setValue] = useState(() => formatPhoneNumber(initialValue));
  const [isChecking, setIsChecking] = useState(false);
  const [foundData, setFoundData] = useState(null); // { patient, active_lead } из check-phone
  const checkTimeoutRef = useRef(null);

  const checkGenerationRef = useRef(0);
  const valueRef = useRef(value);
  const invalidateChecks = useCallback(() => {
    checkGenerationRef.current += 1;
    clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = null;
    setFoundData(null);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    invalidateChecks();
    return () => {
      checkGenerationRef.current += 1;
      clearTimeout(checkTimeoutRef.current);
    };
  }, [sessionKey, invalidateChecks]);

  const runPhoneCheck = useCallback((formattedPhone) => {
    invalidateChecks();
    if (!onCheckPatient || !isValidPhone(formattedPhone)) return;
    const generation = checkGenerationRef.current;
    setIsChecking(true);
    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await onCheckPatient(formattedPhone);
        if (generation === checkGenerationRef.current) setFoundData(result || null);
      } catch (error) {
        if (generation === checkGenerationRef.current) {
          console.error('Error checking phone:', error);
          setFoundData(null);
        }
      } finally {
        if (generation === checkGenerationRef.current) setIsChecking(false);
      }
    }, 300);
  }, [onCheckPatient, invalidateChecks]);

  const handlePhoneChange = useCallback(
    (e) => {
      const formatted = formatPhoneChange(e.target.value);
      valueRef.current = formatted;
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
    invalidateChecks();
    valueRef.current = '';
    setValue('');
  }, [invalidateChecks]);

  const syncValue = useCallback((newValue) => {
    const formatted = formatPhoneNumber(newValue);
    // A parent echo of our own input must not cancel its debounce.
    if (formatted !== valueRef.current) invalidateChecks();
    valueRef.current = formatted;
    setValue(formatted);
  }, [invalidateChecks]);

  return {
    value,
    setValue,
    handlePhoneChange,
    reset,
    syncValue,
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
