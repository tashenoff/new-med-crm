import React from 'react';
import { sourceComparison } from '../../../utils/funnelReport';

export default function SourceComparison({ sources, leads }) {
  return <section aria-label="Сравнение источников" className="min-w-0 space-y-3">
    <p className="text-sm text-curai-muted">Все источники за выбранный период. Фильтр источника режима «По этапам» здесь не применяется.</p>
    <p className="text-sm text-curai-muted">Конверсия = «Пациент пришёл» / все обращения строки. Используется текущий статус обращения, без восстановления истории переходов. «Закрыта» не включается в конвертированные.</p>
    <p className="text-xs text-curai-muted sm:hidden">Таблица прокручивается по горизонтали.</p>
    <div tabIndex={0} aria-label="Таблица сравнения источников" className="overflow-x-auto rounded-md border border-curai-border">
      <table className="table-fixed w-full min-w-[650px] text-sm text-left">
        <thead className="bg-curai-subtle"><tr>{['Источник', 'Обращения', 'Пациент пришёл', 'Конверсия', 'Потеряно', 'В обработке'].map((title, index) => <th key={title} className={`p-3 font-medium ${index === 0 ? 'w-48 sm:w-72' : ''}`}>{title}</th>)}</tr></thead>
        <tbody>{sourceComparison(sources, leads).map(row => <tr key={row.key} data-source-comparison-key={row.key} className={`border-t border-curai-border ${row.key === 'total' ? 'font-semibold bg-curai-subtle' : ''}`}>
          <th scope="row" className="p-3 max-w-xs break-words font-medium">{row.name}</th>
          {[row.total, row.converted, row.total ? `${Math.round(row.converted / row.total * 100)}%` : '—', row.dropped, row.active].map((value, index) => <td key={index} data-comparison-metric className="p-3 tabular-nums">{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
