# portfolio

Plain HTML, CSS and a little JS. No build step, no dependencies.

## Structure

```
index.html            the whole site: home and about are views of this one page
css/style.css         the one stylesheet
js/intro.js           opening: the photo starts full-bleed, then shrinks into place
js/coverflow.js       the looping Cover Flow row of photos around it
js/player.js          clicking the selfie folds the row away and plays the video
js/pages.js           moves between views without reloading (about: the selfie moves up, text below)
assets/img/           kian-{1200,2000,4000}.jpg (AI-upscaled with Upscayl)
assets/img/stack/     the other photos in the row (web-size, no metadata)
assets/video/         jackson.mp4 (720p H.264, ~1.8 Mbps, re-encoded for the web)
assets/cursor/        pixel-art cursors
assets/ui/            pixel-art player buttons
work/                 the work page (placeholder)
_redirects            serves index.html for /about/ (Netlify)
```

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening http://localhost:8000/about/ directly needs a
server that hands back index.html for it: the dev server in `.claude/launch.json` does.

## To do

1. Work page; the real about text
2. Polish: meta tags, favicon
3. Deploy
