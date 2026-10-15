// A photo opened out to fill the screen: clicking the photo in focus (js/coverflow.js)
// grows it from its place in the row to as big as fits the screen, over the page.
// Clicking it again, "exit" or Escape shrinks it back into the row.

(() => {
  const viewer = document.querySelector('.viewer');
  if (!viewer) return;
  const img = viewer.querySelector('.viewer-photo');
  const exit = viewer.querySelector('.viewer-exit');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MS = 550;
  const EASE = 'cubic-bezier(0.7, 0, 0.2, 1)';

  let photo = null; // the photo in the row it opened from
  let anim = null;

  // where it sits open: as big as fits the screen below the exit link, centred
  function place() {
    const W = document.documentElement.clientWidth;
    const H = document.documentElement.clientHeight;
    const side = W <= 700 ? 16 : 32;
    const top = exit.offsetTop + exit.offsetHeight + side; // clear of the exit link, and as much again below
    const shape = photo.naturalWidth / photo.naturalHeight || photo.offsetWidth / photo.offsetHeight;
    const w = Math.min(W - 2 * side, (H - 2 * top) * shape);
    const h = w / shape;
    Object.assign(img.style, { width: `${w}px`, height: `${h}px`, left: `${(W - w) / 2}px`, top: `${(H - h) / 2}px` });
  }

  // the transform that puts the open photo exactly over the one in the row
  function overPhoto() {
    const from = photo.getBoundingClientRect();
    const to = img.getBoundingClientRect();
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
  }

  function open(el) {
    photo = el;
    // the copy the row already has, so it shows at once (one still loading would leave the
    // last photo opened showing until it came)
    img.src = el.currentSrc || el.src;
    img.alt = el.alt;
    viewer.hidden = false;
    place();
    sharpen(el);
    const from = overPhoto();
    photo.classList.add('is-viewed'); // the open one stands in for it
    void viewer.offsetWidth; // (so the backdrop fades in from clear)
    viewer.classList.add('is-open');
    anim?.cancel();
    anim = img.animate([{ transform: from }, { transform: 'none' }], { duration: reduced ? 0 : MS, easing: EASE });
    exit.focus({ preventScroll: true, focusVisible: false }); // (no underline on it until it's hovered)
  }

  // swap in a bigger copy if the screen wants one, once it's loaded and (within reason)
  // ready to draw
  function sharpen(el) {
    if (!el.srcset) return;
    const big = new Image();
    big.sizes = `${Math.round(img.offsetWidth)}px`;
    big.srcset = el.srcset;
    big.src = el.src;
    big.onload = () =>
      Promise.race([big.decode(), new Promise((r) => setTimeout(r, 300))])
        .catch(() => {})
        .then(() => {
          if (photo === el && big.currentSrc !== img.currentSrc) img.src = big.currentSrc;
        });
  }

  function close() {
    if (!photo || !viewer.classList.contains('is-open')) return;
    viewer.classList.remove('is-open');
    anim?.cancel();
    anim = img.animate([{ transform: 'none' }, { transform: overPhoto() }], { duration: reduced ? 0 : MS, easing: EASE, fill: 'forwards' });
    anim.finished.then(shut, () => {});
  }

  // put it away at once, the row as it was
  function shut() {
    anim?.cancel();
    anim = null;
    viewer.hidden = true;
    viewer.classList.remove('is-open');
    if (!photo) return;
    photo.classList.remove('is-viewed');
    photo = null;
    document.dispatchEvent(new Event('photo-closed'));
  }

  document.addEventListener('photo-open', (e) => open(e.detail.photo));
  img.addEventListener('click', close);
  exit.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && photo) close();
  });
  addEventListener('resize', () => photo && viewer.classList.contains('is-open') && place());
  addEventListener('popstate', shut); // the back button leaves it for another view
})();
