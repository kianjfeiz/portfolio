// The other photos fan out under the main one, accordion style: on each side
// every card is tucked under its inner neighbour with its inner edge folded
// back, a little smaller each step, running out past the edges of the page.
// They unfold from behind the main photo as it lands at the end of the opening.

(() => {
  const ANGLE = 34; // degrees each card's inner edge folds back
  const STEP_SCALE = 0.92; // each card a little smaller than the one inside it
  const REVEAL = 0.34; // strip of each card left showing past its inner neighbour, as a share of its height

  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const cards = [...document.querySelectorAll('.deck .card')];
  if (!hero || !cards.length) return;

  const cos = Math.cos((ANGLE * Math.PI) / 180);

  function layout() {
    const W = hero.offsetWidth;
    const H = hero.offsetHeight;
    for (const side of ['left', 'right']) {
      const dir = side === 'left' ? -1 : 1;
      let edge = W / 2; // how far out the visible fan reaches so far
      cards
        .filter((c) => c.dataset.side === side)
        .forEach((card, i) => {
          const h = H * STEP_SCALE ** (i + 1);
          const w = h * (card.width / card.height); // from the width/height attributes, no need to wait for load
          const shown = w * cos; // width on screen once folded
          const outer = edge + h * REVEAL; // equal-looking folds whatever the photo's shape
          edge = outer;
          const s = card.style;
          s.setProperty('--w', `${w.toFixed(1)}px`);
          s.setProperty('--h', `${h.toFixed(1)}px`);
          s.setProperty('--x', `${(dir * (outer - shown / 2)).toFixed(1)}px`);
          s.setProperty('--ry', `${-dir * ANGLE}deg`); // inner edge back, outer edge toward you
          s.setProperty('--z', String(19 - i));
          s.setProperty('--i', String(i));
        });
    }
  }

  let opened = false;
  function open() {
    if (opened) return;
    opened = true;
    root.classList.add('deck-opening', 'deck-open');
    // drop the transition once unfolded so the mouse tilt stays immediate
    const longest = 1300 + Math.max(...cards.map((c) => +c.style.getPropertyValue('--i'))) * 90;
    setTimeout(() => root.classList.remove('deck-opening'), longest + 50);
  }

  layout();
  root.classList.add('deck-ready');
  addEventListener('resize', layout);

  if (root.classList.contains('intro')) {
    document.addEventListener('hero-landing', open, { once: true });
  } else {
    open();
  }
})();
