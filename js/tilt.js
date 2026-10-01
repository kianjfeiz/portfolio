// The photo turns toward the mouse, like a print held in your hand.
// Starts once the opening animation is done; off for touch and reduced motion.

(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const MAX = 9; // degrees at the edge of the window
  const EASE = 0.08; // fraction of the remaining angle closed each frame

  const root = document.documentElement;
  const img = document.querySelector('.hero');
  let target = { x: 0, y: 0 };
  let now = { x: 0, y: 0 };
  let raf = 0;

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    // the photo rotates about its centre, so its box centre stays put while tilted
    const r = img.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    target.x = clamp((e.clientX - cx) / (innerWidth / 2));
    target.y = clamp((e.clientY - cy) / (innerHeight / 2));
    run();
  });
  // mouse left the window: settle back flat
  document.addEventListener('mouseleave', () => {
    target = { x: 0, y: 0 };
    run();
  });

  function run() {
    if (!raf) raf = requestAnimationFrame(step);
  }

  function step() {
    raf = 0;
    const want = root.classList.contains('intro') ? { x: 0, y: 0 } : target;
    now.x += (want.x - now.x) * EASE;
    now.y += (want.y - now.y) * EASE;
    // the photo faces the cursor: the edge nearest the mouse leans away
    root.style.setProperty('--tilt-y', `${(now.x * MAX).toFixed(3)}deg`);
    root.style.setProperty('--tilt-x', `${(-now.y * MAX).toFixed(3)}deg`);
    if (Math.abs(want.x - now.x) > 0.0005 || Math.abs(want.y - now.y) > 0.0005 || root.classList.contains('intro')) run();
  }

  function clamp(v) {
    return Math.max(-1, Math.min(1, v));
  }
})();
