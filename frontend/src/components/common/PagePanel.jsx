import React from 'react';

// A continuous page surface. Sections opt in explicitly so nested cards and
// dialogs keep their own spacing, backgrounds and borders.
export default function PagePanel({ children }) {
  return <div className="curai-page-panel">{children}</div>;
}
