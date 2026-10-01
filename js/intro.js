// Opening shot: the photo starts full-bleed, holds for a beat, then shrinks
// into its framed spot on the page while the name and links fade in.
//
// FLIP: the image is laid out at its final size; we measure that box and start
// it with a transform that scales it up to cover the viewport (a 4:3 box
// scaled to cover looks exactly like object-fit: cover). Only the transform
// animates, so it stays smooth.

const HOLD = 700; // ms full-bleed before shrinking
const SHRINK = 1800; // ms
const EASE = 'cubic-bezier(0.7, 0, 0.2, 1)';

const root = document.documentElement;
if (root.classList.contains('intro')) run();

async function run() {
  const img = document.querySelector('.hero');
  const nav = document.querySelector('.nav');
  try {
    await img.decode();
  } catch {
    return done(); // image failed: just show the page
  }

  const cover = () => {
    const prev = img.style.transform;
    img.style.transform = 'none'; // measure the final, untransformed box
    const r = img.getBoundingClientRect();
    img.style.transform = prev;
    const s = Math.max(innerWidth / r.width, innerHeight / r.height);
    const dx = innerWidth / 2 - (r.left + r.width / 2);
    const dy = innerHeight / 2 - (r.top + r.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  };

  img.style.transform = cover();
  root.classList.add('intro-ready'); // reveal the full-bleed photo
  await new Promise((r) => setTimeout(r, HOLD));

  const from = cover(); // re-measure in case the window changed during the hold
  const shrink = img.animate([{ transform: from }, { transform: 'none' }], { duration: SHRINK, easing: EASE, fill: 'forwards' });
  img.style.transform = '';
  // let the photos underneath start unfolding as the main one settles (js/deck.js)
  setTimeout(landing, SHRINK * 0.72);
  const reveal = nav.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: 900, delay: SHRINK * 0.6, easing: 'ease-out', fill: 'forwards' },
  );

  // a resize mid-animation would leave a stale transform: jump to the end
  const skip = () => { shrink.finish(); reveal.finish(); };
  addEventListener('resize', skip, { once: true });

  await Promise.all([shrink.finished, reveal.finished]);
  removeEventListener('resize', skip);
  done();
  shrink.cancel();
  reveal.cancel();
}

function done() {
  root.classList.remove('intro', 'intro-ready');
  landing();
}

let landed = false;
function landing() {
  if (landed) return;
  landed = true;
  document.dispatchEvent(new Event('hero-landing'));
}
