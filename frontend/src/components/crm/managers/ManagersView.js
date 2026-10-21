import React from 'react';
import { Navigate } from 'react-router-dom';

// Compatibility for archived entry points; manager assignment remains server-side.
export default function ManagersView() {
  return <Navigate to="/crm-dashboard" replace />;
}
