// One page: following a link between views changes the address without loading
// a new page, and the back button works as usual. The about view folds the photos
// away behind the selfie (js/coverflow.js), then the selfie shrinks and moves up
// to make room for the text below it.

(() => {
  const root = document.documentElement;
  const FOLD_TIME = 900; // ms for the photos to fold away, see .deck-folding in the CSS
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isAbout = (path) => /^\/about\/?$/.test(path);
  const row = (type) => document.dispatchEvent(new CustomEvent(type, { detail: 'about' }));

  let about = root.classList.contains('about-open'); // set in the page head, before the first paint
  let waiting = 0;
  if (about) row('row-fold');

  // change the layout, letting the browser glide everything to its new place where it can
  function relayout(update) {
    if (reduced || !document.startViewTransition) {
      update();
      return Promise.resolve();
    }
    return document.startViewTransition(update).finished;
  }

  function setLayout(on) {
    document.dispatchEvent(new Event('route')); // the video closes
    root.classList.toggle('about-open', on);
  }

  async function show(toAbout) {
    if (toAbout === about) return;
    about = toAbout;
    clearTimeout(waiting);
    if (toAbout) {
      // fold the photos away first (unless they already are), then move
      const stillOut = root.classList.contains('deck-open');
      row('row-fold');
      waiting = setTimeout(() => relayout(() => setLayout(true)), stillOut && !reduced ? FOLD_TIME : 0);
    } else {
      await relayout(() => setLayout(false));
      if (!about) row('row-unfold'); // unless it went straight back to about
    }
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || a.origin !== location.origin || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.pathname !== '/' && !isAbout(a.pathname)) return; // other pages still load as pages
    e.preventDefault();
    if (a.pathname !== location.pathname) history.pushState(null, '', a.pathname);
    show(isAbout(a.pathname));
  });

  addEventListener('popstate', () => show(isAbout(location.pathname)));
})();
