// The video: clicking the selfie when it's in focus (or Enter) folds the other
// photos away (js/coverflow.js) and the selfie opens out into this little player.
// Space plays and pauses, Escape closes it.

(() => {
  const player = document.querySelector('.player');
  if (!player) return;
  const video = player.querySelector('.player-video');
  const toggle = player.querySelector('.player-toggle');
  const close = player.querySelector('.player-close');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLOSE_TIME = 650; // ms to shrink back into the selfie, see .player in the CSS

  let open = false;
  let closing = 0;

  const play = () => video.play().catch(() => {});
  const playPause = () => (video.paused ? play() : video.pause());

  document.addEventListener('player-open', (e) => {
    if (open) return;
    open = true;
    clearTimeout(closing);
    play(); // right away, while the click still lets it play with sound
    player.hidden = false;
    void player.offsetWidth; // flush styles so it opens out from the selfie
    player.classList.add('is-open');
    if (e.detail?.viaKeyboard) toggle.focus({ preventScroll: true });
  });

  function shut() {
    if (!open) return;
    open = false;
    video.pause();
    player.classList.remove('is-open');
    closing = setTimeout(() => {
      player.hidden = true;
      document.dispatchEvent(new Event('player-close')); // the photos unfold again
    }, reduced ? 0 : CLOSE_TIME);
  }

  // the button shows what it will do
  function sync() {
    const playing = !video.paused && !video.ended;
    player.classList.toggle('is-playing', playing);
    toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  toggle.addEventListener('click', playPause);
  video.addEventListener('click', playPause);
  close.addEventListener('click', shut);
  for (const type of ['play', 'pause', 'ended']) video.addEventListener(type, sync);

  addEventListener('keydown', (e) => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') shut();
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) playPause(); // a focused button handles its own
    else return;
    e.preventDefault();
  });
})();
