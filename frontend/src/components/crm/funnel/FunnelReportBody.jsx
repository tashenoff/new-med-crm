import React from 'react';
import { percent } from '../../../utils/eventFunnel';

export default function FunnelReportBody({ report, mode, view, hidden }) {
  const visible = report.totals.stages.filter(stage => !hidden.includes(stage.id));
  return <>
    <div className="curai-crm-metrics">
      <div data-report-total className="curai-crm-metric"><div className="curai-crm-metric-value">{report.totals.total}</div><div className="curai-crm-metric-label">{mode === 'history' ? 'Обращений в когорте' : 'Обращений в снимке'}</div></div>
      {mode === 'history' && <><div className="curai-crm-metric"><div className="curai-crm-metric-value">{report.totals.converted} · {percent(report.totals.conversion)}</div><div className="curai-crm-metric-label">Достигли последнего шага / все обращения когорты</div></div>
        <div className="curai-crm-metric"><div className="curai-crm-metric-value">{report.totals.open_windows}</div><div className="curai-crm-metric-label">Окно ещё открыто; доля достигших шага может вырасти</div></div></>}
    </div>
    {mode === 'history' && <p className="text-xs text-curai-muted">История не восстанавливается задним числом. Сейчас в базе {report.coverage.current_without_observed_events} обращений без наблюдаемых событий. Расчёт на {new Date(report.as_of).toLocaleString('ru-RU')}.</p>}
    {hidden.length > 0 && <p className="text-xs text-curai-muted">Некоторые строки скрыты. Это не меняет путь, когорту, итоги и знаменатели процентов.</p>}
    {view === 'stages' ? <div className="rounded-md border border-curai-border bg-curai-surface overflow-hidden">
      {!visible.length && <p className="p-4">Все строки скрыты. Откройте «Отображение этапов», чтобы вернуть их.</p>}
      {visible.map(stage => <div key={stage.id} data-funnel-stage={stage.id} className="border-b last:border-0 border-curai-border p-4 space-y-2">
        <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-words font-medium">{stage.name}</span><span data-stage-count className="shrink-0 font-semibold">{stage.count}</span></div>
        <div className="h-3 bg-curai-subtle rounded-md overflow-hidden"><div data-stage-bar className="h-full bg-curai-blue" style={{ width: `${mode === 'history' ? stage.cohort_rate || 0 : stage.share || 0}%` }} /></div>
        <div className="text-xs text-curai-muted">{mode === 'history' ? `${percent(stage.cohort_rate)} от когорты${stage.previous_id ? '; ' + percent(stage.previous_rate) + ' от шага «' + (report.totals.stages.find(item => item.id === stage.previous_id)?.name || 'недоступный этап') + '»' : ''}` : `${percent(stage.share)} от всех обращений снимка`}</div>
      </div>)}
      {mode === 'snapshot' && report.totals.outside_current_columns > 0 && <p className="p-4 text-sm">Вне текущих колонок: {report.totals.outside_current_columns}. Они включены в общий итог.</p>}
    </div> : <section aria-label="Сравнение источников" className="min-w-0 space-y-2">
      {!report.sources.length ? <p>Источники не выбраны. Нажмите «Источники», чтобы добавить их в сравнение.</p> : <>
        <p className="text-xs text-curai-muted sm:hidden">Таблица прокручивается по горизонтали.</p>
        <div tabIndex={0} className="overflow-x-auto rounded-md border border-curai-border" aria-label="Таблица сравнения источников"><table className="w-full text-sm text-left min-w-[600px]">
          <thead className="bg-curai-subtle text-curai-muted"><tr><th className="p-3 w-48">Источник</th><th className="p-3">Обращения</th>{visible.map(stage => <th key={stage.id} className="p-3 max-w-48 break-words">{stage.name}</th>)}{mode === 'history' && <th className="p-3">Последний шаг / когорта</th>}</tr></thead>
          <tbody>{[...report.sources, { ...report.totals, key: 'total', name: 'Итого' }].map(row => <tr key={row.key} data-source-comparison-key={row.key} className="border-t border-curai-border"><th scope="row" className="p-3 max-w-48 break-words font-medium">{row.name}</th><td data-comparison-total className="p-3">{row.total}</td>{visible.map(stage => <td key={stage.id} data-comparison-stage={stage.id} className="p-3">{row.stages.find(item => item.id === stage.id)?.count || 0}</td>)}{mode === 'history' && <td data-comparison-conversion className="p-3">{percent(row.conversion)}</td>}</tr>)}</tbody>
        </table></div></>}
    </section>}
  </>;
}
