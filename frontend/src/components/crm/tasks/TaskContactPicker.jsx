import React, { useEffect, useId, useRef, useState } from 'react';
import { apiClient, handleApiError } from '../../../api/config';

// A single identity lookup. Source permissions and deduplication belong to the server.
export default function TaskContactPicker({ value, onChange, disabled = false, allowed = true }) {
  const id = useId();
  const input = useRef(null);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setContacts([]); setActive(-1); setError(''); setLoading(false);
    if (!allowed || disabled || value || query.trim().length < 2) return;
    setLoading(true);
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get('/crm/tasks/contacts', { params: { q: query.trim(), limit: 20 }, signal: controller.signal });
        if (!cancelled) { setContacts(data.contacts || []); setActive(-1); }
      } catch (e) { if (!cancelled) setError(handleApiError(e)); }
      finally { if (!cancelled) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [query, value, disabled, allowed]);
  const choose = contact => { onChange(contact); setQuery(''); setOpen(false); setContacts([]); };
  const expanded = open && !value && query.trim().length >= 2;
  return <div className="relative min-w-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-curai-muted">Контакт <span className="font-normal">· необязательно</span></label>
    {value ? <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-curai-control px-3 py-2 text-sm">
      <span className="min-w-0"><span className="block break-words font-medium">{value.name || 'Выбранный контакт'}</span>{value.phone && <span className="block text-xs text-curai-muted">{value.phone}</span>}</span>
      <button type="button" disabled={disabled || !allowed} className="shrink-0 text-curai-muted hover:text-curai-blue disabled:opacity-50" aria-label="Убрать контакт" onClick={() => { onChange(null); setQuery(''); setOpen(false); }}>Убрать</button>
    </div> : <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`}
      aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined} aria-describedby={`${id}-hint`}
      value={query} disabled={disabled || !allowed} placeholder="Имя или телефон, от 2 символов" autoComplete="off"
      className="h-10 w-full min-w-0 rounded-md border border-curai-control bg-curai-surface px-3 text-sm text-curai-ink"
      onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(n => contacts.length ? (n + (e.key === 'ArrowDown' ? 1 : -1) + contacts.length) % contacts.length : -1); }
        if (e.key === 'Enter') { e.preventDefault(); if (expanded && contacts[active]) choose(contacts[active]); }
      }} />}
    {!value && <p id={`${id}-hint`} className="mt-1 text-xs text-curai-muted">{allowed ? 'Поиск среди доступных лидов и пациентов.' : 'Нет доступа к поиску контактов.'}</p>}
    {expanded && <div data-curai-popover className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-curai-border bg-curai-surface shadow-sm">
      {loading ? <p role="status" className="p-3 text-sm text-curai-muted">Поиск…</p> : error ? <p role="alert" className="p-3 text-sm text-curai-negative">{error}</p> : contacts.length === 0 ? <p role="status" className="p-3 text-sm text-curai-muted">Контакты не найдены</p> : null}
      <ul id={`${id}-results`} role="listbox" aria-label="Контакты" className="max-h-56 overflow-y-auto">
        {contacts.map((contact, index) => <li key={contact.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
          className={`cursor-pointer px-3 py-2 text-sm ${active === index ? 'bg-curai-subtle' : 'hover:bg-curai-subtle'}`}
          onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(contact)}>
          <span className="block font-medium break-words">{contact.name}</span><span className="text-xs text-curai-muted">{contact.source === 'patient' ? 'Пациент' : 'Лид'}{contact.phone ? ` · ${contact.phone}` : ''}</span>
        </li>)}
      </ul>
    </div>}
  </div>;
}
