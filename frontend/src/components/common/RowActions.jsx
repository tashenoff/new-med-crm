import React from 'react';
import CuraiIcon from './CuraiIcon';

const defaults = {
  edit: { label: 'Редактировать', icon: 'edit', tone: 'primary' },
  delete: { label: 'Удалить', icon: 'delete', tone: 'danger' },
  access: { label: 'Права доступа', icon: 'permissions', tone: 'primary' },
  assignAccess: { label: 'Назначить доступ', icon: 'key', tone: 'primary' },
  revokeAccess: { label: 'Отозвать доступ', icon: 'lock', tone: 'danger' },
};

function hasContent(children) {
  return React.Children.toArray(children).some(child =>
    React.isValidElement(child) && child.type === React.Fragment
      ? hasContent(child.props.children)
      : typeof child === 'string' ? Boolean(child.trim()) : child != null && child !== false,
  );
}

export default function RowActions({ children, label = 'Действия', className = '' }) {
  if (!hasContent(children)) return null;
  return <div className={`curai-row-actions ${className}`} role="group" aria-label={label}>{children}</div>;
}

function RowAction({ action, label, icon, iconOnly = true, tone, className = '', children, ...props }) {
  const preset = defaults[action] || {};
  const text = label ?? preset.label ?? children;
  const iconName = icon || preset.icon;
  const compact = iconOnly && Boolean(iconName);
  const denied = props['aria-disabled'] === true || props['aria-disabled'] === 'true';
  const accessibleLabel = props.title && !denied ? props.title : typeof text === 'string' ? text : undefined;
  return <button aria-label={accessibleLabel} title={typeof text === 'string' ? text : undefined} {...props} type="button" data-tone={tone || preset.tone || 'primary'} data-icon-only={compact ? 'true' : undefined} className={`curai-row-action ${className}`}>
    {iconName && <CuraiIcon name={iconName} />}
    {!compact && text}
  </button>;
}

RowActions.Item = RowAction;
