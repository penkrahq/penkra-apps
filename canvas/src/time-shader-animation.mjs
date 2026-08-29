export function createTimeShaderAnimation(options) {
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  let active = false;
  let animationFrame = 0;

  const animate = () => {
    animationFrame = 0;
    if (!active) return;
    options.requestRepaint();
    animationFrame = requestFrame(animate);
  };

  const stop = () => {
    active = false;
    if (animationFrame) {
      cancelFrame(animationFrame);
      animationFrame = 0;
    }
  };

  const setActive = (nextActive) => {
    if (!nextActive) {
      stop();
      return;
    }
    if (active) return;
    active = true;
    animationFrame = requestFrame(animate);
  };

  return { setActive, stop };
}
