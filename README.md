# portfolio

Plain HTML + CSS + a little JS. No build step, no dependencies.

## Structure

```
index.html            homepage: photo opens full-bleed then shrinks into a frame (js/intro.js)
js/intro.js           the opening animation
work/index.html       /work/
projects/index.html   /projects/
css/style.css         single stylesheet
assets/img/           kian-{1200,2000,4000}.jpg (AI-upscaled from a 2000px source via Upscayl/high-fidelity-4x)
assets/fonts/         self-hosted serif (woff2)
```

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Video encoding

Keep the loop small (target 3–8 MB, 1080p, no audio). Raw footage (`*.mov`, `raw/`) is gitignored.

```bash
ffmpeg -i raw/source.mov -an -vf scale=1920:-2 -c:v libx264 -crf 26 -preset slow -movflags +faststart assets/video/loop.mp4
```

## Plan

1. ~~Repo scaffold~~
2. Homepage: video background, two links, typography
3. Work / Projects pages
4. Polish: responsive, reduced motion, meta tags, favicon
5. Deploy
