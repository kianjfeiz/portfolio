# portfolio

Plain HTML, CSS and a little JS. No build step, no dependencies.

## Structure

```
index.html            homepage
css/style.css         the one stylesheet
js/intro.js           opening: the photo starts full-bleed, then shrinks into place
js/coverflow.js       the looping Cover Flow row of photos around it
assets/img/           kian-{1200,2000,4000}.jpg (AI-upscaled with Upscayl)
assets/img/stack/     the other photos in the row (web-size, no metadata)
assets/cursor/        pixel-art cursors
work/, projects/      the two subpages
```

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## To do

1. Work and Projects pages
2. Polish: meta tags, favicon
3. Deploy
