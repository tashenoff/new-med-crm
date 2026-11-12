import { hasPermission } from './permissions.js';

// Receiving a patient's treatment payment does not grant access to finance operations.
const STAFF_ROLES = new Set(['admin', 'administrator', 'doctor', 'marketer', 'super_admin']);
export const canReceiveTreatmentPayment = user => Boolean(user && STAFF_ROLES.has(user.role) && hasPermission(user, 'patients_view'));
