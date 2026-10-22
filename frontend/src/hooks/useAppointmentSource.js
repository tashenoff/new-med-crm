import { useEffect, useRef } from 'react';
import { applyAttribution, attributionIds, readAttribution, resolveAttribution } from '../utils/attribution';

// A specific inquiry wins over patient acquisition. Never select another inquiry
// or infer a marketing source from the entry channel (including WhatsApp).
export function useAppointmentSource({ show, editing, patient, patientId, sources, loaded, getForm, update, loadPatient }) {
  const patientHasSource = patient && Object.hasOwn(patient, 'source_id');
  const patientKey = JSON.stringify(readAttribution(patient || {}));
  const latest = useRef();
  latest.current = { getForm, update, loadPatient, patient };
  const session = useRef({ open: false });
  useEffect(() => {
    if (!show) { session.current = { open: false }; return; }
    if (editing) return;
    if (!session.current.open || session.current.patientId !== patientId) {
      session.current = { open: true, patientId, manual: false, seed: readAttribution(latest.current.getForm()) };
    }
    const current = session.current;
    if (!loaded || current.manual) return;
    let cancelled = false;
    const form = latest.current.getForm();
    const signature = JSON.stringify(readAttribution(form));
    const resolve = async () => {
      let candidate = current.seed;
      if (Object.hasOwn(form, 'lead_source_id')) candidate = readAttribution(form, 'lead_');
      else if (!candidate.source_id && patientId) {
        let saved = patientHasSource ? latest.current.patient : null;
        if (!saved) {
          try { saved = await latest.current.loadPatient(patientId); } catch { return; }
        }
        candidate = readAttribution(saved || {});
      }
      if (cancelled || current !== session.current || current.manual) return;
      const now = latest.current.getForm();
      if ((now.patient_id || '') !== patientId || JSON.stringify(readAttribution(now)) !== signature) return;
      const resolved = resolveAttribution(candidate, sources);
      const next = applyAttribution(now, resolved);
      if (attributionIds.some(key => (now[key] || null) !== (next[key] || null)) || (now.source || '') !== (next.source || '') || now.attribution_notice !== next.attribution_notice) {
        latest.current.update(next);
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [show, editing, patientId, patientHasSource, patientKey, sources, loaded]);
  return () => { session.current.manual = true; };
}
