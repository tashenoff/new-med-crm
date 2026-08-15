import React, { useEffect, useMemo, useState } from 'react';
import { inputClasses, selectClasses } from '../modalUtils';
import {
  DURATION_OPTIONS,
  DEFAULT_APPOINTMENT_DURATION,
  SLOT_INTERVAL_MINUTES,
  addMinutes,
  getDurationMinutes,
  formatDuration,
  validateAppointmentDuration
} from '../../../config/calendarConfig';

// Значения быстрых пресетов (без "произвольного времени")
const PRESET_VALUES = DURATION_OPTIONS
  .filter(option => option.value !== 'custom')
  .map(option => option.value);

/**
 * Блок полей "Дата / Время начала / Длительность / Время окончания"
 *
 * Правила:
 *  - по умолчанию выбрана длительность 30 минут;
 *  - можно выбрать пресет или "Произвольное время" и вручную указать время окончания.
 */
const AppointmentTimeFields = ({
  appointmentForm = {},
  onDateChange = () => {},
  onTimeChange = () => {},
  onEndTimeChange = () => {}
}) => {
  const startTime = appointmentForm.appointment_time || '';
  const endTime = appointmentForm.end_time || '';

  const duration = useMemo(() => getDurationMinutes(startTime, endTime), [startTime, endTime]);
  const [isCustom, setIsCustom] = useState(false);

  // Если длительность не совпадает с пресетами — включаем режим произвольного времени
  useEffect(() => {
    if (duration && !PRESET_VALUES.includes(duration)) {
      setIsCustom(true);
    }
  }, [duration]);

  // Подставляем длительность по умолчанию (30 минут), если время окончания не задано
  useEffect(() => {
    if (startTime && !endTime) {
      onEndTimeChange(addMinutes(startTime, DEFAULT_APPOINTMENT_DURATION));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime]);

  const validation = validateAppointmentDuration(startTime, endTime);

  const selectedDuration = isCustom
    ? 'custom'
    : (PRESET_VALUES.includes(duration) ? duration : DEFAULT_APPOINTMENT_DURATION);

  const handleDurationChange = (rawValue) => {
    if (rawValue === 'custom') {
      setIsCustom(true);
      if (startTime && !endTime) {
        onEndTimeChange(addMinutes(startTime, DEFAULT_APPOINTMENT_DURATION));
      }
      return;
    }

    const minutes = parseInt(rawValue, 10);
    setIsCustom(false);
    if (startTime) {
      onEndTimeChange(addMinutes(startTime, minutes));
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Дата приема *</label>
          <input
            type="date"
            value={appointmentForm.appointment_date || ''}
            onChange={(e) => onDateChange(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className={inputClasses}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Время начала *</label>
          <input
            type="time"
            step={SLOT_INTERVAL_MINUTES * 60}
            value={startTime}
            onChange={(e) => onTimeChange(e.target.value)}
            className={inputClasses}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Длительность *</label>
          <select
            value={selectedDuration}
            onChange={(e) => handleDurationChange(e.target.value)}
            className={selectClasses}
            disabled={!startTime}
          >
            {DURATION_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Время окончания {isCustom && '*'}
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => {
              setIsCustom(true);
              onEndTimeChange(e.target.value);
            }}
            className={inputClasses}
            readOnly={!isCustom}
            title={isCustom ? '' : 'Выберите «Произвольное время», чтобы указать время вручную'}
          />
          {isCustom && (
            <p className="text-xs text-blue-600 mt-1">Произвольное время</p>
          )}
        </div>
      </div>

      {/* Итоговая длительность / ошибка */}
      {startTime && endTime && (
        validation.valid ? (
          <div className="text-sm text-gray-600">
            ⏱ Длительность приёма: <span className="font-medium">{formatDuration(validation.duration)}</span>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-md p-2 text-red-700 text-sm">
            ⚠️ {validation.message}
          </div>
        )
      )}
    </div>
  );
};

export default AppointmentTimeFields;
