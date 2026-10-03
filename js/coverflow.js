// Cover Flow: the photos sit in a looping row, the one in focus flat in the middle
// and the rest folded back on either side. Drag, swipe, scroll, click or use the
// arrow keys to move along it. The row unfolds as the opening lands (js/intro.js),
// and folds away behind the photo in focus whenever another part of the page asks it
// to ('row-fold' and 'row-unfold' events: a photo's video in js/player.js, the about
// view in js/pages.js).

(() => {
  const ANGLE = 34; // degrees a side photo folds back
  const STEP_SCALE = 0.92; // each photo out looks this much smaller than the one inside it
  const REVEAL = 0.34; // strip of each side photo left showing, as a share of the photo height
  const DEPTH = 2.5; // perspective distance, as a multiple of the photo height
  const WINDOW = 0.1; // half-width of the moment two passing photos are apart, in photos of scroll
  const PART = 0.12; // the most two passing photos slide apart, as a share of the photo height
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
  const SEAM = Math.floor(n / 2); // the loop joins up just past this many places to the right
  const REACH = SEAM + 2; // how many places out either side get a resting spot
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FAN_TIME = 1300 + (SEAM - 1) * 90 + 50; // ms to fan out or fold back in, see .deck-opening and .deck-folding in the CSS
  const TUCKED = 900; // ms into folding when they're all out of sight behind the photo in focus

  const mod = (a, m) => ((a % m) + m) % m;

  // places from focus f to photo i around the loop, in (-n/2, n/2]
  function offset(i, f) {
    const d = mod(i - f + n / 2, n) - n / 2;
    return d <= -n / 2 ? d + n : d;
  }

  // photos fade out toward the seam and are hidden at it, so none is seen jumping across
  const shownAt = (d) => smooth(Math.min(SEAM - d, d - SEAM + n));

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

  // a photo's shape: the selfie as laid out, the others from the size of their files
  const aspect = (el) => (el === hero ? hero.offsetWidth / hero.offsetHeight : el.getAttribute('width') / el.getAttribute('height'));

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

  // screen x of photo i's leftmost (side -1) or rightmost (side 1) point
  const edgeOf = (st, i, side) => side * Math.max(side * screenX(st, -half[i]), side * screenX(st, half[i]));

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
    // the most they could need: each one's inner edge clear of the centre line on its own
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
    // ...but only as much of the slide apart and the swing as keeps the pair GAP apart while
    // they swap, so no more white space opens up between them than that
    const pass = (passes[f] = { part: PART, swingA, swingB, dip: 0 });
    const use = (s) => {
      pass.part = PART * Math.min(1, s);
      pass.swingA = swingA * Math.max(0, s - 1);
      pass.swingB = swingB * Math.max(0, s - 1);
    };
    use(bisect(2, 0, (s) => (use(s), apartBy(f) >= GAP), 20));
    // the shallowest dip that keeps everything clean, plus a little margin if that's clean too
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

  // the narrowest the space between photos f and f + 1 gets around the moment they swap
  function apartBy(f) {
    const g = mod(f + 1, n);
    let least = Infinity;
    for (let k = -2; k <= 2; k++) {
      const all = flowAt(f + 0.5 + (k * WINDOW) / 2);
      least = Math.min(least, edgeOf(all[g], g, -1) - edgeOf(all[f], f, 1));
    }
    return least;
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
      states[a].x -= pass.part * H * sw;
      states[b].x += pass.part * H * sw;
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
  let folded = false; // tucked away behind the photo in focus (for its video, or the about view)
  let kept = -1; // the photo left out while the rest are folded away
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
      if (folded && i !== kept) continue; // folded away
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
  let wasStill = false;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (dragging) {
      const prev = pos;
      pos = dragging.pos0 - (dragging.x - dragging.x0) / perItem;
      if (dt > 0) vel = vel * 0.6 + ((pos - prev) / dt) * 0.4;
    } else if (glide) {
      // a smooth curve from where it was (carrying the speed it had) to a stop at the end
      const k = clamp((now - glide.start) / glide.ms, 0, 1); // (a frame can be stamped just before it started)
      const { from, to, push } = glide;
      pos = k < 1 ? from + push * (k - 2 * k * k + k * k * k) + (to - from) * (3 * k * k - 2 * k * k * k) : to;
      if (k === 1) glide = null;
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
    if (arrived && !glide && Math.abs(pos - target) < 0.01) arrive(); // as good as there (a glide: once it's done)
    // the caption comes in as soon as the row has as good as stopped
    const still = !dragging && !glide && Math.abs(pos - target) < 0.02 && Math.abs(vel) < 0.3;
    if (still && !wasStill) settled();
    wasStill = still;
    if (dragging || glide || pos !== target || vel !== 0) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
      arrive();
      settled();
    }
  }

  // what to do once the row gets where goTo sent it
  let arrived = null;
  function arrive() {
    const then = arrived;
    arrived = null;
    then?.();
  }

  function run() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // spring to photo i (then, optionally, do something once it's there)
  function goTo(i, then = null) {
    target = Math.round(i);
    stiffness = OMEGA;
    glide = null;
    arrived = then;
    if (Math.abs(target - pos) > 0.001 || Math.abs(vel) > 0.01) hideCaption();
    if (reduced) {
      pos = target;
      vel = 0;
      render();
      arrive();
      settled();
      return;
    }
    run();
  }

  // a slower, gentler move than the spring, for going somewhere on the page's behalf:
  // it eases in and out, taking a little longer the further it has to go
  let glide = null;
  function glideTo(i, then) {
    if (reduced) return goTo(i, then);
    const to = Math.round(i);
    const ms = 400 + 100 * Math.abs(to - pos);
    glide = { from: pos, to, push: (vel * ms) / 1000, start: performance.now(), ms };
    target = to;
    vel = 0;
    arrived = then;
    hideCaption();
    run();
  }

  // ---------- drag, swipe, click ----------

  stage.addEventListener('pointerdown', (e) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    hideCaption();
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    clicked = null;
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
      // a click: bring that photo into focus, the short way round (or, if it's already
      // in focus and has a video, play that on the click event that follows)
      const i = items.indexOf(d.hit);
      const here = Math.round(pos);
      vel = 0;
      if (i >= 0 && offset(i, here) === 0 && d.hit.dataset.video) {
        clicked = d.hit;
        return;
      }
      return goTo(i >= 0 ? here + offset(i, here) : here);
    }
    vel = (-fingerSpeed(d.samples, e.timeStamp) * 1000) / perItem;
    goTo(pos + vel * FLING);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // Phones only let a video start with sound from a real click, so the video opens on
  // the click event rather than when the finger lifts.
  let clicked = null;
  stage.addEventListener('click', () => {
    if (clicked) playVideo(clicked, false);
    clicked = null;
  });

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
    else if (e.key === 'Enter' && e.target === document.body && items[mod(Math.round(target), n)].dataset.video) return playVideo(items[mod(Math.round(target), n)], true);
    else return;
    viaKeys = true;
    e.preventDefault();
  });

  // ---------- captions ----------
  // The caption of the photo in focus sits just above it, in the photo's own 3D plane
  // so it leans with it, and hides while the row moves. Hovering another photo shows
  // that one's instead.

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
    const hovered = canHover && pointer && !viaKeys ? photoAt(pointer.x, pointer.y) : null;
    showCaption(hovered || items[mod(target, n)]);
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer = { x: e.clientX, y: e.clientY };
    viaKeys = false;
    if (!raf) settled();
  });

  root.addEventListener('mouseleave', () => {
    pointer = null;
    if (!raf) settled();
  });

  // ---------- the opening ----------

  function open() {
    if (opened) return;
    opened = true;
    // start folded behind the main photo, then let the CSS transition fan them out
    for (const c of cards) {
      const i = items.indexOf(c);
      c.style.setProperty('--i', String(Math.abs(offset(i, HOME)) - 1)); // 0 for the photos either side of the selfie
      c.style.transform = tuckedAway(i);
    }
    if (folded) return; // it stays folded away for now (the page opened on the about view)
    if (!reduced) root.classList.add('deck-opening');
    root.classList.add('deck-open');
    void stage.offsetWidth; // flush styles so the transition starts from the folded state
    render();
    setTimeout(() => {
      root.classList.remove('deck-opening');
      ready();
    }, reduced ? 0 : FAN_TIME);
  }

  // photo i folded away straight behind the photo in focus: far enough back that what covers
  // it (half-width `cover`: the photo, or a narrower video over it) hides it, and at least
  // FOLDED smaller
  function tuckedAway(i, cover = half[HOME]) {
    const s = Math.min(1 - FOLDED, (0.9 * cover) / half[i]);
    return `perspective(${P}px) translate3d(0px, 0, ${(P * (1 - 1 / s)).toFixed(2)}px) rotateY(0deg)`;
  }

  function ready() {
    const busy = ['intro', 'deck-opening'].some((c) => root.classList.contains(c));
    if (folded || unfolding || busy) return; // not yet: folded away, or still opening or fanning out
    interactive = true;
    render();
    settled();
  }

  // the photo in focus has a video and was clicked: js/player.js plays it. Sent right
  // away, while this still counts as the click that lets the video play with sound.
  const playVideo = (photo, viaKeyboard) => document.dispatchEvent(new CustomEvent('photo-click', { detail: { photo, viaKeyboard } }));

  // ---------- folding away behind the photo in focus (for its video, or the about view) ----------

  const holds = new Set(); // what wants the row folded away right now
  let foldTimer = 0;
  let tucking = false; // the photos are on their way in
  let unfolding = false; // ... or on their way back out
  let cover = 0; // half-width of what they fold away behind (0: the photo in focus)
  let pending = null; // a fold asked for while they were still fanning out

  document.addEventListener('row-fold', (e) => {
    holds.add(e.detail.by);
    fold(e.detail.selfie, e.detail.cover);
  });
  document.addEventListener('row-unfold', (e) => {
    holds.delete(e.detail.by);
    if (!holds.size) unfold();
  });

  // Fold everything else away behind the photo in focus. For the selfie (the about view),
  // glide the row back round to it first. Says 'row-folded' once it's done.
  function fold(toSelfie, coverRatio = 0) {
    interactive = false;
    hideCaption();
    clearTimeout(wheelTimer); // a scroll that was about to settle somewhere else
    wheelTimer = 0;
    cover = (coverRatio * H) / 2;
    const here = Math.round(pos);
    const goal = toSelfie ? here + offset(HOME, here) : here;
    if (folded && mod(goal, n) !== kept) return swap(goal);
    if (unfolding && goal !== here) {
      pending = { toSelfie, coverRatio }; // let them finish fanning out, then glide round
      return;
    }
    if (goal === here) goTo(goal, tuck);
    else glideTo(goal, tuck); // round to the selfie, unhurried
  }

  // tuck every photo but the one in focus away behind it: outer ones first, or, if they were
  // still fanning out, all at once from where they are
  function tuck() {
    if (!holds.size) return; // asked to unfold again while it was on its way
    if (folded) {
      if (!tucking) announceFolded(); // (otherwise it will once they're in)
      return;
    }
    const midway = unfolding || root.classList.contains('deck-opening');
    folded = true;
    unfolding = false;
    kept = mod(target, n);
    items.forEach((el, i) => {
      el.classList.remove('is-unfolding');
      if (i === kept) return;
      el.style.setProperty('--j', midway ? '0' : String(SEAM - Math.abs(offset(i, kept))));
      el.style.transform = tuckedAway(i, cover || half[kept]);
      el.classList.add('is-tucked');
    });
    whenTucked();
  }

  // Folded round one photo but now wanted round another (the about view while a video was
  // open): behind the video, the hidden row jumps round and the old photo tucks away, while the
  // new one waits in the middle out of sight until the video closing over it has taken its
  // shape (js/player.js, about 0.45 s).
  function swap(goal) {
    glide = null;
    arrived = null;
    vel = 0;
    pos = target = goal;
    const old = kept;
    kept = mod(goal, n);
    items[old].style.transform = tuckedAway(old, half[kept]);
    items[old].classList.add('is-tucked');
    const now = items[kept];
    now.classList.remove('is-tucked', 'is-unfolding');
    now.classList.add('is-waiting');
    setTimeout(() => now.classList.remove('is-waiting'), reduced ? 0 : 450);
    render();
    whenTucked();
  }

  function whenTucked() {
    const animate = opened && !reduced;
    if (animate) root.classList.add('deck-folding');
    tucking = true;
    clearTimeout(foldTimer);
    foldTimer = setTimeout(() => {
      tucking = false;
      announceFolded(); // out of sight: the page can move on while they settle
      foldTimer = setTimeout(() => {
        root.classList.remove('deck-folding');
        for (const el of items) el.classList.remove('is-unfolding');
      }, animate ? FAN_TIME - TUCKED : 0);
    }, animate ? TUCKED : 0);
  }

  const announceFolded = () => document.dispatchEvent(new Event('row-folded'));

  // fan them back out: inner ones first, or, if they were still on their way in, all at
  // once from where they are
  function unfold() {
    arrived = null; // a fold still on its way doesn't happen
    pending = null;
    const midway = tucking;
    tucking = false;
    if (!folded) return ready();
    folded = false;
    clearTimeout(foldTimer);
    if (hero.offsetHeight !== H) measure(); // the selfie changed size while the row was away
    root.classList.remove('deck-folding');
    root.classList.add('deck-open');
    unfolding = !reduced;
    for (const el of items) {
      if (!el.classList.contains('is-tucked')) continue;
      el.style.setProperty('--i', midway ? '0' : String(Math.abs(offset(items.indexOf(el), kept)) - 1));
      el.classList.remove('is-tucked');
      if (!reduced) el.classList.add('is-unfolding');
    }
    render();
    foldTimer = setTimeout(() => {
      unfolding = false;
      for (const el of items) el.classList.remove('is-unfolding');
      if (pending) {
        const { toSelfie, coverRatio } = pending;
        pending = null;
        return fold(toSelfie, coverRatio);
      }
      ready();
    }, reduced ? 0 : FAN_TIME);
  }

  measure();
  render();
  root.classList.add('deck-ready');

  let resizing = 0;
  addEventListener('resize', () => {
    if (resizing) return;
    resizing = requestAnimationFrame(() => {
      resizing = 0;
      for (const el of items) el.style.setProperty('--i', '0'); // anything still fanning out carries on without a pause
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
