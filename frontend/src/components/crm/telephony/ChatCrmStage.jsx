import React, { useCallback, useEffect, useRef, useState } from 'react';
import CuraiButton from '../../common/CuraiButton';
import CuraiPopover from '../../common/CuraiPopover';
import CuraiIcon from '../../common/CuraiIcon';
import { kanbanRequest, notifyKanbanChanged, SYSTEM_COLUMN_NAMES, KANBAN_CHANGED_EVENT } from '../../../utils/kanbanColumns';
import { useGlobalRefresh } from '../../../hooks/useGlobalRefresh';

export function widgetManualColumn(column) {
  return Boolean(column?.id?.startsWith('custom_') && !Object.hasOwn(SYSTEM_COLUMN_NAMES, column.id)
    && column.is_system === false && column.manual_move_allowed === true);
}

// The designer can style this control without duplicating linkage or transition rules.
export default function ChatCrmStage({ phone, revision, onChanged, variant = 'select' }) {
  const { refreshTriggers } = useGlobalRefresh();
  const [state, setState] = useState({ phone, context: null, loading: true, error: '' });
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = useRef(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const generation = useRef(0), locked = useRef(false), currentPhone = useRef(phone);
  currentPhone.current = phone;
  const path = `/whatsapp/kanban-stage?phone=${encodeURIComponent(phone)}`;
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState(current => ({ ...current, phone, context: current.phone === phone ? current.context : null, loading: true, error: '' }));
    try {
      const context = await kanbanRequest(`/whatsapp/kanban-stage?phone=${encodeURIComponent(phone)}`);
      if (!context || !Array.isArray(context.columns)) throw new Error('Некорректный ответ этапов CRM');
      if (request === generation.current) setState({ phone, context, loading: false, error: '' });
    } catch (error) {
      if (request === generation.current) setState(previous => ({ phone, context: previous.phone === phone ? previous.context : null, loading: false, error: error.message }));
    }
  }, [phone]);
  useEffect(() => { reload(); return () => { generation.current += 1; }; }, [reload, revision, refreshTriggers.treatmentPlans]);
  useEffect(() => {
    const refresh = () => { if (!locked.current) reload(); };
    window.addEventListener(KANBAN_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(KANBAN_CHANGED_EVENT, refresh);
  }, [reload]);
  useEffect(() => { setMenuOpen(false); }, [phone]);
  const context = state.phone === phone ? state.context : null;
  const columns = context?.columns || [];
  const current = context?.current_column_id || '';
  const currentColumn = columns.find(column => column.id === current);
  const currentLabel = currentColumn?.name || context?.current_label || 'Этап сделки';
  const change = async value => {
    const target = columns.find(column => column.id === value);
    if (locked.current || state.loading || !context?.can_move || !widgetManualColumn(target) || value === current) return;
    locked.current = true; setSaving(true);
    const activePhone = phone;
    const activeGeneration = generation.current;
    try {
      const updated = await kanbanRequest(path, 'PATCH', { column_id: value, lead_id: context.lead_id, expected_column_id: current });
      notifyKanbanChanged();
      if (currentPhone.current === activePhone && generation.current === activeGeneration) {
        setState(previous => ({ ...previous, context: Array.isArray(updated?.columns) ? updated : {
          ...context, current_column_id: value, current_label: target.name,
        }, error: '' }));
        await onChanged?.();
      }
    } catch (error) {
      if (currentPhone.current === activePhone && generation.current === activeGeneration) setState(current => ({ ...current, error: error.message }));
    } finally { locked.current = false; setSaving(false); }
  };
  const unavailable = state.phone !== phone || state.loading || saving || !context?.can_move || Boolean(state.error);
  if (variant === 'menu') return <div className="curai-chat-stage">
    <CuraiButton variant="ghost" className="curai-chat-action" disabled={unavailable} title={state.error || context?.reason || currentLabel} aria-label={`Этап сделки: ${currentLabel}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={event => { anchor.current = event.currentTarget; setMenuOpen(value => !value); }}><span className="curai-chat-stage-label">{currentLabel}</span><CuraiIcon name="chevron"/></CuraiButton>
    {menuOpen && context && <CuraiPopover anchorRef={anchor} onClose={closeMenu} label="Этап сделки">
      {!widgetManualColumn(currentColumn) && <div role="menuitemradio" aria-checked="true" aria-disabled="true" className="curai-menu-current"><CuraiIcon name="lock"/><span>{currentLabel}</span><CuraiIcon name="check"/></div>}
      {columns.filter(widgetManualColumn).map(column => <button type="button" role="menuitemradio" aria-checked={column.id === current} key={column.id} disabled={saving} className="curai-status-option" onClick={() => { closeMenu(); change(column.id); }}><span>{column.name}</span>{column.id === current && <CuraiIcon name="check"/>}</button>)}
    </CuraiPopover>}
    {state.error && <span role="alert" className="curai-stage-error">{state.error} <button type="button" onClick={reload}>Обновить этап</button></span>}
  </div>;
  return <div className="min-w-0">
    <select aria-label="Этап сделки CRM" aria-busy={state.loading || saving} value={current} disabled={unavailable}
      onChange={event => change(event.target.value)} className="h-9 px-2 max-w-full border border-curai-control rounded-md text-sm bg-curai-surface">
      {(!current || !columns.some(column => column.id === current)) && <option value={current}>{state.loading ? 'Загрузка этапа CRM…' : context?.current_label || 'Этап CRM недоступен'}</option>}
      {columns.map(column => <option key={column.id} value={column.id} disabled={!widgetManualColumn(column)}>{column.name}</option>)}
    </select>
    {(state.error || context?.reason) && <p className="text-xs text-curai-muted mt-1" role={state.error ? 'alert' : undefined}>{state.error || context.reason}</p>}
    {state.error && <button type="button" className="text-xs text-curai-blue" onClick={reload}>Обновить этап</button>}
  </div>;
}
