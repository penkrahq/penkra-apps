export function viewportInsetsFromRects(viewport, panels) {
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const panel of panels) {
    const verticalOverlap = Math.min(viewport.bottom, panel.bottom) - Math.max(viewport.top, panel.top);
    const horizontalOverlap = Math.min(viewport.right, panel.right) - Math.max(viewport.left, panel.left);
    if (verticalOverlap <= 0 || horizontalOverlap <= 0) continue;
    if (panel.left <= viewport.left && panel.right > viewport.left) {
      insets.left = Math.max(insets.left, Math.min(viewport.width, panel.right - viewport.left));
    }
    if (panel.right >= viewport.right && panel.left < viewport.right) {
      insets.right = Math.max(insets.right, Math.min(viewport.width, viewport.right - panel.left));
    }
  }
  return insets;
}
