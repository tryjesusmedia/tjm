// Reveal only after one uninterrupted second in view, below the sticky header.
const pendingReveals = new Map();
export function clearCompletionReveals() {
  for (const cancel of pendingReveals.values()) cancel();
}
export function revealCompletion(element, onReveal = () => {}) {
  if (!element) return () => {};
  pendingReveals.get(element)?.();
  element.dataset.completionReveal = 'pending';
  let visible = false, timer = null, stopped = false, observer;
  const stopTimer = () => { clearTimeout(timer); timer = null; };
  const cancel = () => {
    stopped = true;
    stopTimer();
    observer?.disconnect();
    document.removeEventListener('visibilitychange', updateTimer);
    window.removeEventListener('scroll', checkBounds);
    window.removeEventListener('resize', checkBounds);
    pendingReveals.delete(element);
  };
  const updateTimer = () => {
    if (stopped) return;
    if (!element.isConnected) { cancel(); return; }
    if (!visible || document.hidden) { stopTimer(); return; }
    if (timer !== null) return;
    timer = setTimeout(() => {
      if (!element.isConnected || document.hidden || !visible) { stopTimer(); return; }
      cancel();
      onReveal();
      element.dataset.completionReveal = 'done';
    }, 1000);
  };
  const checkBounds = () => {
    const rect = element.getBoundingClientRect();
    visible = rect.height > 0 && rect.width > 0 && rect.top >= 100 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
    updateTimer();
  };
  pendingReveals.set(element, cancel);
  document.addEventListener('visibilitychange', updateTimer);
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
      updateTimer();
    }, { threshold: [0, 0.6], rootMargin: '-100px 0px 0px 0px' });
    observer.observe(element);
  } else {
    window.addEventListener('scroll', checkBounds, {passive: true});
    window.addEventListener('resize', checkBounds);
    checkBounds();
  }
  return cancel;
}
