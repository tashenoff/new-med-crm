export function guidePosition(rect, placement, size, viewport) {
  const gap = 12, padding = 16;
  const width = Math.min(size.width, Math.max(0, viewport.width - padding * 2));
  const height = Math.min(size.height, Math.max(0, viewport.height - padding * 2));
  if (!rect) return { left: Math.max(padding, (viewport.width - width) / 2), top: Math.max(padding, (viewport.height - height) / 2) };
  const right = rect.left + rect.width, bottom = rect.top + rect.height;
  // A side tooltip must not cover a wide form when there is no room beside it.
  if (placement === 'left' && rect.left - width - gap < padding) placement = 'bottom';
  if (placement === 'right' && right + gap + width > viewport.width - padding) placement = 'bottom';
  let left = rect.left + (rect.width - width) / 2;
  let top = bottom + gap;
  if (placement === 'top') top = rect.top - height - gap;
  if (placement === 'left' || placement === 'right') {
    left = placement === 'left' ? rect.left - width - gap : right + gap;
    top = rect.top + (rect.height - height) / 2;
  }
  if (placement === 'bottom' && top + height > viewport.height - padding && rect.top >= height + gap + padding) top = rect.top - height - gap;
  if (placement === 'top' && top < padding && bottom + height + gap <= viewport.height - padding) top = bottom + gap;
  return { left: Math.max(padding, Math.min(left, viewport.width - width - padding)), top: Math.max(padding, Math.min(top, viewport.height - height - padding)) };
}
