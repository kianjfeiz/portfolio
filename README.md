# portfolio

Plain HTML, CSS and a little JS. No build step, no dependencies.

## Structure

```
index.html            homepage
css/style.css         the one stylesheet
js/intro.js           opening: the photo starts full-bleed, then shrinks into place
js/coverflow.js       the looping Cover Flow row of photos around it
js/player.js          clicking the selfie folds the row away and plays the video
assets/img/           kian-{1200,2000,4000}.jpg (AI-upscaled with Upscayl)
assets/img/stack/     the other photos in the row (web-size, no metadata)
assets/video/         jackson.mp4 (720p H.264, ~1.8 Mbps, re-encoded for the web)
assets/cursor/        pixel-art cursors
assets/ui/            pixel-art player buttons
work/, about/         the two subpages
```

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## To do

1. Work and About pages
2. Polish: meta tags, favicon
3. Deploy
