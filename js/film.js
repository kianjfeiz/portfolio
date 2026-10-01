// The homepage as a roll of film. The photo opens full-bleed, then shrinks
// into frame 1 of a strip of black film coming out of a Kodak Gold canister.
// Scrolling pulls the film out: the strip slides right, past the edge of the
// page, and fresh frames come out of the canister.
//
// Everything is flat SVG drawn in millimetres at real 35mm proportions and
// scaled by k (screen px per mm). Testing hooks: ?still (skip the opening),
// ?freeze=<ms> (hold the opening at that moment), ?scroll=<0..1> (pull the film).

(() => {
  const root = document.documentElement;
  if (!root.classList.contains('film')) return;

  const HOLD = 700; // ms on the full-bleed photo
  const SHRINK = 1800; // ms
  const EASE = 'cubic-bezier(0.7, 0, 0.2, 1)';

  // 35mm film, mm
  const FILM_W = 35;
  const PITCH = 38; // one frame = 8 perforations
  const WIN = { x: 3, y: 5.5, w: 32, h: 24 }; // image window inside a frame (4:3)
  const PERF = { w: 2.8, h: 1.98, pitch: 4.75, y: [3.0, 32.0], r: 0.45 };
  const GAP = 5; // film visible between the canister lip and the photo window
  // canister, mm (viewBox 0 0 30 54); the film's centre line sits at y = 29, the lip's right edge at x = 29.8
  const CAN = { w: 30, h: 54, filmY: 29, lipX: 29.8, centerX: 15 };

  const BLACK = '#0c0c0c';
  const FRAME_BLACK = '#161616';
  const EDGE_INK = '#e9a93b';
  const GOLD = '#f4b31a';
  const RED = '#c8102e';

  const params = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forced = params.has('scroll') ? clamp01(parseFloat(params.get('scroll'))) : null;
  const freezeAt = params.has('freeze') ? parseFloat(params.get('freeze')) : null;
  const skipIntro = reduced || params.has('still') || forced !== null;

  const img = document.querySelector('.hero');
  const strip = document.querySelector('.strip');
  const canister = document.querySelector('.canister');
  const SVG = 'http://www.w3.org/2000/svg';

  let k = 10; // px per mm
  let maxPull = 0;
  let pull = 0;
  let ribs = null;

  // ---------- drawing ----------

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVG, tag);
    for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v);
    if (parent) parent.append(e);
    return e;
  }

  function drawCanister() {
    const svg = el('svg', { viewBox: `0 0 ${CAN.w} ${CAN.h}`, width: CAN.w * k, height: CAN.h * k });
    const defs = el('defs', {}, svg);
    // ribbed spool knob; the ribs slide sideways as the spool turns
    const pat = el('pattern', { id: 'knob-ribs', width: 1.3, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
    el('rect', { width: 1.3, height: 10, fill: '#1b1b1b' }, pat);
    el('rect', { width: 0.45, height: 10, fill: '#303030' }, pat);
    ribs = pat;
    el('rect', { x: 10.5, y: 0, width: 9, height: 7.6, rx: 0.8, fill: 'url(#knob-ribs)' }, svg);
    // caps
    el('rect', { x: 0.8, y: 7.5, width: 28.4, height: 3.4, rx: 1, fill: '#262626' }, svg);
    el('rect', { x: 0.8, y: 47.1, width: 28.4, height: 3.4, rx: 1, fill: '#262626' }, svg);
    el('rect', { x: 12, y: 50.4, width: 6, height: 2, rx: 0.4, fill: '#1b1b1b' }, svg);
    // body
    el('rect', { x: 2, y: 10.9, width: 26, height: 36.2, fill: BLACK }, svg);
    // label band
    el('rect', { x: 2, y: 17.5, width: 26, height: 19, fill: GOLD }, svg);
    el('rect', { x: 2, y: 33.2, width: 26, height: 3.3, fill: RED }, svg);
    const t1 = el('text', { x: 15, y: 23.6, 'text-anchor': 'middle', 'font-size': 4.6, 'font-weight': 800, 'letter-spacing': 0.5, fill: BLACK, 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
    t1.textContent = 'KODAK';
    const t2 = el('text', { x: 15, y: 30.4, 'text-anchor': 'middle', 'font-size': 4.4, 'font-weight': 800, fill: RED, 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
    t2.textContent = 'GOLD 200';
    const t3 = el('text', { x: 15, y: 35.55, 'text-anchor': 'middle', 'font-size': 1.7, 'font-weight': 700, 'letter-spacing': 0.2, fill: '#fff', 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
    t3.textContent = '35mm · 36 EXP';
    // felt-lined lip on the right, where the film comes out
    el('rect', { x: 27.4, y: 12.4, width: 2.4, height: 33.2, rx: 0.6, fill: '#050505' }, svg);
    canister.replaceChildren(svg);
  }

  // frames: tile 0 is the deepest inside the canister, tile n-1 is frame 1 (the photo),
  // then two leader tiles ending in the cut-down tongue on the right
  function drawStrip(frames) {
    const tiles = frames + 2;
    const L = tiles * PITCH;
    const svg = el('svg', { viewBox: `0 0 ${L} ${FILM_W}`, width: L * k, height: FILM_W * k });
    const defs = el('defs', {}, svg);
    const mask = el('mask', { id: 'perfs', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: L, height: FILM_W }, defs);
    el('rect', { width: L, height: FILM_W, fill: '#fff' }, mask);

    // film outline: full width, then the leader narrows to a rounded tongue
    const sh = frames * PITCH; // start of the leader
    const top = (x) => (x < 9 ? 0 : x > 33 ? 15.2 : (15.2 * (1 - Math.cos((Math.PI * (x - 9)) / 24))) / 2);
    let d = `M0 0 L${sh} 0`;
    for (let x = 0; x <= PITCH; x += 0.5) d += ` L${sh + x} ${top(x)}`;
    const end = L, r = 3;
    d += ` L${end - r} 15.2 Q${end} 15.2 ${end} ${15.2 + r} L${end} ${FILM_W - r} Q${end} ${FILM_W} ${end - r} ${FILM_W} L0 ${FILM_W} Z`;
    el('path', { d, fill: BLACK, mask: 'url(#perfs)' }, svg);

    for (let t = 0; t < tiles; t++) {
      const x0 = t * PITCH;
      // perforations (punched through, so the page shows)
      for (let i = 0; i < 8; i++) {
        const cx = x0 + (i + 0.5) * PERF.pitch;
        for (const cy of PERF.y) {
          if (t >= frames && cy < top(cx - sh) + 1.5) continue; // no top row along the cut-down leader
          el('rect', { x: cx - PERF.w / 2, y: cy - PERF.h / 2, width: PERF.w, height: PERF.h, rx: PERF.r, fill: '#000' }, mask);
        }
      }
      if (t >= frames) continue;
      const n = frames - t; // frame number
      el('rect', { x: x0 + WIN.x, y: WIN.y, width: WIN.w, height: WIN.h, rx: 0.5, fill: FRAME_BLACK }, svg);
      // Kodak Gold style edge printing
      text(svg, x0 + 6, 34.55, `${n}`);
      text(svg, x0 + 24, 34.55, `▸${n}A`);
      if (n % 2 === 1) text(svg, x0 + 4, 1.55, 'KODAK GOLD 200 6');
    }
    text(svg, sh + 30, 34.55, '▸');
    strip.replaceChildren(svg);
  }

  function text(svg, x, y, s) {
    const t = el('text', { x, y, 'font-size': 1.25, 'font-weight': 700, 'letter-spacing': 0.12, fill: EDGE_INK, 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
    t.textContent = s;
  }

  // ---------- layout ----------

  function layout() {
    const W = innerWidth, H = innerHeight;
    // px per mm: the canister fits the height, the canister + photo fit the width
    const compW = 29 + GAP + WIN.w + 6; // canister visual width, gap, photo, a little film past it
    k = Math.min((H * 0.6) / CAN.h, (W * 0.92) / compW, (W * (W < 700 ? 0.5 : 0.34)) / WIN.w);

    const filmY = H * 0.45; // film centre line
    // centre the photo if the canister still fits on its left, otherwise centre the whole roll
    const photoCenteredLip = W / 2 - WIN.w * k / 2 - GAP * k;
    const lipX = photoCenteredLip - CAN.lipX * k >= W * 0.04 ? photoCenteredLip : (W - compW * k) / 2 + 29 * k;

    const photoLeft = lipX + GAP * k;
    const photoTop = filmY - (WIN.h / 2) * k;
    maxPull = W - photoLeft + 2 * PITCH * k; // the photo leaves past the right edge, plus a couple of frames
    const frames = Math.ceil((maxPull + (CAN.lipX - CAN.centerX) * k) / (PITCH * k)) + 3;

    drawCanister();
    drawStrip(frames);

    // frame 1's window is in tile frames-1 of the strip
    const stripLeft = photoLeft - ((frames - 1) * PITCH + WIN.x) * k;
    const reelLeft = lipX - (CAN.lipX - CAN.centerX) * k; // film left of the canister's middle stays hidden
    set({
      '--reel-left': reelLeft,
      '--strip-left': stripLeft - reelLeft,
      '--strip-top': filmY - (FILM_W / 2) * k,
      '--can-left': lipX - CAN.lipX * k,
      '--can-top': filmY - CAN.filmY * k,
      '--photo-left': photoLeft,
      '--photo-top': photoTop,
      '--photo-w': WIN.w * k,
      '--photo-h': WIN.h * k,
      '--photo-radius': 0.5 * k,
      '--nav-top': filmY + (FILM_W / 2) * k + 22,
      '--nav-x': photoLeft + (WIN.w / 2) * k - W / 2,
    });
  }

  function set(vars) {
    for (const [name, v] of Object.entries(vars)) root.style.setProperty(name, `${Math.round(v * 100) / 100}px`);
  }

  // ---------- scroll: pull the film out ----------

  function wantedPull() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = forced !== null ? forced : max > 0 ? scrollY / max : 0;
    return clamp01(p) * maxPull;
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const want = wantedPull();
    pull += (want - pull) * (reduced ? 1 : 1 - Math.exp(-dt * 9));
    if (Math.abs(want - pull) < 0.1) pull = want;
    root.style.setProperty('--pull', `${pull.toFixed(2)}px`);
    // turn the spool: knob ribs slide as film is pulled out
    if (ribs) ribs.setAttribute('patternTransform', `translate(${(-(pull / k) * 0.35) % 1.3} 0)`);
    requestAnimationFrame(tick);
  }

  // ---------- the opening ----------

  async function intro() {
    root.style.setProperty('--nav-opacity', '0');
    try {
      await img.decode();
    } catch {
      /* show the page anyway */
    }
    const r = img.getBoundingClientRect();
    const s = Math.max(innerWidth / r.width, innerHeight / r.height);
    const dx = innerWidth / 2 - (r.left + r.width / 2);
    const dy = innerHeight / 2 - (r.top + r.height / 2);
    const from = `translate(${dx}px, ${dy}px) scale(${s})`;
    root.classList.add('intro');
    const opts = { duration: SHRINK, delay: HOLD, easing: EASE, fill: 'both' };
    const shrink = img.animate([{ transform: from, borderRadius: '0px' }, { transform: 'translateX(0px)', borderRadius: getComputedStyle(img).borderRadius }], opts);
    const navIn = document.querySelector('.nav').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: HOLD + SHRINK * 0.6, easing: 'ease-out', fill: 'both' });
    if (freezeAt !== null) {
      for (const a of [shrink, navIn]) {
        a.pause();
        a.currentTime = freezeAt;
      }
      return;
    }
    addEventListener('resize', () => { shrink.finish(); navIn.finish(); }, { once: true });
    await Promise.all([shrink.finished, navIn.finished]);
    root.style.setProperty('--nav-opacity', '1');
    shrink.cancel();
    navIn.cancel();
    root.classList.remove('intro');
    root.classList.add('live');
  }

  layout();
  addEventListener('resize', layout);
  requestAnimationFrame(tick);
  if (skipIntro) {
    root.classList.add('live');
  } else {
    intro();
  }

  function clamp01(x) {
    return Math.min(1, Math.max(0, x || 0));
  }
})();
