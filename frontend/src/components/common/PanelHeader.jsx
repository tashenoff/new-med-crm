import React from 'react';

const PanelHeader = ({
  title,
  subtitle,
  onAction,
  actionLabel,
  actionClass = 'calendar-new-appointment-btn bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 transition-colors',
  className = ''
}) => (
  <div
    className={`calendar-date-nav flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-none px-4 py-4 rounded-t-2xl ${className}`}
    style={{
      background: 'rgba(255, 255, 255, 0.14)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.35)'
    }}
  >
    <div>
      <h2 className="text-xl font-semibold text-white calendar-date-title">{title}</h2>
      <p className="text-sm text-sky-100 calendar-date-subtitle">{subtitle}</p>
    </div>
    {onAction && actionLabel && (
      <button onClick={onAction} className={actionClass}>
        {actionLabel}
      </button>
    )}
  </div>
);

export default PanelHeader;
