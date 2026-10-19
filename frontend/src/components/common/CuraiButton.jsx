import React from 'react';

export default function CuraiButton({ variant = 'secondary', iconOnly = false, className = '', children, ...props }) {
  return <button type="button" className={`curai-button curai-button-${variant} ${iconOnly ? 'curai-button-icon' : ''} ${className}`} {...props}>{children}</button>;
}
