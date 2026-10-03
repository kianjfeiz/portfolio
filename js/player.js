// The videos: clicking a photo with a video when it's in focus (or Enter) lays this
// little player over the photo, showing the photo itself. The other photos fold away
// (js/coverflow.js), the player opens out to the shape of the video, and the video
// starts and fades in over the photo. Space plays and pauses, Escape closes it, and it
// closes into the selfie when the page moves to another view (js/pages.js).

(() => {
  const player = document.querySelector('.player');
  if (!player) return;
  const video = player.querySelector('.player-video');
  const toggle = player.querySelector('.player-toggle');
  const close = player.querySelector('.player-close');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GROW_TIME = 450; // ms to open out to the video's shape, see .player.is-open in the CSS
  const CLOSE_TIME = 650; // ms to shrink back into the photo, see .player in the CSS

  let open = false;
  let photo = null; // the photo whose video is showing
  let opens = 0; // which time it was opened
  let timers = [];

  // with sound if the browser allows it, otherwise muted (a tap on the video turns it on);
  // if it was closed before it got going, it stays stopped
  const play = () =>
    video
      .play()
      .catch((e) => {
        if (e.name !== 'NotAllowedError' || !open) return;
        video.muted = true;
        return video.play();
      })
      .catch(() => {});
  const playPause = () => {
    if (!player.classList.contains('is-grown')) return; // not open yet, or closing
    video.muted = false;
    return video.paused ? play() : video.pause();
  };
  const row = (type, more) => document.dispatchEvent(new CustomEvent(type, { detail: { by: 'player', ...more } }));
  // the still the player shows while the video isn't: the photo it opens out of or closes into
  const still = (img) => player.style.setProperty('--still', `url("${img.currentSrc || img.src}")`);

  document.addEventListener('photo-click', (e) => {
    if (open) return;
    open = true;
    timers.forEach(clearTimeout);
    photo = e.detail.photo;
    if (video.getAttribute('src') !== photo.dataset.video) video.src = photo.dataset.video; // a new one starts from the top
    video.setAttribute('aria-label', `Video: ${photo.alt}`);
    // browsers only let it play with sound from a click, so start it now and hold it
    // (out of sight, behind the photo) until the player is open
    video.play().catch(() => {});
    video.pause();
    still(photo);
    // open out from the photo's shape to the video's; on a phone a tall video also grows
    // upward into the room above the photo, so it's big enough to watch
    const [w, h] = photo.dataset.videoRatio.split('/').map(Number);
    const room = (photo.getBoundingClientRect().bottom - 12) / photo.offsetHeight;
    const grow = w < h && matchMedia('(max-width: 700px)').matches ? Math.min(2.4, Math.max(1, room)) : 1;
    const shape = photo.offsetWidth / photo.offsetHeight;
    player.style.setProperty('--from', String(shape));
    player.style.setProperty('--to', photo.dataset.videoRatio);
    player.style.setProperty('--grow', String(grow));
    player.hidden = false;
    void player.offsetWidth; // flush styles so it fades in over the photo
    player.classList.add('is-open');
    photo.classList.add('is-behind-player');
    if (e.detail.viaKeyboard) toggle.focus({ preventScroll: true });
    // only once the other photos are folded away does it open out, so the two don't overlap
    const mine = ++opens;
    document.addEventListener('row-folded', () => {
      if (!open || mine !== opens) return;
      player.classList.add('is-grown');
      timers = [setTimeout(play, reduced ? 0 : GROW_TIME)];
    }, { once: true });
    row('row-fold');
  });

  function shut() {
    if (!open) return;
    open = false;
    timers.forEach(clearTimeout); // (it may not have started yet)
    video.pause();
    player.classList.remove('is-open', 'is-grown', 'is-rolling'); // fading back to the photo as it shrinks
    const back = () => photo.classList.remove('is-behind-player');
    const done = () => {
      player.hidden = true;
      row('row-unfold'); // the photos come back
      document.dispatchEvent(new Event('player-closed'));
    };
    if (reduced) {
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
  close.addEventListener('click', shut);
  // moving to another view: close into the selfie, which the row brings round behind the
  // player once it has folded (straight away if it already has)
  document.addEventListener('route', () => {
    if (!open) return;
    const intoSelfie = () => {
      const selfie = document.querySelector('.hero');
      player.style.setProperty('--from', String(selfie.offsetWidth / selfie.offsetHeight));
      still(selfie);
      shut();
    };
    if (player.classList.contains('is-grown')) return intoSelfie();
    const mine = ++opens; // (it won't open out now)
    document.addEventListener('row-folded', () => open && mine === opens && intoSelfie(), { once: true });
  });
  for (const type of ['play', 'pause', 'ended']) video.addEventListener(type, sync);
  // once it's open and really playing, the video fades in over the photo
  video.addEventListener('playing', () => player.classList.contains('is-grown') && player.classList.add('is-rolling'));

  addEventListener('keydown', (e) => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') shut();
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) playPause(); // a focused button handles its own
    else return;
    e.preventDefault();
  });
})();
