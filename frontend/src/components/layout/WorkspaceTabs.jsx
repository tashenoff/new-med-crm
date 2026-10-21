import React from 'react';
import { canOpenSpace } from '../../utils/permissions';

export default function WorkspaceTabs({ user, activeSection, onChange }) {

  const tabs = [
    { key: 'hms', label: 'HMS', visible: canOpenSpace(user, 'hms') },
    { key: 'crm', label: 'CRM', visible: canOpenSpace(user, 'crm') },
    { key: 'warehouse', label: 'Склад', visible: canOpenSpace(user, 'warehouse') },
    { key: 'finance', label: 'Финансы', visible: canOpenSpace(user, 'finance') },
  ];
  return <nav className="curai-workspace-tabs" aria-label="Рабочие пространства">
    {tabs.filter(tab => tab.visible).map(tab => <button key={tab.key} type="button" className="curai-workspace-tab" aria-current={activeSection === tab.key ? 'page' : undefined} onClick={() => onChange(tab.key)}>{tab.label}</button>)}
  </nav>;
}
