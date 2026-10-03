// One page: following a link between views changes the address without loading
// a new page, and the back button works as usual. The about view folds the photos
// away behind the selfie (js/coverflow.js), then the selfie shrinks and moves up
// to make room for the text below it.

(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isAbout = (path) => /^\/about\/?$/.test(path);
  const row = (type) => document.dispatchEvent(new CustomEvent(type, { detail: { by: 'about', selfie: true } }));

  let about = root.classList.contains('about-open'); // set in the page head, before the first paint
  let turn = 0; // which click the page is answering
  if (about) row('row-fold');

  // change the layout, letting the browser glide everything to its new place where it can
  function relayout(update) {
    if (reduced || !document.startViewTransition) {
      update();
      return Promise.resolve();
    }
    return document.startViewTransition(update).finished;
  }

  // (whatever the page wants by the time it runs, which may have changed since it was asked)
  const setLayout = () => root.classList.toggle('about-open', about);
  const once = (type) => new Promise((done) => document.addEventListener(type, done, { once: true }));

  async function show(toAbout) {
    if (toAbout === about) return;
    about = toAbout;
    const mine = ++turn;
    if (toAbout) {
      // the row glides back to the selfie and folds away behind it (and a video that's playing
      // closes into the selfie); once that's all done, everything moves
      const video = document.querySelector('.player');
      const steps = [once('row-folded')];
      if (video && !video.hidden) steps.push(once('player-closed'));
      Promise.all(steps).then(() => mine === turn && relayout(setLayout));
      row('row-fold');
      document.dispatchEvent(new Event('route'));
    } else {
      if (!root.classList.contains('about-open')) return row('row-unfold'); // it hadn't got there yet: just turn back
      await relayout(setLayout);
      if (!about) row('row-unfold'); // unless it went straight back to about
    }
  }

  function go(path) {
    if (path !== location.pathname) history.pushState(null, '', path);
    show(isAbout(path));
  }

  document.addEventListener('click', (e) => {
    if (about && e.target.closest('.hero')) return go('/'); // on the about view, the selfie leads back home
    const a = e.target.closest('a');
    if (!a || a.origin !== location.origin || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.pathname !== '/' && !isAbout(a.pathname)) return; // other pages still load as pages
    e.preventDefault();
    go(a.pathname);
  });

  addEventListener('popstate', () => show(isAbout(location.pathname)));
})();
