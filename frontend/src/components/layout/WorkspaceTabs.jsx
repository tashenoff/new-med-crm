import React from 'react';

export default function WorkspaceTabs({ user, activeSection, onChange }) {
  const allowed = permission => user.role === 'admin' || user.role === 'super_admin' || user.permissions?.includes(permission);
  const tabs = [
    { key: 'hms', label: 'HMS', visible: true },
    { key: 'crm', label: 'CRM', visible: allowed('crm_view') },
    { key: 'warehouse', label: 'Склад', visible: allowed('warehouse_view') },
    { key: 'finance', label: 'Финансы', visible: user.role !== 'patient' },
  ];
  return <nav className="curai-workspace-tabs" aria-label="Рабочие пространства">
    {tabs.filter(tab => tab.visible).map(tab => <button key={tab.key} type="button" className="curai-workspace-tab" aria-current={activeSection === tab.key ? 'page' : undefined} onClick={() => onChange(tab.key)}>{tab.label}</button>)}
  </nav>;
}
