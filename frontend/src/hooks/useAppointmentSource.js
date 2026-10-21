import { useEffect, useRef } from 'react';

// Only persisted IDs are candidates. Opening a form from a channel says nothing
// about the acquisition source. Never search a patient's multiple inquiries.
export function useAppointmentSource({ show, editing, patient, patientId, sources, loaded, getForm, update, loadPatient }) {
  const patientHasSource = patient && Object.prototype.hasOwnProperty.call(patient, 'source_id');
  const patientSourceId = patient?.source_id;
  const latest = useRef();
  latest.current = { getForm, update, loadPatient };
  const session = useRef({ open: false });
  useEffect(() => {
    if (!show) { session.current = { open: false }; return; }
    if (editing) return;
    if (!session.current.open || session.current.patientId !== patientId) {
      session.current = { open: true, patientId, manual: false, seed: latest.current.getForm().source_id };
    }
    const current = session.current;
    if (!loaded || current.manual) return;
    let cancelled = false;
    const form = latest.current.getForm();
    const startId = form.source_id;
    const resolve = async () => {
      let id = current.seed;
      if (!id && Object.prototype.hasOwnProperty.call(form, 'lead_source_id')) id = form.lead_source_id;
      else if (!id && patientId) {
        let saved = patientHasSource ? { source_id: patientSourceId } : null;
        if (!saved || !Object.prototype.hasOwnProperty.call(saved, 'source_id')) {
          try { saved = await latest.current.loadPatient(patientId); } catch { return; }
        }
        id = saved?.source_id;
      }
      if (cancelled || current !== session.current || current.manual) return;
      const now = latest.current.getForm();
      if ((now.patient_id || '') !== patientId || now.source_id !== startId) return;
      const source = sources.find(item => item.id === id);
      const sourceId = source?.id || '';
      const type = source?.type || '';
      if ((now.source_id || '') !== sourceId || (now.source || '') !== type) {
        latest.current.update({ ...now, source_id: sourceId, source: type });
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [show, editing, patientId, patientHasSource, patientSourceId, sources, loaded]);
  return () => { session.current.manual = true; };
}
