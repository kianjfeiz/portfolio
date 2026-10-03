// The videos: clicking a photo with a video when it's in focus (or Enter) folds the
// other photos away (js/coverflow.js) and the photo opens out into this little player,
// shaped like its video, which starts playing straight away. Space plays and pauses,
// Escape closes it, and it closes on its own when the page moves to another view
// (js/pages.js).

(() => {
  const player = document.querySelector('.player');
  if (!player) return;
  const video = player.querySelector('.player-video');
  const toggle = player.querySelector('.player-toggle');
  const close = player.querySelector('.player-close');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLOSE_TIME = 650; // ms to shrink back into the photo, see .player in the CSS

  let open = false;
  let photo = null; // the photo whose video is showing
  let timers = [];

  // with sound if the browser allows it, otherwise muted (a tap on the video turns it on)
  const play = () => video.play().catch(() => ((video.muted = true), video.play())).catch(() => {});
  const playPause = () => {
    video.muted = false;
    return video.paused ? play() : video.pause();
  };
  const row = (type) => document.dispatchEvent(new CustomEvent(type, { detail: { by: 'player' } }));

  document.addEventListener('photo-click', (e) => {
    if (open) return;
    open = true;
    timers.forEach(clearTimeout);
    photo = e.detail.photo;
    if (video.getAttribute('src') !== photo.dataset.video) video.src = photo.dataset.video; // a new one starts from the top
    video.setAttribute('aria-label', `Video: ${photo.alt}`);
    play(); // right away, while the click still lets it play with sound
    row('row-fold');
    // open out from the photo's shape to the video's; on a phone a tall video also grows
    // upward into the room above the photo, so it's big enough to watch
    const [w, h] = photo.dataset.videoRatio.split('/').map(Number);
    const room = (photo.getBoundingClientRect().bottom - 12) / photo.offsetHeight;
    const grow = w < h && matchMedia('(max-width: 700px)').matches ? Math.min(2.4, Math.max(1, room)) : 1;
    player.style.setProperty('--from', String(photo.offsetWidth / photo.offsetHeight));
    player.style.setProperty('--to', photo.dataset.videoRatio);
    player.style.setProperty('--grow', String(grow));
    player.hidden = false;
    void player.offsetWidth; // flush styles so it opens out from the photo
    player.classList.add('is-open');
    photo.classList.add('is-behind-player');
    if (e.detail.viaKeyboard) toggle.focus({ preventScroll: true });
  });

  function shut(now = false) {
    if (!open) return;
    open = false;
    video.pause();
    player.classList.remove('is-open');
    const back = () => photo.classList.remove('is-behind-player');
    const done = () => {
      player.hidden = true;
      row('row-unfold'); // the photos come back
    };
    if (now || reduced) {
      back();
      done();
    } else {
      timers = [setTimeout(back, 400), setTimeout(done, CLOSE_TIME)]; // the photo is back before the player fades
    }
  }

  // the button shows what it will do
  function sync() {
    const playing = !video.paused && !video.ended;
    player.classList.toggle('is-playing', playing);
    toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  toggle.addEventListener('click', playPause);
  video.addEventListener('click', playPause);
  close.addEventListener('click', () => shut());
  document.addEventListener('route', () => shut(true));
  for (const type of ['play', 'pause', 'ended']) video.addEventListener(type, sync);

  addEventListener('keydown', (e) => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') shut();
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) playPause(); // a focused button handles its own
    else return;
    e.preventDefault();
  });
})();
