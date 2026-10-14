import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Modal from '../modals/Modal';
import { filterSearchNavigation, getSearchNavigation, normalizeNavigationQuery } from './navigationCatalog';

const NavigationSearch = ({ user, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const location = useLocation();
  const results = filterSearchNavigation(getSearchNavigation(user), query);
  const index = Math.min(activeIndex, Math.max(0, results.length - 1));

  const close = React.useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
          !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;

      const focused = document.activeElement;
      const editable = focused?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      if (focused !== inputRef.current && editable) return;

      event.preventDefault();
      if (!open) {
        setQuery('');
        setActiveIndex(0);
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.key, user]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    inputRef.current?.focus();
    // Restore focus for every dismissal, including route/user changes.
    return () => trigger?.focus();
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, index, query]);

  const select = (item) => {
    close();
    onNavigate(item.key);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Tab') {
      // Include the existing Modal close button in the focus loop.
      const container = panelRef.current?.closest('.modal-content');
      if (!container) return;
      const controls = [...container.querySelectorAll('button, input')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if (event.target !== inputRef.current || event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0);
    } else if (event.key === 'Enter' && results[index]) {
      event.preventDefault();
      select(results[index]);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => { setQuery(''); setActiveIndex(0); setOpen(true); }}
        aria-label="Поиск разделов"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+k Meta+k"
        title="Ctrl+K / ⌘K"
        aria-expanded={open}
        className="flex items-center gap-2 p-2 rounded-lg bg-white/15 text-white hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white transition"
      >
        <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" strokeWidth="2" />
          <path d="m16 16 4 4" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="hidden xl:inline text-sm">Поиск</span>
      </button>
      <Modal show={open} onClose={close} title="Поиск разделов" size="max-w-lg" dialogLabel="Поиск" onKeyDown={handleKeyDown}>
        <div ref={panelRef}>
          <label htmlFor="navigation-search" className="sr-only">Название раздела</label>
          <input
            id="navigation-search"
            ref={inputRef}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded="true"
            aria-controls="navigation-search-results"
            aria-describedby="navigation-search-status"
            aria-activedescendant={results[index] ? `navigation-result-${results[index].key}` : undefined}
            value={query}
            onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
            placeholder="Календарь, расписание…"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p id="navigation-search-status" className="my-3 text-sm text-gray-500 dark:text-gray-400" role="status">
            {normalizeNavigationQuery(query) ? `Найдено разделов: ${results.length}` : 'Выберите раздел или начните вводить его название.'}
          </p>
          <ul id="navigation-search-results" role="listbox" aria-label="Доступные разделы" className="max-h-[45vh] overflow-y-auto space-y-1">
            {results.map((item, resultIndex) => (
              <li
                key={item.key}
                id={`navigation-result-${item.key}`}
                role="option"
                aria-selected={resultIndex === index}
                // Keep DOM focus on the combobox; options use aria-activedescendant.
                onMouseDown={event => event.preventDefault()}
                onClick={() => select(item)}
                className={`w-full text-left px-3 py-2 rounded-lg cursor-pointer text-gray-900 dark:text-white ${resultIndex === index ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{item.section === 'hms' ? 'HMS' : item.section === 'crm' ? 'CRM' : item.section === 'finance' ? 'Финансы' : 'Склад'}{item.parent ? ` · ${item.parent}` : ''}</span>
              </li>
            ))}
          </ul>
          {!results.length && <p className="py-4 text-sm text-gray-600 dark:text-gray-300">Разделы не найдены. Попробуйте другое название.</p>}
        </div>
      </Modal>
    </>
  );
};

export default NavigationSearch;
