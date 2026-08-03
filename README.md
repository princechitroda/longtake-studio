# Longtake Studio

The studio site — [longtakestudio.com](https://longtakestudio.com)

Static HTML, CSS and vanilla JavaScript. No build step, no framework, no
package manager: what is in the repository is what ships. Deployed to GitHub
Pages by `.github/workflows/pages.yml` on every push to `main`.

## Layout

```
index.html              Home — leader, aperture hero, statement, reel, approach, services, contact
404.html                Branded not-found page
work/*.html             One page per project
assets/css/             The single stylesheet
assets/js/              One file per behaviour (see below)
assets/posters/         Video poster frames
assets/stills/          Case-study imagery
assets/social/          Open Graph share cards (1200×630)
assets/icons/           Favicon and app icons
videos/                 Full-size project videos
videos/reel/            Light 640px encodes for the homepage reel
```

### JavaScript

Each file owns one behaviour and degrades on its own:

| File | Does |
|---|---|
| `leader.js` | The Academy countdown, and taking it away |
| `projector.js` | The WebGL beam and dust behind everything |
| `longtake.js` | Playhead timecode, reveals, lazy media, mobile nav |
| `motion.js` | Split type, smooth scroll, tilt |
| `aperture.js` | Scroll-driven hero clip; layered-text geometry |
| `reel.js` | Vertical scroll → horizontal pan across the five projects |
| `stage.js` | Project-page collage parallax |

Everything has a fallback: no JS, `prefers-reduced-motion`, and touch each get
a simpler version rather than a broken one.

## Running it locally

No tooling needed — just serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` as a `file://` URL
mostly works, but `404.html` uses root-absolute paths and needs a server.

## Media

Videos are H.264 in an MP4 container, silent, with `+faststart` so they begin
playing before the whole file arrives. The hero ships twice — a 1280px cut for
desktop and a 720px cut phones get instead, chosen in `aperture.js`.

Re-encoding a source clip:

```bash
ffmpeg -i source.mov -an \
  -vf "scale=1280:720:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -crf 19 -preset slow \
  -movflags +faststart videos/out.mp4
```

Poster frames must match the video's first frame, or the still visibly jumps
when playback starts:

```bash
ffmpeg -i videos/out.mp4 -frames:v 1 -q:v 3 assets/posters/out.jpg
```

## Deployment

Pushing to `main` builds and publishes. The workflow copies `index.html`,
`404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `CNAME` and the
`assets/`, `work/` and `videos/` directories into `_site`.

### Custom domain

`CNAME` in the repository root is what binds `longtakestudio.com`. GitHub
rewrites it on every deploy, so it has to stay in the repo — deleting it sends
the site back to the `github.io` address.

DNS has to be pointed at GitHub separately, at the registrar:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `princechitroda.github.io.` |

Then in the repository: **Settings → Pages → Custom domain**, enter
`longtakestudio.com`, and once the check passes tick **Enforce HTTPS**. The
certificate can take up to an hour to issue; until it does, HTTPS will warn.

Absolute URLs in `<link rel="canonical">`, the Open Graph tags and
`sitemap.xml` all point at `longtakestudio.com`, so they are correct the
moment the domain resolves.
