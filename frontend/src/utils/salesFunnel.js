import { cardColumnId } from './kanbanColumns.js';

const HISTORICAL_LABELS = { qualified: 'Квалифицированы', rejected: 'Отказ', lost: 'Потеряны' };

// The input is the server's canonical Kanban projection, not individual inquiries.
// Preserve the configured array order and do not use global affected_count snapshots:
// counts and drilldown must describe the same filtered set of cards.
export function salesFunnel(columns, leads) {
  const stages = columns.map(column => ({ id: column.id, label: column.name, leads: [] }));
  const byId = new Map(stages.map(stage => [stage.id, stage]));
  const historical = new Map();
  const statusCounts = new Map();
  for (const lead of leads) {
    statusCounts.set(lead.status, (statusCounts.get(lead.status) || 0) + 1);
    const id = cardColumnId(lead);
    let stage = byId.get(id);
    if (!stage) {
      if (!historical.has(id)) historical.set(id, {
        id, label: HISTORICAL_LABELS[id] || 'Недоступный этап', leads: []
      });
      stage = historical.get(id);
    }
    stage.leads.push(lead);
  }
  return {
    stages,
    historicalStages: [...historical.values()],
    // Keep the existing base-status definitions of these summary metrics.
    converted: statusCounts.get('converted') || 0,
    dropped: (statusCounts.get('rejected') || 0) + (statusCounts.get('lost') || 0),
    active: ['new', 'in_progress', 'contacted', 'qualified']
      .reduce((sum, status) => sum + (statusCounts.get(status) || 0), 0)
  };
}
