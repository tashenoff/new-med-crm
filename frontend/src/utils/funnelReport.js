import { salesFunnel } from './salesFunnel';

export function sourceComparison(sources, leads) {
  const groups = new Map(sources.map(source => [`source:${source.id}`, { key: `source:${source.id}`, name: source.name, leads: [] }]));
  for (const lead of leads) {
    const key = !lead.source_id ? 'missing-source' : groups.has(`source:${lead.source_id}`) ? `source:${lead.source_id}` : 'unavailable-source';
    if (!groups.has(key)) groups.set(key, { key, name: key === 'missing-source' ? 'Источник не указан' : 'Источник недоступен', leads: [] });
    groups.get(key).leads.push(lead);
  }
  const metrics = row => ({ ...row, total: row.leads.length, ...salesFunnel([], row.leads) });
  return [...groups.values(), { key: 'total', name: 'Итого', leads }].map(metrics);
}

export function stagePreferenceKey(user) {
  const id = user?.id || user?._id;
  return id ? `medcrm:funnel-hidden-stages:v1:${encodeURIComponent(JSON.stringify([id, user.clinic_id || user.clinic?.id || 'installation']))}` : null;
}

export function readHiddenStages(key) {
  if (!key) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value?.version === 1 && Array.isArray(value.hiddenIds) ? value.hiddenIds.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}
