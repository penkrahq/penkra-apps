const SUBPIXEL_PRECISION = 64;

function stableCssPixel(value) {
  if (!Number.isFinite(value)) throw new Error("Browser surface geometry must be finite.");
  return Math.max(0, Math.round(value * SUBPIXEL_PRECISION) / SUBPIXEL_PRECISION);
}

/**
 * Converts one App-local viewport rectangle into edge constraints. Unlike width and
 * height, these values remain stable while the containing App pane is resized.
 */
export function browserSurfaceInsets(rect, frameWidth, frameHeight) {
  return {
    top: stableCssPixel(rect.top),
    right: stableCssPixel(frameWidth - rect.right),
    bottom: stableCssPixel(frameHeight - rect.bottom),
    left: stableCssPixel(rect.left),
  };
}

export function browserSurfaceInsetsSignature(insets) {
  return insets
    ? `${insets.top}:${insets.right}:${insets.bottom}:${insets.left}`
    : "hidden";
}
