// Cover Flow: the photos sit in a looping row, the one in focus flat in the middle
// and the rest folded back on either side. Drag, swipe, scroll, click or use the
// arrow keys to move along it. The row unfolds as the opening lands (js/intro.js).

(() => {
  const ANGLE = 34; // degrees a side photo folds back
  const STEP_SCALE = 0.92; // each photo out looks this much smaller than the one inside it
  const REVEAL = 0.34; // strip of each side photo left showing, as a share of the photo height
  const DEPTH = 2.5; // perspective distance, as a multiple of the photo height
  const WINDOW = 0.1; // half-width of the moment two passing photos are apart, in photos of scroll
  const PART = 0.12; // how far two passing photos slide apart, as a share of the photo height
  const GAP = 4; // px between two passing photos as they swap front and back
  const OMEGA = 10.5; // spring stiffness (rad/s)
  const ZETA = 0.8; // spring damping
  const FOLLOW = 22; // stiffer spring while a trackpad or wheel is moving the row
  const FLING = 0.22; // seconds of a flick's speed carried into where it lands
  const FOLDED = 0.16; // before the opening, the photos sit behind the main one, this much smaller
  const RAD = Math.PI / 180;

  const root = document.documentElement;
  const stage = document.querySelector('.stage');
  const hero = document.querySelector('.hero');
  const caption = document.querySelector('.caption');
  const cards = [...document.querySelectorAll('.deck .card')];
  if (!stage || !hero || !cards.length) return;

  // one row, left to right (the markup lists each side inner to outer)
  const left = cards.filter((c) => c.dataset.side === 'left').reverse();
  const right = cards.filter((c) => c.dataset.side === 'right');
  const items = [...left, hero, ...right];
  const HOME = left.length;
  const n = items.length;
  const REACH = Math.floor(n / 2) + 2; // how many places out either side get a resting spot
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mod = (a, m) => ((a % m) + m) % m;

  // places from focus f to photo i around the loop, in (-n/2, n/2]
  function offset(i, f) {
    const d = mod(i - f + n / 2, n) - n / 2;
    return d <= -n / 2 ? d + n : d;
  }

  // the photo directly opposite the focus is hidden, so the loop's seam never shows
  const shownAt = (d) => smooth(n / 2 - Math.abs(d));

  // A photo's state is { x, z, a, o }: x and depth in px, rotateY in degrees, and
  // opacity. Side photos sit genuinely further back rather than being scaled, so
  // whatever is nearer really is in front.
  let H = 0; // height of the photo in focus
  let P = 1100; // perspective, px
  let perItem = 1; // px of drag that moves one photo
  let half = []; // half-width of each photo
  let layouts = []; // layouts[f][d + REACH]: resting state of the photo d places from focus f
  let passes = []; // passes[f]: how photos f and f + 1 swing and dip as they trade places
  let ox = 0; // stage centre on screen

  const aspect = (el) => (el === hero ? hero.offsetWidth / hero.offsetHeight : el.width / el.height);

  // ---------- geometry ----------

  // screen x (from the stage centre) of the point u px along a photo's width
  function screenX(st, u) {
    const x = st.x + u * Math.cos(st.a * RAD);
    const z = st.z - u * Math.sin(st.a * RAD);
    return (x * P) / (P - z);
  }

  // how far along a photo's width the ray through screen column sx meets it
  function alongAt(st, sx) {
    const c = Math.cos(st.a * RAD);
    const s = Math.sin(st.a * RAD);
    return ((sx * (P - st.z)) / P - st.x) / (c - (sx * s) / P);
  }

  // depth of a photo at screen column sx, or null if it isn't there
  function depthAt(st, hw, sx) {
    const u = alongAt(st, sx);
    return Math.abs(u) > hw ? null : st.z - u * Math.sin(st.a * RAD);
  }

  // is `top` (painted above) nearer than `under` everywhere the two overlap on screen?
  const SAMPLES = [0, 0.04, 0.12, 0.25, 0.5, 0.75, 1];
  function clearOf(top, hwTop, under, hwUnder) {
    const lo = Math.max(screenX(top, -hwTop), screenX(under, -hwUnder));
    const hi = Math.min(screenX(top, hwTop), screenX(under, hwUnder));
    if (lo >= hi) return true;
    for (const k of SAMPLES) {
      for (const sx of [hi - 0.25 - k * (hi - lo - 0.5), lo + 0.25 + k * (hi - lo - 0.5)]) {
        const dt = depthAt(top, hwTop, sx);
        const du = depthAt(under, hwUnder, sx);
        if (dt !== null && du !== null && dt < du + 1) return false;
      }
    }
    return true;
  }

  // ---------- layout ----------

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
    layouts = items.map((_, f) => restingAround(f));
    passes = [];
    for (let f = 0; f < n; f++) planPass(f);
  }

  // where every photo rests with photo f in focus
  function restingAround(f) {
    const L = [];
    L[REACH] = { x: 0, z: 0, a: 0 };
    for (const dir of [-1, 1]) {
      let edge = half[f]; // where the next photo out starts showing
      for (let k = 1; k <= REACH; k++) {
        const i = mod(f + dir * k, n);
        const s = STEP_SCALE ** k;
        const z = P * (1 - 1 / s); // far enough back to look s times the size
        const shown = 2 * half[i] * s * Math.cos(ANGLE * RAD); // roughly its width on screen
        edge += H * s * REVEAL;
        const xs = dir * (edge - shown / 2);
        const st = { x: (xs * (P - z)) / P, z, a: -dir * ANGLE };
        if (k === 1) {
          // keep the first photo out from reaching past the centre line or poking
          // in front of the focused photo (narrow photos, very wide screens)
          const fits = (x) => {
            const at = { ...st, x };
            return dir * screenX(at, -dir * half[i]) >= 1 && clearOf(L[REACH], half[f], at, half[i]);
          };
          if (!fits(st.x)) {
            st.x = bisect(st.x + dir * 2 * H, st.x, fits, 24);
            edge = Math.max(edge, dir * screenX(st, dir * half[i]));
          }
        }
        L[REACH + dir * k] = st;
      }
    }
    return L;
  }

  // Two overlapping photos can't swap front and back without passing through each
  // other, so as photo f hands over to the next one they swing steeper and slide
  // apart until there's a gap between them, and whichever is underneath dips back.
  function planPass(f) {
    const g = mod(f + 1, n);
    let swingA = 0;
    let swingB = 0;
    for (const t of [0.5 - WINDOW, 0.5, 0.5 + WINDOW]) {
      const A = curve(f, f, t);
      const B = curve(g, f, t);
      A.x -= PART * H * swingAt(t);
      B.x += PART * H * swingAt(t);
      swingA = Math.max(swingA, (steepest(A, half[f], +1) - A.a) / swingAt(t));
      swingB = Math.min(swingB, (steepest(B, half[g], -1) - B.a) / swingAt(t));
    }
    // the shallowest dip that keeps everything clean, plus a little margin if that's clean too
    const pass = (passes[f] = { swingA, swingB, dip: 0 });
    let best = { dip: 0, bad: passFaults(f) };
    for (let dip = H * 0.02; best.bad && dip <= H * 1.5; dip += H * 0.02) {
      pass.dip = dip;
      const bad = passFaults(f);
      if (bad < best.bad) best = { dip, bad };
    }
    pass.dip = best.dip + H * 0.03;
    if (best.bad || passFaults(f)) pass.dip = best.dip;
  }

  // the angle that just brings a photo's inner edge clear of the centre line
  // (edge +1: its right edge, for a photo left of centre; -1: its left edge)
  function steepest(st, hw, edge) {
    const clear = (a) => edge * screenX({ ...st, a }, edge * hw) <= -GAP / 2;
    return clear(st.a) ? st.a : bisect(edge * 89, st.a, clear, 30);
  }

  // how often, during the hand-over from f to f + 1, a photo is painted over one that's nearer
  function passFaults(f) {
    let bad = 0;
    for (let k = 1; k < 80; k++) {
      const t = k / 80;
      if (k === 40) continue; // halfway, where the pair swap
      const all = flowAt(f + t);
      for (let a = -2; a <= 3; a++) {
        for (let b = -2; b <= 3; b++) {
          if (Math.abs(a - t) >= Math.abs(b - t)) continue; // only where a is painted on top of b
          const i = mod(f + a, n);
          const j = mod(f + b, n);
          if (all[i].o < 0.05 || all[j].o < 0.05) continue;
          if (!clearOf(all[i], half[i], all[j], half[j])) bad++;
        }
      }
    }
    return bad;
  }

  // ---------- motion along the row ----------

  // resting state of the photo d places from focus f
  const rest = (f, d) => layouts[mod(f, n)][d + REACH];

  // photo i, a fraction t of the way from focus f to f + 1: a smooth curve through
  // its resting states that never overshoots them
  function curve(i, f, t) {
    const d = offset(i, f);
    const p0 = rest(f - 1, d + 1);
    const p1 = rest(f, d);
    const p2 = rest(f + 1, d - 1);
    const p3 = rest(f + 2, d - 2);
    return {
      x: mono(p0.x, p1.x, p2.x, p3.x, t),
      z: mono(p0.z, p1.z, p2.z, p3.z, t),
      a: mono(p0.a, p1.a, p2.a, p3.a, t),
      o: shownAt(d - t),
    };
  }

  const swingAt = (t) => Math.sin(Math.PI * t) ** 2;
  const dipAt = (t) => smooth(t / (0.5 - WINDOW)) * (1 - smooth((t - 0.5 + WINDOW) / (2 * WINDOW)));

  // every photo's state with the focus at position p (p counts on past n as you go round)
  function flowAt(p) {
    const f = Math.floor(p);
    const t = p - f;
    const states = items.map((_, i) => curve(i, f, t));
    const a = mod(f, n);
    const b = mod(f + 1, n);
    const pass = passes[a];
    if (pass && t > 0) {
      const sw = swingAt(t);
      states[a].a += pass.swingA * sw;
      states[b].a += pass.swingB * sw;
      states[a].x -= PART * H * sw;
      states[b].x += PART * H * sw;
      states[a].z -= pass.dip * dipAt(1 - t); // the leaving photo dips after halfway
      states[b].z -= pass.dip * dipAt(t); // the arriving one before
    }
    return states;
  }

  // how far photo i is from the focus at position p (signed)
  const away = (i, p) => offset(i, Math.floor(p)) - (p - Math.floor(p));

  // ---------- drawing ----------

  let pos = HOME; // which photo is in focus (continuous)
  let opened = false;
  let interactive = false;
  const drawn = []; // each photo's state as last drawn
  const ranks = []; // how far each is from the focus as last drawn
  const zIndexes = [];
  const opacities = [];
  let centered = -1;

  function render() {
    const all = flowAt(pos);
    for (let i = 0; i < n; i++) {
      const el = items[i];
      const st = all[i];
      // nearer the focus paints on top; the passing pair swap exactly halfway
      const d = away(i, pos);
      ranks[i] = Math.abs(d);
      const z = 10000 - Math.round(ranks[i] * 1000) + (d === 0.5 ? 1 : 0);
      if (zIndexes[i] !== z) el.style.zIndex = String((zIndexes[i] = z));
      const o = Math.round(st.o * 1000) / 1000;
      if (opacities[i] !== o) {
        el.style.opacity = o === 1 ? '' : String(o);
        el.style.visibility = o === 0 ? 'hidden' : '';
        opacities[i] = o;
      }
      if (el === hero ? root.classList.contains('intro') : !opened) continue; // still opening
      el.style.transform = `perspective(${P}px) translate3d(${st.x.toFixed(2)}px, 0, ${st.z.toFixed(2)}px) rotateY(${st.a.toFixed(3)}deg)`;
      drawn[i] = { ...st };
    }
    const center = mod(Math.round(pos), n);
    if (center !== centered) {
      items[centered]?.classList.remove('is-center');
      items[center].classList.add('is-center');
      centered = center;
    }
    if (placedOn) placeCaption(placedOn); // keep the caption on its photo
  }

  // ---------- the spring: drags, flicks, scrolling, clicks and keys all move it ----------

  let vel = 0; // photos per second
  let target = HOME;
  let stiffness = OMEGA;
  let dragging = null;
  let raf = 0;
  let last = 0;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (dragging) {
      const prev = pos;
      pos = dragging.pos0 - (dragging.x - dragging.x0) / perItem;
      if (dt > 0) vel = vel * 0.6 + ((pos - prev) / dt) * 0.4;
    } else {
      // small steps keep it stable at any frame rate
      const steps = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / steps;
      for (let k = 0; k < steps; k++) {
        vel += (-stiffness * stiffness * (pos - target) - 2 * ZETA * stiffness * vel) * h;
        pos += vel * h;
      }
      if (Math.abs(pos - target) < 0.0004 && Math.abs(vel) < 0.002) {
        pos = target;
        vel = 0;
      }
    }
    render();
    if (dragging || pos !== target || vel !== 0) {
      raf = requestAnimationFrame(frame);
    } else {
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
    target = Math.round(i);
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

  // ---------- drag, swipe, click ----------

  stage.addEventListener('pointerdown', (e) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    root.classList.remove('deck-opening');
    hideCaption();
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    dragging = { id: e.pointerId, x0: e.clientX, x: e.clientX, pos0: pos, moved: false, hit: e.target.closest('.card, .hero'), samples: [[e.timeStamp, e.clientX]] };
    stage.setPointerCapture(e.pointerId);
    run();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    for (const ce of e.getCoalescedEvents?.() || [e]) dragging.samples.push([ce.timeStamp, ce.clientX]);
    dragging.x = e.clientX;
    if (Math.abs(dragging.x - dragging.x0) > 4) dragging.moved = true;
    while (dragging.samples.length > 2 && dragging.samples[0][0] < e.timeStamp - 120) dragging.samples.shift();
  });

  function release(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const d = dragging;
    dragging = null;
    if (!d.moved) {
      // a click: bring that photo into focus, the short way round
      const i = items.indexOf(d.hit);
      const here = Math.round(pos);
      vel = 0;
      return goTo(i >= 0 ? here + offset(i, here) : here);
    }
    vel = (-fingerSpeed(d.samples, e.timeStamp) * 1000) / perItem;
    goTo(pos + vel * FLING);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // the finger's speed over its last 80 ms in px per ms (least squares), or 0 if it stopped
  function fingerSpeed(samples, now) {
    const recent = samples.filter(([t]) => t >= now - 80);
    if (recent.length < 2 || now - recent[recent.length - 1][0] >= 60) return 0;
    const mt = recent.reduce((sum, [t]) => sum + t, 0) / recent.length;
    const mx = recent.reduce((sum, [, x]) => sum + x, 0) / recent.length;
    let num = 0;
    let den = 0;
    for (const [t, x] of recent) {
      num += (t - mt) * (x - mx);
      den += (t - mt) ** 2;
    }
    return den > 0 ? num / den : 0;
  }

  // ---------- trackpad and scroll wheel ----------
  // Scroll events arrive unevenly, so they move where a stiff spring is heading
  // rather than the row itself. Once they stop, the row settles on a photo.

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
    if (!wheelTimer) target = pos;
    wheelDir = Math.sign(px);
    target += px / (perItem * 1.15);
    stiffness = FOLLOW;
    run();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelTimer = 0;
      goTo(target + wheelDir * 0.3); // lean the way it was going
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
  // The hovered photo's caption sits just above it, in the photo's own 3D plane so
  // it leans with it. It hides while the row moves. On touch screens, or after
  // using the arrow keys, it's the caption of the photo in focus.

  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const LIFT = 14; // px between the caption and the top of its photo
  let shownFor = null; // photo whose caption is showing or about to
  let placedOn = null; // photo the caption is drawn on
  let captionW = 0;
  let pointer = null;
  let viaKeys = false;
  let swapTimer = 0;

  const photoAt = (x, y) => document.elementFromPoint(x, y)?.closest('.stage .card, .stage .hero') || null;

  // the widest stretch of photo i on screen that no photo painted above it covers
  function visibleSpan(i, minX, maxX) {
    let segs = [[Math.max(minX, screenX(drawn[i], -half[i])), Math.min(maxX, screenX(drawn[i], half[i]))]];
    for (let j = 0; j < n; j++) {
      if (j === i || !drawn[j] || drawn[j].o < 0.05 || ranks[j] >= ranks[i]) continue;
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
    const w = captionW;
    const minX = 16 - ox;
    const maxX = innerWidth - 16 - ox;
    // centre it over the visible part of the photo, but keep it on screen
    const [vl, vr] = visibleSpan(i, minX, maxX);
    const lo = Math.max(-half[i], alongAt(st, vl));
    const hi = Math.min(half[i], alongAt(st, vr));
    let u = (lo + hi) / 2;
    if (hi - lo >= w) u = clamp(u, lo + w / 2, hi - w / 2);
    const uMin = alongAt(st, minX) + w / 2;
    const uMax = alongAt(st, maxX) - w / 2;
    if (uMin <= uMax) u = clamp(u, uMin, uMax);
    // raise it until it clears the top of every photo it passes over
    let lift = LIFT;
    const sl = screenX(st, u - w / 2);
    const sr = screenX(st, u + w / 2);
    for (let k = 0; k <= 8; k++) {
      const sx = sl + ((sr - sl) * k) / 8;
      const zc = st.z - alongAt(st, sx) * Math.sin(st.a * RAD); // this photo's depth there
      for (let j = 0; j < n; j++) {
        if (j === i || !drawn[j] || drawn[j].o < 0.05) continue;
        const zo = depthAt(drawn[j], half[j], sx);
        if (zo === null) continue;
        // the other photo's top edge, carried into this photo's plane, plus 10 px on screen
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
      caption.classList.remove('is-shown'); // fade the old one out first
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
    if (!canHover || viaKeys) showCaption(items[mod(target, n)]);
    else if (pointer) showCaption(photoAt(pointer.x, pointer.y));
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer = { x: e.clientX, y: e.clientY };
    viaKeys = false;
    if (interactive && !dragging && !raf && !wheelTimer) showCaption(photoAt(e.clientX, e.clientY));
  });

  root.addEventListener('mouseleave', () => {
    pointer = null;
    if (!viaKeys) hideCaption();
  });

  // ---------- the opening ----------

  function open() {
    if (opened) return;
    // start folded behind the main photo, then let the CSS transition unfold them
    for (const c of cards) {
      c.style.setProperty('--i', String(Math.abs(offset(items.indexOf(c), HOME)) - 1));
      c.style.transform = `perspective(${P}px) translate3d(0px, 0, ${(-P * FOLDED) / (1 - FOLDED)}px) rotateY(0deg)`;
    }
    if (!reduced) root.classList.add('deck-opening');
    root.classList.add('deck-open');
    void stage.offsetWidth; // flush styles so the transition starts from the folded state
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

  // ---------- helpers ----------

  function smooth(x) {
    const c = clamp(x, 0, 1);
    return c * c * (3 - 2 * c);
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  // binary search between a value that passes `ok` and one that fails; returns the passing end
  function bisect(good, bad, ok, steps) {
    for (let k = 0; k < steps; k++) {
      const mid = (good + bad) / 2;
      if (ok(mid)) good = mid;
      else bad = mid;
    }
    return good;
  }

  // monotone cubic (Steffen) between p1 and p2: smooth, and never bulges past its ends
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
