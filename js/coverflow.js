// Cover Flow, like iTunes and the old iPod: the photos sit in one row with the
// one in focus flat in the middle and the rest folded accordion-style to either
// side (each tucked under its inner neighbour, a little smaller each step,
// running out past the edges of the page). Drag, swipe, scroll, click a side
// photo or use the arrow keys to slide another one into the frame.
//
// Motion: every photo slides along one smooth curve through all its resting
// places, so the whole row flows together under your finger at an even pace.
// Two overlapping flat photos can't swap which is in front without one passing
// through the other, so the pair trading places pass like cards in a stack: they
// swing steeper as they reach the middle (like Cover Flow), which opens a sliver
// of space between them for a moment, and whichever is underneath dips back a
// little so its hidden edge stays tucked behind: the arriving photo before that
// moment, the leaving one after. They swap front and back while they're apart.
// Input drives a spring that carries the speed of a flick and settles on a photo.
//
// The fan unfolds from behind the main photo as it lands at the end of the
// opening (js/intro.js), and becomes interactive once the opening is done.

(() => {
  const ANGLE = 34; // degrees a side photo's inner edge folds back
  const WINDOW = 0.1; // half-width (in photos of scroll) of the moment the passing pair are apart
  const PART = 0.12; // how far the passing pair slide apart at the halfway point, as a share of the photo height
  const STEP_SCALE = 0.92; // each photo looks a little smaller than the one inside it
  const REVEAL = 0.34; // strip of each side photo left showing, as a share of its height
  const DEPTH = 2.5; // perspective distance as a multiple of the photo height (same look on any screen)
  const GAP = 4; // px between the two passing photos at the instant they swap front and back
  const OMEGA = 10.5; // spring stiffness (rad/s): higher settles faster
  const ZETA = 0.8; // spring damping: just under 1, so it eases past a whisker and settles
  const FOLLOW = 22; // stiffer spring while a trackpad or wheel is moving the row
  const FLING = 0.22; // seconds of a flick's speed carried into where it lands
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
  const FOLDED = 0.16; // before the opening: tucked straight behind the main photo, this much smaller
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Every photo is a flat card in one 3D scene seen through a single perspective
  // (the stage centre). Side photos sit genuinely further back (z) rather than
  // being scaled down, so the browser's painting order always matches what is
  // physically nearer. A state is { x, z, a }: world x and depth in px, and the
  // rotateY angle in degrees.
  let H = 0; // height of the photo in focus
  let P = 1100; // perspective, px
  let perItem = 1; // px of drag that moves one photo
  let half = []; // half-width of each photo at full size
  let layouts = []; // layouts[f][i] = resting state of photo i with photo f in focus
  let passes = []; // passes[f] = how photos f and f + 1 turn and part as they trade places
  let ox = 0; // stage centre on screen
  let pos = HOME; // continuous: which photo is in focus
  let opened = false;
  let interactive = false;

  // aspect from the width/height attributes, so no need to wait for the images to load
  const aspect = (el) => (el === hero ? hero.offsetWidth / hero.offsetHeight : el.width / el.height);

  // ---------- geometry ----------

  // screen x (from the stage centre) of the point u px along a card's width
  function screenX(st, u) {
    const X = st.x + u * Math.cos(st.a * RAD);
    const Z = st.z - u * Math.sin(st.a * RAD); // CSS rotateY: positive angles swing the right edge away
    return (X * P) / (P - Z);
  }

  // depth (z) of card st (half-width hw) where the ray through screen column sx meets it, or null if it misses
  function depthAt(st, hw, sx) {
    const c = Math.cos(st.a * RAD);
    const sn = Math.sin(st.a * RAD);
    const u = ((sx * (P - st.z)) / P - st.x) / (c - (sx * sn) / P);
    return u < -hw || u > hw ? null : st.z - u * sn;
  }

  const span = (st, hw) => [screenX(st, -hw), screenX(st, hw)];

  // Is card `top` (painted above) physically nearer than `under` everywhere they overlap on screen?
  // Both are flat and only turn about the vertical axis, so a handful of columns is enough.
  const SAMPLES = [0, 0.04, 0.12, 0.25, 0.5, 0.75, 1];
  function clearOf(top, hwT, under, hwU) {
    const [tl, tr] = span(top, hwT);
    const [ul, ur] = span(under, hwU);
    const lo = Math.max(tl, ul);
    const hi = Math.min(tr, ur);
    if (lo >= hi) return true;
    for (const k of SAMPLES) {
      for (const c of [hi - 0.25 - k * (hi - lo - 0.5), lo + 0.25 + k * (hi - lo - 0.5)]) {
        const dt = depthAt(top, hwT, c);
        const du = depthAt(under, hwU, c);
        if (dt !== null && du !== null && dt < du + 1) return false;
      }
    }
    return true;
  }

  function measure() {
    H = hero.offsetHeight;
    P = H * DEPTH;
    perItem = H * 0.72;
    half = items.map((el) => (H * aspect(el)) / 2);
    const sr = stage.getBoundingClientRect();
    ox = sr.left + sr.width / 2;
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
              return dir * screenX(st, -dir * half[i]) >= 1 && clearOf(L[f], half[f], st, half[i]);
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
    // For each hand-over from photo f (leaving, to the left) to f + 1 (arriving
    // from the right): how far each swings so they're apart around the halfway
    // point, then how deep the one underneath has to dip to stay tucked behind.
    passes = [];
    for (let f = 0; f < n - 1; f++) {
      let swingA = 0;
      let swingB = 0;
      for (const t of [0.5 - WINDOW, 0.5, 0.5 + WINDOW]) {
        const A = curve(f, f, t);
        const B = curve(f + 1, f, t);
        A.x -= PART * H * swingAt(t);
        B.x += PART * H * swingAt(t);
        swingA = Math.max(swingA, (steepest(A, half[f], +1) - A.a) / swingAt(t));
        swingB = Math.min(swingB, (steepest(B, half[f + 1], -1) - B.a) / swingAt(t));
      }
      // the shallowest dip that keeps everything clean (too deep and it would sink behind
      // the photo folded behind it, so step down from shallow rather than bisect)
      passes[f] = { swingA, swingB, dip: 0 };
      let best = { dip: 0, bad: passFaults(f) };
      for (let dip = H * 0.02; best.bad && dip <= H * 1.5; dip += H * 0.02) {
        passes[f].dip = dip;
        const bad = passFaults(f);
        if (bad < best.bad) best = { dip, bad };
      }
      // a little deeper still, as long as that stays clean: a margin between the samples checked
      passes[f].dip = best.dip + H * 0.03;
      if (best.bad || passFaults(f)) passes[f].dip = best.dip;
    }
  }

  // the angle that just brings card st's inner edge (edge +1: its right edge, for a
  // photo left of centre; -1: its left edge) clear of the centre line
  function steepest(st, hw, edge) {
    const reach = (a) => edge * screenX({ ...st, a }, edge * hw); // how far past the centre line the edge is
    const goal = -GAP / 2;
    if (reach(st.a) <= goal) return st.a;
    let lo = st.a;
    let hi = edge * 89; // turned almost edge-on
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (reach(mid) <= goal) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  // how many times, through the hand-over from f to f + 1, a photo painted on top
  // isn't in front of one it covers (checked for the photos around the pair)
  function passFaults(f) {
    let bad = 0;
    for (let k = 1; k < 80; k++) {
      const t = k / 80;
      if (Math.abs(t - 0.5) < 1e-6) continue;
      const p = f + t;
      const all = flowAt(p);
      for (let i = Math.max(0, f - 2); i <= Math.min(n - 1, f + 3); i++) {
        for (let j = Math.max(0, f - 2); j <= Math.min(n - 1, f + 3); j++) {
          if (Math.abs(i - p) >= Math.abs(j - p)) continue; // i is painted on top of j
          if (!clearOf(all[i], half[i], all[j], half[j])) bad++;
        }
      }
    }
    return bad;
  }

  // resting state of photo i with focus f, extended smoothly past either end of the row
  function key(f, i) {
    if (f < 0) return extend(layouts[0][i], layouts[1][i], -f);
    if (f > n - 1) return extend(layouts[n - 1][i], layouts[n - 2][i], f - (n - 1));
    return layouts[f][i];
  }
  const extend = (a, b, k) => ({ x: a.x + (a.x - b.x) * k, z: a.z + (a.z - b.z) * k, a: a.a + (a.a - b.a) * k });

  // photo i a fraction t of the way from focus f to f + 1, on a smooth curve through
  // its resting states (so it flows on through each one without stopping) that
  // never overshoots them (so photos that rest parallel stay parallel)
  function curve(i, f, t) {
    const p0 = key(f - 1, i);
    const p1 = key(f, i);
    const p2 = key(f + 1, i);
    const p3 = key(f + 2, i);
    return { x: mono(p0.x, p1.x, p2.x, p3.x, t), z: mono(p0.z, p1.z, p2.z, p3.z, t), a: mono(p0.a, p1.a, p2.a, p3.a, t) };
  }

  // how far through the swing each photo is, a fraction t of the way through the hand-over
  const swingAt = (t) => Math.sin(Math.PI * t) ** 2;
  // dips in over the first part of the hand-over, comes back up while the pair are apart
  const dipAt = (t) => smooth(t / (0.5 - WINDOW)) * (1 - smooth((t - 0.5 + WINDOW) / (2 * WINDOW)));

  // every photo's state with focus at (continuous) position p
  const states = [];
  function flowAt(p) {
    const base = Math.min(n - 1, Math.max(0, p));
    const f = Math.min(n - 2, Math.floor(base));
    const t = base - f;
    for (let i = 0; i < n; i++) states[i] = curve(i, f, t);
    // the pass: both swing steeper toward the middle, and the one underneath dips
    // (the arriving one before the halfway point, the leaving one after)
    const pass = passes[f];
    if (pass && t > 0) {
      const sw = swingAt(t);
      states[f].a += pass.swingA * sw;
      states[f + 1].a += pass.swingB * sw;
      states[f].x -= PART * H * sw;
      states[f + 1].x += PART * H * sw;
      states[f].z -= pass.dip * dipAt(1 - t);
      states[f + 1].z -= pass.dip * dipAt(t);
    }
    // past either end of the row, everything slides together (rubber band)
    const over = p - base;
    if (over) for (const st of states) st.x -= (over * perItem * (P - st.z)) / P;
    return states;
  }

  // ---------- drawing ----------

  const drawn = []; // each photo's state as last drawn
  const zs = [];
  let centerShown = -1;
  function render() {
    const all = flowAt(pos);
    const center = Math.round(Math.min(n - 1, Math.max(0, pos)));
    for (let i = 0; i < n; i++) {
      const el = items[i];
      // nearer the focus paints on top; the two passing photos swap exactly halfway, when they don't overlap
      const d = Math.abs(i - pos);
      const z = 10000 - Math.round(d * 1000) + (d === 0.5 && i > pos ? 1 : 0);
      if (zs[i] !== z) el.style.zIndex = String((zs[i] = z));
      if (el === hero ? root.classList.contains('intro') : !opened) continue; // the opening owns these
      const st = all[i];
      el.style.transform = `perspective(${P}px) translate3d(${st.x.toFixed(2)}px, 0, ${st.z.toFixed(2)}px) rotateY(${st.a.toFixed(3)}deg)`;
      drawn[i] = { x: st.x, z: st.z, a: st.a };
    }
    if (center !== centerShown) {
      items[centerShown]?.classList.remove('is-center');
      items[center].classList.add('is-center');
      centerShown = center;
    }
    if (placedOn) placeCaption(placedOn); // the caption stays on its photo
  }

  // ---------- motion: one spring, fed by drags, flicks, scrolling, clicks and keys ----------

  let vel = 0; // photos per second
  let target = HOME; // where the spring is pulling (may be between photos while scrolling)
  let stiffness = OMEGA;
  let dragging = null;
  let raf = 0;
  let last = 0;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (dragging) {
      const prev = pos;
      pos = rubber(dragging.pos0 - (dragging.x - dragging.x0) / perItem);
      if (dt > 0) vel = vel * 0.6 + ((pos - prev) / dt) * 0.4;
    } else {
      // a slightly soft spring, in small steps so it's stable at any frame rate
      const steps = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / steps;
      for (let k = 0; k < steps; k++) {
        const acc = -stiffness * stiffness * (pos - target) - 2 * ZETA * stiffness * vel;
        vel += acc * h;
        pos += vel * h;
      }
      if (Math.abs(pos - target) < 0.0004 && Math.abs(vel) < 0.002) {
        pos = target;
        vel = 0;
      }
    }
    render();
    if (dragging || pos !== target || vel !== 0) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      settled();
    }
  }

  function run() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function goTo(i) {
    target = Math.min(n - 1, Math.max(0, Math.round(i)));
    stiffness = OMEGA;
    if (Math.abs(target - pos) > 0.001 || Math.abs(vel) > 0.01) hideCaption();
    if (reduced) {
      pos = target;
      vel = 0;
      render();
      settled();
      return;
    }
    run();
  }

  // resistance past the first and last photo
  function rubber(p) {
    if (p < 0) return p * 0.3;
    if (p > n - 1) return n - 1 + (p - (n - 1)) * 0.3;
    return p;
  }
  function unrubber(p) {
    if (p < 0) return p / 0.3;
    if (p > n - 1) return n - 1 + (p - (n - 1)) / 0.3;
    return p;
  }

  // ---------- drag / swipe / click ----------

  stage.addEventListener('pointerdown', (e) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    root.classList.remove('deck-opening');
    hideCaption();
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    // grab the row wherever it is, even mid-glide
    dragging = { id: e.pointerId, x0: e.clientX, x: e.clientX, pos0: unrubber(pos), moved: false, hit: e.target.closest('.card, .hero'), samples: [[e.timeStamp, e.clientX]] };
    stage.setPointerCapture(e.pointerId);
    run();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    for (const ce of e.getCoalescedEvents?.() || [e]) dragging.samples.push([ce.timeStamp, ce.clientX]);
    dragging.x = e.clientX;
    if (Math.abs(dragging.x - dragging.x0) > 4) dragging.moved = true;
    const cutoff = e.timeStamp - 120;
    while (dragging.samples.length > 2 && dragging.samples[0][0] < cutoff) dragging.samples.shift();
  });
  function release(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const d = dragging;
    dragging = null;
    if (!d.moved) {
      // a click: bring the photo that was clicked into the frame
      const i = items.indexOf(d.hit);
      vel = 0;
      return goTo(i >= 0 ? i : Math.round(pos));
    }
    // the finger's speed over its last ~80 ms (least squares), carried into the spring
    const recent = d.samples.filter(([t]) => t >= e.timeStamp - 80);
    let v = 0;
    if (recent.length >= 2 && e.timeStamp - recent[recent.length - 1][0] < 60) {
      const mt = recent.reduce((a, [t]) => a + t, 0) / recent.length;
      const mx = recent.reduce((a, [, x]) => a + x, 0) / recent.length;
      let num = 0;
      let den = 0;
      for (const [t, x] of recent) {
        num += (t - mt) * (x - mx);
        den += (t - mt) ** 2;
      }
      v = den > 0 ? num / den : 0; // px per ms
    }
    vel = (-v * 1000) / perItem; // photos per second
    if (pos < 0 || pos > n - 1) vel *= 0.3; // already stretched past an end
    goTo(pos + vel * FLING);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // ---------- trackpad / scroll wheel ----------
  // Scroll events arrive unevenly, so instead of moving the row on each one they
  // nudge where a stiff spring is heading; it glides there, then settles on a photo.

  let wheelTimer = 0;
  let wheelDir = 0;
  addEventListener('wheel', (e) => {
    if (!interactive) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault();
    if (dragging) return;
    hideCaption();
    const px = d * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerWidth : 1);
    if (!wheelTimer) target = pos; // pick up from wherever the row is
    wheelDir = Math.sign(px);
    target = Math.min(n - 0.65, Math.max(-0.35, target + px / (perItem * 1.15)));
    stiffness = FOLLOW;
    run();
    clearTimeout(wheelTimer);
    // once the scrolling stops, settle on a photo, leaning the way it was going
    wheelTimer = setTimeout(() => {
      wheelTimer = 0;
      goTo(target + wheelDir * 0.3);
    }, 110);
  }, { passive: false });

  // ---------- keyboard ----------

  addEventListener('keydown', (e) => {
    if (!interactive || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') goTo(Math.round(target) - 1);
    else if (e.key === 'ArrowRight') goTo(Math.round(target) + 1);
    else return;
    viaKeys = true;
    e.preventDefault();
  });

  // ---------- captions ----------
  // The hovered photo's caption appears just above it, drawn in the photo's own 3D
  // plane so it leans and recedes with it (and rides along if the row moves while it
  // fades). It hides while the row moves. Without a mouse (touch screens) or after
  // using the arrow keys, it's the caption of the photo in focus.

  const caption = document.querySelector('.caption');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let shownFor = null; // photo whose caption is showing or about to
  let placedOn = null; // photo the caption is currently drawn on
  let captionW = 0; // its width, measured when its text changes
  let pointer = null; // last mouse position
  let viaKeys = false;
  let swapTimer = 0;
  const LIFT = 14; // px between the caption and the photo's top edge, in the photo's plane

  const photoAt = (x, y) => document.elementFromPoint(x, y)?.closest('.stage .card, .stage .hero') || null;

  // the widest stretch of photo i (in screen x from the stage centre) not covered by a photo painted above it
  function visibleSpan(i, minX, maxX) {
    let segs = [[Math.max(minX, screenX(drawn[i], -half[i])), Math.min(maxX, screenX(drawn[i], half[i]))]];
    const d = Math.abs(i - pos);
    for (let j = 0; j < n; j++) {
      if (j === i || !drawn[j] || Math.abs(j - pos) >= d) continue;
      const l = screenX(drawn[j], -half[j]);
      const r = screenX(drawn[j], half[j]);
      segs = segs.flatMap(([a, b]) => [[a, Math.min(b, l)], [Math.max(a, r), b]]).filter(([a, b]) => b - a > 1);
    }
    return segs.reduce((best, sg) => (sg[1] - sg[0] > best[1] - best[0] ? sg : best), [0, 0]);
  }

  function placeCaption(el) {
    const i = items.indexOf(el);
    const st = drawn[i];
    if (!st) return;
    placedOn = el;
    // centre it over the part of the photo that's on screen (u runs along the photo's width)
    const c = Math.cos(st.a * RAD);
    const sn = Math.sin(st.a * RAD);
    const uAt = (sx) => ((sx * (P - st.z)) / P - st.x) / (c - (sx * sn) / P);
    const [vl, vr] = visibleSpan(i, 16 - ox, innerWidth - 16 - ox);
    const lo = Math.max(-half[i], uAt(vl));
    const hi = Math.min(half[i], uAt(vr));
    const w = captionW;
    let u = (lo + hi) / 2;
    if (hi - lo >= w) u = Math.min(hi - w / 2, Math.max(lo + w / 2, u));
    // ... but never past the edges of the screen
    const sMin = uAt(16 - ox) + w / 2;
    const sMax = uAt(innerWidth - 16 - ox) - w / 2;
    if (sMin <= sMax) u = Math.min(sMax, Math.max(sMin, u));
    // Raise it (still in the photo's plane) until it clears the top edge of every photo it
    // passes over: a photo far out in the fold is lower than the taller ones in front of it.
    let lift = LIFT;
    const cl = screenX(st, u - w / 2);
    const cr2 = screenX(st, u + w / 2);
    for (let k = 0; k <= 8; k++) {
      const sx = cl + ((cr2 - cl) * k) / 8;
      const zc = st.z - uAt(sx) * sn; // depth of this photo's plane at that column
      for (let j = 0; j < n; j++) {
        if (j === i || !drawn[j]) continue;
        const zo = depthAt(drawn[j], half[j], sx);
        if (zo === null) continue;
        // the other photo's top edge, carried back into this plane, plus a little air (10 px on screen)
        lift = Math.max(lift, ((H / 2) * (P - zc)) / (P - zo) - H / 2 + (10 * (P - zc)) / P);
      }
    }
    caption.style.transform =
      `perspective(${P}px) translate3d(${st.x.toFixed(2)}px, 0, ${st.z.toFixed(2)}px) rotateY(${st.a.toFixed(3)}deg) ` +
      `translate(${u.toFixed(1)}px, ${(-H / 2 - lift).toFixed(1)}px) translate(-50%, -100%)`;
  }

  function showCaption(el) {
    if (!el || !el.dataset.caption) return hideCaption();
    if (el === shownFor) return;
    clearTimeout(swapTimer);
    shownFor = el;
    const show = () => {
      caption.textContent = el.dataset.caption;
      captionW = caption.offsetWidth;
      placeCaption(el);
      caption.classList.add('is-shown');
    };
    if (caption.classList.contains('is-shown')) {
      caption.classList.remove('is-shown'); // let the old one fade before the new one eases in
      swapTimer = setTimeout(show, 170);
    } else {
      show();
    }
  }

  function hideCaption() {
    clearTimeout(swapTimer);
    shownFor = null;
    caption.classList.remove('is-shown');
  }

  // the row has come to rest
  function settled() {
    if (!interactive || dragging || wheelTimer) return;
    if (!canHover || viaKeys) showCaption(items[target]);
    else if (pointer) showCaption(photoAt(pointer.x, pointer.y));
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer = { x: e.clientX, y: e.clientY };
    viaKeys = false;
    if (interactive && !dragging && !raf && !wheelTimer) showCaption(photoAt(e.clientX, e.clientY));
  });
  document.documentElement.addEventListener('mouseleave', () => {
    pointer = null;
    if (!viaKeys) hideCaption();
  });

  // ---------- the opening ----------

  function open() {
    if (opened) return;
    // start folded behind the main photo, using the same transform functions as the
    // laid-out state so each one interpolates on its own
    for (const c of cards) {
      c.style.setProperty('--i', String(Math.abs(items.indexOf(c) - HOME) - 1));
      c.style.transform = `perspective(${P}px) translate3d(0px, 0, ${(-P * FOLDED) / (1 - FOLDED)}px) rotateY(0deg)`;
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
    settled();
  }

  measure();
  render();
  root.classList.add('deck-ready');
  let resizing = 0;
  addEventListener('resize', () => {
    if (resizing) return;
    resizing = requestAnimationFrame(() => {
      resizing = 0;
      measure();
      if (placedOn) captionW = caption.offsetWidth;
      render();
    });
  });

  if (root.classList.contains('intro')) {
    document.addEventListener('hero-landing', open, { once: true });
    document.addEventListener('intro-done', ready, { once: true });
  } else {
    open();
    ready();
  }

  function smooth(x) {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  }

  // monotone cubic (Steffen): between p1 and p2, with slopes from the neighbours either
  // side, limited so the curve never bulges past its end values
  function mono(p0, p1, p2, p3, t) {
    const slope = (a, b, c) => {
      const s0 = b - a;
      const s1 = c - b;
      return (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), Math.abs(s0 + s1) / 4);
    };
    const m1 = slope(p0, p1, p2);
    const m2 = slope(p1, p2, p3);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  }
})();
