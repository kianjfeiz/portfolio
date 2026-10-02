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
  const STEP_SCALE = 0.92; // each photo looks a little smaller than the one inside it
  const REVEAL = 0.34; // strip of each side photo left showing, as a share of its height
  const P = 1100; // perspective, px
  const GAP = 3; // px between the two moving photos at the moment they swap front and back
  const SNAP = 9; // how quickly it settles on a photo (higher = snappier)
  const RAD = Math.PI / 180;

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
  const cos = Math.cos(ANGLE * RAD);
  const FOLDED_Z = -180; // before the opening: tucked straight behind the main photo
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Every photo is a flat card in one 3D scene seen through a single perspective
  // (the stage centre). Side photos sit genuinely further back (z) rather than
  // being scaled down, so the browser's painting order always matches what is
  // physically nearer. A state is { x, z, a }: world x and depth in px, and the
  // rotateY angle in degrees.
  let H = 0; // height of the photo in focus
  let perItem = 1; // px of drag that moves one photo
  let half = []; // half-width of each photo at full size
  let layouts = []; // layouts[f][i] = state of photo i with photo f in focus
  let meets = []; // meets[f] = x of photo f where it has just slid clear of photo f + 1
  let pos = HOME; // continuous: which photo is in focus
  let target = HOME;
  let opened = false;
  let interactive = false;

  // aspect from the width/height attributes, so no need to wait for the images to load
  const aspect = (el) => (el === hero ? hero.offsetWidth / hero.offsetHeight : el.width / el.height);

  // screen x (from the stage centre) of the point u px along a card's width
  function screenX(st, u) {
    const X = st.x + u * Math.cos(st.a * RAD);
    const Z = st.z - u * Math.sin(st.a * RAD); // CSS rotateY: positive angles swing the right edge away
    return (X * P) / (P - Z);
  }

  function measure() {
    H = hero.offsetHeight;
    perItem = H * 0.7;
    half = items.map((el) => (H * aspect(el)) / 2);
    for (const c of cards) {
      c.style.setProperty('--h', `${H}px`);
      c.style.setProperty('--w', `${(H * aspect(c)).toFixed(1)}px`);
    }
    layouts = items.map((_, f) => {
      const L = [];
      L[f] = { x: 0, z: 0, a: 0 };
      for (const dir of [-1, 1]) {
        let edge = half[f];
        for (let k = 1, i = f + dir; i >= 0 && i < n; k++, i += dir) {
          const s = STEP_SCALE ** k;
          const z = P * (1 - 1 / s); // as far back as it takes to look s times the size
          const shown = 2 * half[i] * s * cos; // roughly its on-screen width once folded
          edge += H * s * REVEAL;
          const xs = dir * (edge - shown / 2); // where its centre shows on screen
          L[i] = { x: (xs * (P - z)) / P, z, a: -dir * ANGLE }; // inner edge back, outer edge toward you
          if (k === 1) {
            // With a narrow photo in focus, or on a very wide screen, the first photo
            // either side can reach past the centre line or tilt its tucked part in
            // front of the focused photo's edge: nudge it out until neither happens.
            const fits = (x) => {
              const st = { ...L[i], x };
              return dir * screenX(st, -dir * half[i]) >= 1 && clearOf(L[f], half[f], st, half[i], dir);
            };
            if (!fits(L[i].x)) {
              let good = L[i].x + dir * 2 * H;
              let bad = L[i].x;
              for (let j = 0; j < 24; j++) {
                const mid = (good + bad) / 2;
                if (fits(mid)) good = mid;
                else bad = mid;
              }
              L[i].x = good;
              edge = Math.max(edge, dir * screenX(L[i], dir * half[i])); // the next photo folds out from here
            }
          }
        }
      }
      return L;
    });
    // Two overlapping flat photos can't swap which is in front without passing
    // through each other, so when photo f hands over to f + 1 it first swings
    // back and slides left until its right edge just clears f + 1's left edge
    // (f + 1 waits, tucked where it was); only then does f + 1 come forward.
    meets = items.map((_, f) => {
      if (f === n - 1) return 0;
      const B = layouts[f][f + 1];
      const target = screenX(B, -half[f + 1]) - GAP;
      const z = layouts[f + 1][f].z;
      const Z = z - half[f] * Math.sin(ANGLE * RAD);
      return (target * (P - Z)) / P - half[f] * Math.cos(ANGLE * RAD);
    });
  }

  // depth (z) of card st (half-width hw) where the ray through screen column sx meets it, or null if it misses
  function depthAt(st, hw, sx) {
    const c = Math.cos(st.a * RAD);
    const sn = Math.sin(st.a * RAD);
    const u = ((sx * (P - st.z)) / P - st.x) / (c - (sx * sn) / P);
    return u < -hw || u > hw ? null : st.z - u * sn;
  }

  // on-screen extent of card st with half-width hw
  const span = (st, hw) => [screenX(st, -hw), screenX(st, hw)];

  // Is card `top` (painted above) physically nearer than `under` everywhere they overlap on screen?
  // Both are flat and only turn about the vertical axis, so checking a handful of columns
  // across the overlap (weighted toward the trailing edge, where it is closest) is enough.
  const SAMPLES = [0, 0.04, 0.12, 0.25, 0.5, 0.75, 1];
  function clearOf(top, hwT, under, hwU, side) {
    const [tl, tr] = span(top, hwT);
    const [ul, ur] = span(under, hwU);
    const lo = Math.max(tl, ul);
    const hi = Math.min(tr, ur);
    if (lo >= hi) return true;
    for (const k of SAMPLES) {
      const c = side > 0 ? hi - 0.25 - k * (hi - lo - 0.5) : lo + 0.25 + k * (hi - lo - 0.5);
      const dt = depthAt(top, hwT, c);
      const du = depthAt(under, hwU, c);
      if (dt !== null && du !== null && dt < du + 1) return false;
    }
    return true;
  }

  // slide card st (index i) along x, from where it wants to be toward `dir`, until it is clear of all `unders`
  function slideClear(st, i, unders, side, dir) {
    const ok = (x) => unders.every((j) => clearOf({ ...st, x }, half[i], states[j], half[j], side));
    if (ok(st.x)) return st;
    let good = st.x + dir * 4 * H;
    let bad = st.x;
    for (let k = 0; k < 24; k++) {
      const mid = (good + bad) / 2;
      if (ok(mid)) good = mid;
      else bad = mid;
    }
    return { ...st, x: good };
  }

  // every photo's state with the focus a fraction t of the way from photo f to f + 1
  const states = [];
  function layoutAt(f, t) {
    const from = layouts[f];
    const to = layouts[f + 1];
    const A = f; // leaving the frame, to the left
    const B = f + 1; // coming into the frame from the right
    const p1 = smooth(t / 0.5);
    const p2 = smooth((t - 0.5) / 0.5);
    // each fold moves in step with the photo leading it: the left one with A in the
    // first half, the right one with B in the second, so neither changes shape mid-move
    for (let i = 0; i < n; i++) {
      const k = i < A ? p1 : p2;
      states[i] = { x: lerp(from[i].x, to[i].x, k), z: lerp(from[i].z, to[i].z, k), a: lerp(from[i].a, to[i].a, k) };
    }
    // B waits, tucked where it was, until the halfway point, then comes forward
    states[B] = { x: lerp(from[B].x, 0, p2), z: lerp(from[B].z, 0, p2), a: lerp(from[B].a, 0, p2) };
    // A swings back by the halfway point, sliding left just far enough to have cleared B
    // (two overlapping flat photos can't swap which is in front without passing
    // through each other), then settles into its place in the left-hand fold
    const ax = t < 0.5 ? lerp(0, meets[f], p1) : lerp(meets[f], to[A].x, p2);
    states[A] = { x: ax, z: lerp(0, to[A].z, p1), a: lerp(0, to[A].a, p1) };
    // keep A's trailing edge riding over the photos it covers on the right (never sinking into them) ...
    const rights = [];
    for (let j = t < 0.5 ? B : B + 1; j < n && j <= B + 3; j++) rights.push(j);
    states[A] = slideClear(states[A], A, rights, +1, -1);
    // ... and, once B is in front, B's trailing edge riding over the photos on its left
    if (t >= 0.5) {
      const lefts = [];
      for (let j = A; j >= 0 && j >= A - 3; j--) lefts.push(j);
      states[B] = slideClear(states[B], B, lefts, -1, +1);
    }
    return states;
  }

  function render() {
    const base = Math.min(n - 1, Math.max(0, pos));
    const over = pos - base; // rubber band past either end
    const f = Math.min(n - 2, Math.floor(base));
    const t = base - f;
    const center = Math.round(base);
    const all = layoutAt(f, t);
    for (let i = 0; i < n; i++) {
      const el = items[i];
      // nearer the focus paints on top; the two moving photos swap exactly halfway, when they don't overlap
      const d = Math.abs(i - pos);
      el.style.zIndex = String(10000 - Math.round(d * 1000) + (d === 0.5 && i > pos ? 1 : 0));
      el.classList.toggle('is-center', i === center);
      if (el === hero ? root.classList.contains('intro') : !opened) continue; // the opening owns these
      const st = all[i];
      const x = st.x - (over * perItem * (P - st.z)) / P; // rubber band: same on-screen shift for all
      el.style.transform = `perspective(${P}px) translate3d(${x.toFixed(2)}px, 0, ${st.z.toFixed(2)}px) rotateY(${st.a.toFixed(3)}deg)`;
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
      c.style.transform = `perspective(${P}px) translate3d(0px, 0, ${FOLDED_Z}px) rotateY(0deg)`;
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

  function smooth(x) {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  }
})();
