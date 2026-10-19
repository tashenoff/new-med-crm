import React from 'react';
import CuraiIcon from '../common/CuraiIcon';

export default function NavigationItem({ label, icon, active, collapsed, expanded, children, className = '', ...props }) {
  return <button type="button" className={`curai-navigation-item ${active ? 'is-active' : ''} ${collapsed ? 'is-collapsed' : ''} ${className}`} title={collapsed ? label : undefined} aria-label={label} aria-current={active && expanded === undefined ? 'page' : undefined} aria-expanded={expanded} {...props}>
    <CuraiIcon name={icon} />
    {!collapsed && <><span className="curai-navigation-label">{label}</span>{expanded !== undefined && <CuraiIcon name="chevron" className={expanded ? 'is-expanded' : ''} />}{children}</>}
  </button>;
}
