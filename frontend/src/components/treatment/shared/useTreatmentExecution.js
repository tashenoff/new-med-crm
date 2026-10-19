import { useState } from 'react';
import { completionRequest, ledgerFetch } from '../../../utils/accountingLedger';
export function useTreatmentExecution(plan, onUpdate) {
const [loading, setLoading] = useState(false);
const API = import.meta.env.VITE_BACKEND_URL;
const markProcedureCompleted = async (service, component) => {
    if (loading) return;
    try {
      setLoading(true);
      const { path, payload } = completionRequest(plan, service, component);
      const updatedPlan = await ledgerFetch(`${API}${path}`, payload);
      if (onUpdate) await onUpdate(updatedPlan.plan || updatedPlan);
    } catch (error) {
      console.error('Error marking procedure completed:', error);
      alert('Ошибка при отметке процедуры: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
const executionCounts = service => {
    if (service.is_complex) {
      return (service.components || []).reduce((sum, part) => ({
        total: sum.total + (part.occurrence_ids?.length || part.quantity || 1),
        completed: sum.completed + (part.quantity_completed || 0)
      }), { total: 0, completed: 0 });
    }
    if (service.is_course || service.payment_type === 'per_session') {
      return { total: (service.sessions || []).length,
        completed: (service.sessions || []).filter(session => session.completed).length };
    }
    return { total: service.occurrence_ids?.length || service.quantity_total || service.quantity || 1,
      completed: service.quantity_completed || 0 };
  };
const calculateProgress = () => {
    const counts = plan.services.map(executionCounts).reduce((sum, part) => ({
      total: sum.total + part.total, completed: sum.completed + part.completed
    }), { total: 0, completed: 0 });
    return { ...counts, percentage: counts.total ? Math.round(counts.completed / counts.total * 100) : 0 };
  };
const progress = calculateProgress();
return { loading, markProcedureCompleted, executionCounts, progress };
}
