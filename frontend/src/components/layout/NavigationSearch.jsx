import React, { useEffect, useRef, useState } from 'react';
import CuraiIcon from '../common/CuraiIcon';
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
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey ||
          event.altKey || event.shiftKey || event.key !== 'F2') return;

      const focused = document.activeElement;
      const editable = focused?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      if (focused !== inputRef.current && editable) return;

      event.preventDefault();
      if (!open) {
        setQuery('');
        setActiveIndex(0);
        setOpen(true);
      } else {
        inputRef.current?.focus();
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
        aria-label="Перейти к разделу"
        aria-haspopup="dialog"
        aria-keyshortcuts="F2"
        title="F2"
        aria-expanded={open}
        className="curai-search-trigger"
      >
        <CuraiIcon name="search" />
        <span className="curai-search-label">Перейти к разделу</span>
        <kbd className="curai-search-shortcut">F2</kbd>
      </button>
      <Modal show={open} onClose={close} title="Перейти к разделу" size="max-w-[640px]" className="curai-section-search" dialogLabel="Перейти к разделу" onKeyDown={handleKeyDown}
        footer={<div className="curai-search-keyboard"><span>↑ ↓ &nbsp;Выбрать</span><span>Enter &nbsp;Перейти</span><span>Esc &nbsp;Закрыть</span></div>}>
        <div ref={panelRef} className="curai-search-panel">
          <div className="curai-search-field">
          <label htmlFor="navigation-search">Название раздела</label>
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
            className="curai-search-input"
          />
          </div>
          <p id="navigation-search-status" className="curai-search-status" role="status">
            {normalizeNavigationQuery(query) ? `Найдено разделов: ${results.length}` : 'Выберите раздел или начните вводить его название.'}
          </p>
          <ul id="navigation-search-results" role="listbox" aria-label="Доступные разделы" className={`curai-search-results ${!results.length ? 'is-empty' : ''}`}>
            {results.map((item, resultIndex) => (
              <li
                key={item.key}
                id={`navigation-result-${item.key}`}
                role="option"
                aria-selected={resultIndex === index}
                // Keep DOM focus on the combobox; options use aria-activedescendant.
                onMouseDown={event => event.preventDefault()}
                onClick={() => select(item)}
                className="curai-search-result"
              >
                <span className="curai-search-result-title">{item.label}</span>
                <span className="curai-search-result-category">{item.section === 'hms' ? 'HMS' : item.section === 'crm' ? 'CRM' : item.section === 'finance' ? 'Финансы' : 'Склад'}{item.parent ? ` · ${item.parent}` : ''}</span>
              </li>
            ))}
          </ul>
          {!results.length && <div className="curai-search-empty"><h4>Разделы не найдены</h4><p>Попробуйте другое название.</p></div>}
        </div>
      </Modal>
    </>
  );
};

export default NavigationSearch;
