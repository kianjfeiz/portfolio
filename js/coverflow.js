// Cover Flow, like iTunes and the old iPod: the photos sit in one row with the
// one in focus flat in the middle and the rest folded accordion-style to either
// side (each tucked under its inner neighbour, a little smaller each step,
// running out past the edges of the page). Drag, swipe, scroll, click a side
// photo or use the arrow keys to slide another one into the frame.
//
// The fan unfolds from behind the main photo as it lands at the end of the
// opening (js/intro.js), and becomes interactive once the opening is done.

(() => {
  const ANGLE = 34; // degrees a side photo's inner edge folds back
  const STEP_SCALE = 0.92; // each photo a little smaller than the one inside it
  const REVEAL = 0.34; // strip of each side photo left showing, as a share of its height
  const PERSPECTIVE = 1100; // px
  const SNAP = 9; // how quickly it settles on a photo (higher = snappier)

  const root = document.documentElement;
  const stage = document.querySelector('.stage');
  const hero = document.querySelector('.hero');
  const cards = [...document.querySelectorAll('.deck .card')];
  if (!stage || !hero || !cards.length) return;

  // one row, left to right; the cards are listed inner to outer on each side
  const left = cards.filter((c) => c.dataset.side === 'left').reverse();
  const right = cards.filter((c) => c.dataset.side === 'right');
  const items = [...left, hero, ...right];
  const HOME = left.length;
  const n = items.length;
  const cos = Math.cos((ANGLE * Math.PI) / 180);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let H = 0; // height of the photo in focus
  let perItem = 1; // px of drag that moves one photo
  let layouts = []; // layouts[f][i] = [x, scale, angle] with photo f in focus
  let pos = HOME; // continuous: which photo is in focus
  let target = HOME;
  let opened = false;
  let interactive = false;

  // aspect from the width/height attributes, so no need to wait for the images to load
  const aspect = (el) => (el === hero ? hero.offsetWidth / hero.offsetHeight : el.width / el.height);

  function measure() {
    H = hero.offsetHeight;
    perItem = H * 0.7;
    for (const c of cards) {
      c.style.setProperty('--h', `${H}px`);
      c.style.setProperty('--w', `${(H * aspect(c)).toFixed(1)}px`);
    }
    layouts = items.map((_, f) => {
      const L = [];
      L[f] = [0, 1, 0];
      for (const dir of [-1, 1]) {
        let edge = (H * aspect(items[f])) / 2;
        for (let k = 1, i = f + dir; i >= 0 && i < n; k++, i += dir) {
          const s = STEP_SCALE ** k;
          const shown = H * s * aspect(items[i]) * cos; // on-screen width once folded
          edge += H * s * REVEAL;
          L[i] = [dir * (edge - shown / 2), s, -dir * ANGLE]; // inner edge back, outer edge toward you
        }
      }
      return L;
    });
  }

  function render() {
    const base = Math.min(n - 1, Math.max(0, pos));
    const over = pos - base; // rubber band past either end
    const f = Math.min(n - 2, Math.floor(base));
    const t = base - f;
    const A = layouts[f];
    const B = layouts[f + 1];
    const center = Math.round(base);
    for (let i = 0; i < n; i++) {
      const el = items[i];
      el.style.zIndex = String(100 - Math.round(Math.abs(i - pos) * 10));
      el.classList.toggle('is-center', i === center);
      if (el === hero ? root.classList.contains('intro') : !opened) continue; // the opening owns these
      const x = lerp(A[i][0], B[i][0], t) - over * perItem;
      const s = lerp(A[i][1], B[i][1], t);
      const ry = lerp(A[i][2], B[i][2], t);
      el.style.transform = `perspective(${PERSPECTIVE}px) translateX(${x.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg) scale(${s.toFixed(4)})`;
    }
  }

  // ---------- settling on a photo ----------

  let raf = 0;
  let last = 0;
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pos += (target - pos) * (1 - Math.exp(-dt * SNAP));
    if (Math.abs(target - pos) < 0.0005) pos = target;
    render();
    raf = pos === target ? 0 : requestAnimationFrame(step);
  }
  function goTo(i) {
    target = Math.min(n - 1, Math.max(0, Math.round(i)));
    if (reduced) {
      pos = target;
      render();
    } else if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  // resistance past the first and last photo
  function rubber(p) {
    if (p < 0) return p * 0.3;
    if (p > n - 1) return n - 1 + (p - (n - 1)) * 0.3;
    return p;
  }

  // ---------- drag / swipe / click ----------

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    root.classList.remove('deck-opening');
    stop();
    drag = { id: e.pointerId, x0: e.clientX, pos0: pos, moved: false, hit: e.target.closest('.card, .hero'), samples: [[e.timeStamp, e.clientX]] };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (Math.abs(dx) > 4) drag.moved = true;
    drag.samples.push([e.timeStamp, e.clientX]);
    if (drag.samples.length > 5) drag.samples.shift();
    pos = rubber(drag.pos0 - dx / perItem);
    render();
  });
  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      // a click: bring the photo that was clicked into the frame
      const i = items.indexOf(d.hit);
      return goTo(i >= 0 ? i : pos);
    }
    // a flick carries on a little in the direction it was thrown
    const [t0, x0] = d.samples[0];
    const [t1, x1] = d.samples[d.samples.length - 1];
    const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0; // px per ms
    goTo(pos - (v * 220) / perItem);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // ---------- trackpad / scroll wheel ----------

  let wheelTimer = 0;
  let wheelDir = 0;
  addEventListener('wheel', (e) => {
    if (!interactive) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault();
    stop();
    const px = d * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerWidth : 1);
    wheelDir = Math.sign(px);
    pos = Math.min(n - 0.7, Math.max(-0.3, pos + px / (perItem * 1.2)));
    render();
    clearTimeout(wheelTimer);
    // once the scrolling stops, settle — leaning toward the direction it was going
    wheelTimer = setTimeout(() => goTo(Math.round(pos + wheelDir * 0.35)), 120);
  }, { passive: false });

  // ---------- keyboard ----------

  addEventListener('keydown', (e) => {
    if (!interactive || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') goTo(target - 1);
    else if (e.key === 'ArrowRight') goTo(target + 1);
    else return;
    e.preventDefault();
  });

  // ---------- the opening ----------

  function open() {
    if (opened) return;
    // start folded behind the main photo, using the same transform functions as the
    // laid-out state so each one interpolates on its own
    for (const c of cards) {
      c.style.setProperty('--i', String(Math.abs(items.indexOf(c) - HOME) - 1));
      c.style.transform = `perspective(${PERSPECTIVE}px) translateX(0px) rotateY(0deg) scale(0.86)`;
    }
    if (!reduced) root.classList.add('deck-opening');
    root.classList.add('deck-open');
    void stage.offsetWidth; // commit the folded state so the transition runs from it
    opened = true;
    render();
    const longest = 1300 + Math.max(left.length, right.length) * 90;
    setTimeout(() => root.classList.remove('deck-opening'), longest + 50);
  }

  function ready() {
    interactive = true;
    render();
  }

  measure();
  render();
  root.classList.add('deck-ready');
  addEventListener('resize', () => {
    measure();
    render();
  });

  if (root.classList.contains('intro')) {
    document.addEventListener('hero-landing', open, { once: true });
    document.addEventListener('intro-done', ready, { once: true });
  } else {
    open();
    ready();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
})();
