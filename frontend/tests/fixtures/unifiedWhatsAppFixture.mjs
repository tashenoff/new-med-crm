import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export const patient = { id: 'synthetic-patient', full_name: 'Synthetic Patient', phone: '77011234567', notes: '', source: 'other' };
export const lead = { id: 'synthetic-lead', first_name: 'Synthetic', last_name: 'Lead', full_name: 'Synthetic Lead',
  phone: '442071234567', status: 'new', source: 'website', created_at: '2026-10-22T01:00:00Z' };
export const allPermissions = ['crm_view', 'crm_edit', 'patients_view', 'patients_edit', 'patients_export', 'calendar_view', 'calendar_edit'];

export function fixture(options = {}) {
  const f = { user: { permissions: allPermissions }, patient: structuredClone(patient), otherPhone: '+442071234567',
    chats: [{ phone: '+77011234567', patient_name: patient.full_name, patient_id: patient.id, source: 'patient' }],
    showCrm: false, requests: [], ...options };
  const noop = async () => {};
  f.crm = { leads: [lead], sources: [], managers: [], loading: false, fetchLeads: noop,
    fetchSources: noop, fetchAvailableManagers: noop, clearError: noop };
  f.columns = ['new', 'contacted', 'in_progress', 'converted', 'closed'].map(id => ({ id, name: id, is_system: true }));
  f.api = async (method, path, body) => {
    f.requests.push({ method, path, body });
    const override = await options.api?.(method, path, body, f);
    if (override !== undefined) return { data: override };
    if (method !== 'GET') return { data: {} }; // Synthetic recording only, never a provider call.
    if (path === '/wazzup/chats') return { data: { chats: f.chats } };
    if (path.startsWith('/wazzup/chats/')) {
      const phone = decodeURIComponent(path.split('/').at(-1));
      const chat = f.chats.find(c => c.phone === phone);
      if (chat) return { data: chat };
      throw { response: { status: 404 }, message: 'No synthetic chat yet' };
    }
    if (path.startsWith('/wazzup/messages/history/')) return { data: { messages: [], total_count: 0 } };
    if (path === '/wazzup/channels') return { data: [{ id: 'synthetic-channel', status: 'active' }] };
    if (path.startsWith('/crm/leads/')) return { data: { ...lead, source_id: 'synthetic-source' } };
    return { data: [] };
  };
  f.fetch = async (url, init = {}) => {
    const path = new URL(url, 'http://127.0.0.1').pathname;
    f.requests.push({ method: init.method || 'GET', path, body: init.body });
    if ((init.method || 'GET') !== 'GET') throw new Error('Unexpected fixture fetch mutation');
    const value = path.includes('kanban-stage')
      ? { columns: f.columns, current_column_id: 'new', current_label: 'New', can_move: false }
      : [];
    return { ok: true, status: 200, json: async () => value };
  };
  return f;
}

export async function harnessBundle({ browser = false, entrySource } = {}) {
  return build({
    ...(entrySource ? { stdin: { contents: entrySource, resolveDir: fileURLToPath(new URL('../..', import.meta.url)), loader: 'jsx' } }
      : { entryPoints: [fileURLToPath(new URL('./unifiedWhatsAppHarness.jsx', import.meta.url))] }),
    bundle: true, write: false, platform: browser ? 'browser' : 'node', format: browser ? 'iife' : 'cjs',
    ...(browser ? { globalName: 'WidgetHarness' } : { external: ['react', 'react-dom', 'react-dom/client'] }),
    loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"http://127.0.0.1:4179"}' },
    plugins: [{ name: 'synthetic-widget-boundaries', setup(b) {
      b.onResolve({ filter: /\/api\/config$|\/useGlobalRefresh$|\/useCrm$|\/useKanbanColumns$|\/(PatientTermsStatus|ServiceSelector|ConsultationSheetForm|TreatmentPlanView|ServicePaymentList|PatientPaymentWorkspace|PatientTreatmentWorkspace|AppointmentsSchedule|LabAnalysisPicker)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', contents:
        args.path.endsWith('/config') ? `export const apiClient = {get:(p,b)=>globalThis.widgetFixture.api('GET',p,b),post:(p,b)=>globalThis.widgetFixture.api('POST',p,b),patch:(p,b)=>globalThis.widgetFixture.api('PATCH',p,b)}; export const API_BASE_URL='http://127.0.0.1:4179/api'; export const handleApiError=e=>e.message||'Synthetic API failure';`
        : args.path.endsWith('/useGlobalRefresh') ? 'export const useGlobalRefresh=()=>({refreshTriggers:{},refreshAppointments(){},refreshTreatmentPlans(){}});'
        : args.path.endsWith('/useCrm') ? 'export const useCrm=()=>globalThis.widgetFixture.crm;'
        : args.path.endsWith('/useKanbanColumns') ? 'export const useKanbanColumns=()=>({columns:globalThis.widgetFixture.columns,loading:false,busy:false});'
        : 'export default ()=>null;'
      }));
    } }]
  });
}
