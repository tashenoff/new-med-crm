import React from 'react';
import { cn, themeClasses } from '../../../hooks/useTheme';
import { firstTouchDatePresets } from '../../../utils/firstTouchDateFilter';

const FirstTouchDateFilter = ({ value, onChange }) => {
  const invalidRange = value.preset === 'custom' && value.from && value.to && value.from > value.to;
  const inputClass = cn('w-full min-w-0 rounded-lg border px-3 py-2 text-sm', themeClasses.input.default, themeClasses.input.focus);

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className={cn('mb-2 text-sm font-medium', themeClasses.text.secondary)}>Дата первого касания</legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
        <select
          aria-label="Период первого касания"
          value={value.preset}
          onChange={(event) => onChange({ ...value, preset: event.target.value })}
          className={cn(inputClass, 'sm:w-44')}
        >
          {firstTouchDatePresets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        </select>
        {value.preset === 'custom' && (
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:w-80">
            <label className={cn('min-w-0 text-xs', themeClasses.text.secondary)}>
              С
              <input
                type="date"
                aria-label="Первое касание: с"
                value={value.from}
                max={value.to || undefined}
                aria-invalid={Boolean(invalidRange)}
                aria-describedby={invalidRange ? 'first-touch-range-error' : undefined}
                onChange={(event) => onChange({ ...value, from: event.target.value })}
                className={cn(inputClass, 'mt-1')}
              />
            </label>
            <label className={cn('min-w-0 text-xs', themeClasses.text.secondary)}>
              По
              <input
                type="date"
                aria-label="Первое касание: по"
                value={value.to}
                min={value.from || undefined}
                aria-invalid={Boolean(invalidRange)}
                aria-describedby={invalidRange ? 'first-touch-range-error' : undefined}
                onChange={(event) => onChange({ ...value, to: event.target.value })}
                className={cn(inputClass, 'mt-1')}
              />
            </label>
          </div>
        )}
      </div>
      {invalidRange && <p id="first-touch-range-error" role="alert" className="text-xs text-red-600 dark:text-red-400">Дата «С» должна быть не позже даты «По».</p>}
    </fieldset>
  );
};

export default FirstTouchDateFilter;
