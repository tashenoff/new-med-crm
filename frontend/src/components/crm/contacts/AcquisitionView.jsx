import React, { useEffect, useState } from 'react';
import { sourceRequest } from '../../../utils/crmSources';
import { canAction } from '../../../utils/permissions';
import SourceExpenses from './SourceExpenses';

export default function AcquisitionView({ user }) {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    sourceRequest('/sources/configuration/catalog').then(rows => { if (active) setSources(rows); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  const source = sources.find(row => row.id === selected);
  return <section className="space-y-5 min-w-0">
    <h1 className="text-2xl font-semibold">Привлечение</h1>
    <p className="text-sm text-curai-muted">Фактические расходы и стоимость привлечения за период каждой записи. Бюджеты и договорные тарифы сюда не включаются. Разные валюты не суммируются. Число обращений — по стабильным ID, созданным в том же периоде, с тем же источником и кампанией, если она задана.</p>
    <label className="block max-w-lg text-sm">Источник<select aria-label="Источник для анализа привлечения" className="mt-1 w-full rounded-md border border-curai-control bg-curai-surface px-3 py-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Выберите источник</option>{sources.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    {error && <p role="alert" className="text-curai-negative">{error}</p>}
    {source ? <SourceExpenses key={source.id} source={source} campaigns={source.campaigns || []} canEdit={canAction(user, 'crm_view', 'crm_edit')} /> : <p className="text-sm text-curai-muted">Источник не выбран. Отсутствие записи расхода не означает бесплатное привлечение.</p>}
  </section>;
}
