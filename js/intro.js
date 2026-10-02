// The opening: the photo starts full-bleed, holds for a beat, then shrinks into
// its spot on the page while the name and links (and the about text) fade in.
// The photo is laid out at its final size and scaled up to cover the screen, so
// only its transform animates.

const HOLD = 700; // ms full-bleed before shrinking
const SHRINK = 1800; // ms
const EASE = 'cubic-bezier(0.7, 0, 0.2, 1)';

const root = document.documentElement;
if (root.classList.contains('intro')) run();

async function run() {
  const img = document.querySelector('.hero');
  try {
    await img.decode();
  } catch {
    return done(); // the image failed: just show the page
  }

  // the transform that scales the photo from its final box up to cover the screen
  const cover = () => {
    const prev = img.style.transform;
    img.style.transform = 'none';
    const r = img.getBoundingClientRect();
    img.style.transform = prev;
    const s = Math.max(innerWidth / r.width, innerHeight / r.height);
    const dx = innerWidth / 2 - (r.left + r.width / 2);
    const dy = innerHeight / 2 - (r.top + r.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  };

  img.style.transform = cover();
  root.classList.add('intro-ready');
  await new Promise((r) => setTimeout(r, HOLD));

  const shrink = img.animate([{ transform: cover() }, { transform: 'none' }], { duration: SHRINK, easing: EASE, fill: 'forwards' });
  img.style.transform = '';
  setTimeout(landing, SHRINK * 0.72); // the other photos start unfolding (js/coverflow.js)
  const fades = [...document.querySelectorAll('.nav, .about')].map((el) =>
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: SHRINK * 0.6, easing: 'ease-out', fill: 'forwards' }),
  );
  const all = [shrink, ...fades];

  // a resize mid-animation would leave it in the wrong place, so jump to the end
  const skip = () => all.forEach((a) => a.finish());
  addEventListener('resize', skip, { once: true });

  await Promise.all(all.map((a) => a.finished));
  removeEventListener('resize', skip);
  done();
  all.forEach((a) => a.cancel());
}

function done() {
  root.classList.remove('intro', 'intro-ready');
  landing();
  document.dispatchEvent(new Event('intro-done'));
}

let landed = false;
function landing() {
  if (landed) return;
  landed = true;
  document.dispatchEvent(new Event('hero-landing'));
}
