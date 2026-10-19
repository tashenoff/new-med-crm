import React, { useEffect, useState } from 'react';

const presets = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7','#DC2626','#6B7280','#0EA5E9'];

export default function CuraiColorPicker({ value, onChange, label = 'Цвет календаря' }) {
  const [hex, setHex] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => { setHex(value); }, [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(hex);
  const choose = color => { setHex(color); onChange(color); setOpen(false); };
  return <div className="curai-color-field">
    <div className="curai-color-swatch-column">
      <label>{label}</label>
      <button type="button" className="curai-color-trigger" aria-label="Палитра цвета календаря" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span style={{ backgroundColor: value }} /> <span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="curai-color-palette" role="group" aria-label="Предустановленные цвета" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
        {presets.map(color => <button key={color} type="button" aria-label={color} aria-pressed={value.toUpperCase() === color} onClick={() => choose(color)} style={{ backgroundColor: color }} />)}
        <label className="curai-color-custom">Другой цвет<input type="color" value={value} aria-label="Другой цвет календаря" onChange={event => choose(event.target.value)} /></label>
      </div>}
    </div>
    <label className="curai-color-hex">HEX
      <input value={hex} aria-label="HEX цвета календаря" aria-invalid={!valid} pattern="#[0-9A-Fa-f]{6}" maxLength={7} required onChange={event => {
        const next = event.target.value;
        setHex(next);
        if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toUpperCase());
      }} />
      {!valid && <span role="alert" className="text-curai-negative">Введите цвет в формате #RRGGBB</span>}
    </label>
  </div>;
}
