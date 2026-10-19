// Утилитарные классы для элементов форм с поддержкой темной темы
export const inputClasses = "w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus bg-curai-surface text-curai-ink placeholder-curai-muted ";

export const selectClasses = "w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus bg-curai-surface text-curai-ink ";

export const textareaClasses = "w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus bg-curai-surface text-curai-ink placeholder-curai-muted ";

export const labelClasses = "block text-sm font-medium text-curai-ink mb-1";

export const buttonBaseClasses = "curai-button";

export const buttonPrimaryClasses = `curai-button-primary ${buttonBaseClasses} disabled:opacity-50`;

export const buttonSecondaryClasses = `curai-button-secondary ${buttonBaseClasses} disabled:opacity-50`;

export const buttonSuccessClasses = `curai-button-primary ${buttonBaseClasses} disabled:opacity-50`;

export const buttonDangerClasses = `curai-button-danger ${buttonBaseClasses} disabled:opacity-50`;

export const cardClasses = "bg-curai-surface rounded-md border border-curai-border ";

export const cardHeaderClasses = "bg-curai-subtle p-4 rounded-md border border-curai-border ";

export const tabClasses = (isActive) => `curai-tab ${isActive ? 'is-active' : ''}`;

export const tableClasses = "min-w-full bg-curai-surface ";

export const tableHeaderClasses = "bg-curai-subtle text-curai-muted ";

export const tableRowClasses = "border-t border-curai-border hover:bg-curai-subtle ";

export const tableCellClasses = "py-2 px-3 text-curai-ink ";
