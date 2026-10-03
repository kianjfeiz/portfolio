// A photo with a video comes alive for a moment, like a live photo: a beat after the row
// comes to rest on it (js/coverflow.js), a couple of seconds of its video fade in over it,
// muted, then fade back to the photo. If the row moves on, it's gone at once. Each photo
// does it once a visit, and not at all once its video has been opened.

(() => {
  const peek = document.querySelector('.peek');
  if (!peek || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const WAIT = 900; // ms at rest before it starts
  const SHOW = 2200; // ms it plays before fading back
  const FADE = 600; // ms to fade back, see .peek.is-ending in the CSS

  let timers = [];
  let photo = null;
  const done = new Set(); // photos that have had their moment, or had their video opened

  document.addEventListener('row-rest', (e) => {
    stop();
    photo = e.detail.photo;
    if (photo?.dataset.video && !done.has(photo)) timers = [setTimeout(start, WAIT)];
  });
  document.addEventListener('photo-click', (e) => done.add(e.detail.photo));

  function start() {
    const mine = photo;
    peek.style.setProperty('--shape', String(photo.offsetWidth / photo.offsetHeight));
    if (peek.getAttribute('src') !== photo.dataset.video) peek.src = photo.dataset.video;
    peek.currentTime = 0;
    peek.muted = true;
    // fade in only once it's really playing, so a still frame never shows
    peek.play().then(() => {
      if (mine !== photo) return;
      done.add(mine);
      peek.classList.add('is-shown');
      timers.push(setTimeout(end, SHOW));
    }, () => {});
  }

  // done: fade gently back to the photo
  function end() {
    peek.classList.replace('is-shown', 'is-ending');
    timers.push(setTimeout(() => peek.pause(), FADE));
  }

  // the row moved (or folded): gone at once, before the photo can move off from under it
  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    photo = null;
    peek.classList.remove('is-shown', 'is-ending');
    peek.pause();
  }
})();
