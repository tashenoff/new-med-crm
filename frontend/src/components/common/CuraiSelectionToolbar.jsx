import React from 'react';

export default function CuraiSelectionToolbar({ label, query, onQueryChange, total, selected, selectedOnly, onSelectedOnlyChange }) {
  return <div className="curai-selection-toolbar">
    {onSelectedOnlyChange && <p className="curai-selection-count">Доступно: {total} · Выбрано: {selected}</p>}
    {onSelectedOnlyChange && <div className="curai-selection-tabs" role="group" aria-label="Отображение услуг">
      <button type="button" aria-pressed={!selectedOnly} onClick={() => onSelectedOnlyChange(false)}>Все ({total})</button>
      <button type="button" aria-pressed={selectedOnly} onClick={() => onSelectedOnlyChange(true)}>Выбранные ({selected})</button>
    </div>}
    <label>{label}<input type="search" value={query} aria-label={label} onChange={event => onQueryChange(event.target.value)} /></label>
  </div>;
}
