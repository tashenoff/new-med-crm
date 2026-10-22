import React, { useState } from 'react';
import Modal from '../../modals/Modal';
import '../crmReports.css';

const action = 'curai-button curai-button-secondary';
export default function FunnelSettings({ panel, stages, sources, initial, onClose, onDone, loading = false, error = '', onRetry, needsSteps = false, onConfigureSteps }) {
  const [draft, setDraft] = useState(initial);
  const toggle = id => setDraft(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  const label = id => stages.find(stage => stage.id === id)?.name || `Архивный этап (${id})`;
  const reorder = (index, direction) => {
    const next = [...draft], other = index + direction;
    [next[index], next[other]] = [next[other], next[index]];
    setDraft(next);
  };
  const unavailable = panel !== 'sources' && !stages.length;
  return <Modal show onClose={onClose} title={panel === 'steps' ? 'Последовательность прохождения' : panel === 'sources' ? 'Источники для сравнения' : 'Видимость строк отчёта'} size="max-w-xl" className="curai-crm-dialog" footer={<div className="curai-crm-modal-actions"><button type="button" className={action} onClick={onClose}>Закрыть</button><button type="button" className="curai-button curai-button-primary" disabled={loading || Boolean(error) || needsSteps || unavailable || (panel === 'steps' && (draft.length < 2 || draft.length > 30))} onClick={() => onDone(draft)}>Готово</button></div>}>
    <div className="space-y-4">
      {loading ? <p role="status">Загрузка этапов и источников CRM…</p>
        : error ? <div role="alert"><p>Не удалось загрузить список: {error}</p><button type="button" className={action} onClick={onRetry}>Повторить загрузку</button></div>
          : needsSteps ? <div><p>Сначала выберите шаги прохождения. Здесь настраивается только видимость уже выбранных шагов.</p><button type="button" className={action} onClick={onConfigureSteps}>Выбрать шаги воронки</button></div>
            : unavailable ? <div role="status"><p>Нет доступных этапов в ответе CRM. Это не нулевой результат воронки.</p><button type="button" className={action} onClick={onRetry}>Повторить загрузку</button></div>
              : panel === 'steps' ? <>
        <p className="text-sm text-curai-muted">Это определение пути, оно меняет расчёт. Выберите от двух до тридцати шагов и задайте порядок. Каждый этап участвует только при явном выборе.</p>
        <ol className="space-y-2">{draft.map((id, index) => <li key={id} className="flex items-start gap-2 text-sm"><span className="flex-1 min-w-0 break-words">{index + 1}. {label(id)}</span><button type="button" className={action} aria-label={`Поднять ${label(id)}`} disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" className={action} aria-label={`Опустить ${label(id)}`} disabled={index === draft.length - 1} onClick={() => reorder(index, 1)}>↓</button></li>)}</ol>
        {stages.map(stage => <label key={stage.id} className="flex gap-2 text-sm"><input type="checkbox" data-definition-stage={stage.id} checked={draft.includes(stage.id)} onChange={() => toggle(stage.id)} /><span className="min-w-0 break-words">{stage.name}</span></label>)}
      </> : panel === 'sources' ? <>
        <div className="flex gap-3 text-sm"><button type="button" className="underline" onClick={() => setDraft(sources.map(item => item.key))}>Выбрать все</button><button type="button" className="underline" onClick={() => setDraft([])}>Снять выбор</button></div>
        {sources.map(item => <label key={item.key} className="flex gap-2 text-sm"><input type="checkbox" data-comparison-source={item.key} checked={draft.includes(item.key)} onChange={() => toggle(item.key)} /><span className="min-w-0 break-words">{item.name}</span></label>)}
      </> : <>
        <p className="text-sm text-curai-muted">Только отображение. Скрытие строк не меняет последовательность прохождения и расчёт конверсии.</p>
        <div className="flex gap-3 text-sm"><button type="button" className="underline" onClick={() => setDraft([])}>Показать все</button><button type="button" className="underline" onClick={() => setDraft(stages.map(stage => stage.id))}>Скрыть все</button></div>
        {stages.map(stage => <label key={stage.id} className="flex gap-2 text-sm"><input type="checkbox" data-stage-visibility={stage.id} checked={!draft.includes(stage.id)} onChange={() => toggle(stage.id)} /><span className="min-w-0 break-words">{stage.name}</span></label>)}
      </>}
    </div>
  </Modal>;
}
