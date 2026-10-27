import React from 'react';

const PanelHeader = ({
  title,
  subtitle,
  onAction,
  actionLabel,
  actionClass = "calendar-new-appointment-btn bg-curai-positive hover:bg-curai-positive text-white rounded-md px-4 py-2 transition-colors",
  actions,
  actionGuide,
  className = ''
}) => (
  <div
    className={`curai-panel-header ${className}`}
  >
    <div>
      <h2 className="curai-panel-title">{title}</h2>
      <p className="curai-panel-subtitle">{subtitle}</p>
    </div>
    {actions}
    {onAction && actionLabel && (
      <button data-guide={actionGuide} onClick={onAction} className={`curai-button curai-button-primary ${actionClass}`}>
        {actionLabel}
      </button>
    )}
  </div>
);

export default PanelHeader;
