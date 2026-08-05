/* ==========================================================================
   LONGTAKE STUDIO — aperture

   The smooth-scroll-hero behaviour, ported to vanilla.

   The original maps scrollY through framer-motion's useTransform onto a
   clip-path polygon and a background-size. There is no build step here, so
   the same two values are read straight off scroll position and written as
   CSS. Identical curve, no React and no motion library.

   Also runs the layered-text row offsets, which are pure geometry and were
   the only thing that file needed JavaScript for.
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Touch/coarse pointers get the static hero: the scroll-driven clip window is
  // a landscape frame squeezed into a portrait slice on a phone, and 1500px of
  // scroll to open it is a chore. CSS lays out the static case as a full 16:9.
  var fine   = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ------------------------------------------------------------- aperture */

  var ap = document.querySelector('[data-aperture]');
  if (ap) (function () {
    var stage = ap.querySelector('.aperture__stage');
    var media = ap.querySelector('.aperture__media img, .aperture__media video');
    var cue   = ap.querySelector('.aperture__cue');
    var video = ap.querySelector('video[data-src]');

    // Matches the component's defaults: a 25%..75% window opening to 0..100,
    // over 1500px of scroll, with the media easing 170% -> 100%.
    var SCROLL_LEN = parseInt(ap.dataset.aperture, 10) || 1500;
    var FROM = 25, TO = 75;

    if (reduce.matches || !fine.matches) {
      // Open, static, no extra scroll height. CSS (has-aperture absent) frames
      // it as a full 16:9 band so the wordmark is never cropped.
      ap.style.height = '';
      // Someone asking for reduced motion is asking not to be shown a moving
      // picture; the poster is a real frame and says the same thing.
      if (video && reduce.matches) video.remove();
      else if (video) attach();
      return;
    }

    document.documentElement.classList.add('has-aperture');
    ap.style.height = 'calc(' + SCROLL_LEN + 'px + 100svh)';

    // A 1280 frame behind a 390px band is wasted bytes; phones get the light cut.
    function pickSrc() {
      var sm = video.dataset.srcSm;
      return (sm && window.matchMedia('(max-width: 860px)').matches) ? sm : video.dataset.src;
    }

    // The clip is a reveal — a blank slate becoming a finished site — so it must
    // start when the viewer can actually see it, not behind the leader.
    function whenRevealed(fn) {
      if (document.documentElement.classList.contains('is-revealed')) fn();
      else document.addEventListener('leader:done', fn, { once: true });
    }

    function attach() {
      if (!video || video.dataset.attached) return;
      video.dataset.attached = '1';
      video.addEventListener('loadeddata', function () { video.classList.add('is-ready'); });
      video.addEventListener('error', function () { video.remove(); });
      video.src = pickSrc();              // .src runs resource selection
      whenRevealed(function () {
        video.play().catch(function () { /* blocked; the poster stands */ });
      });
    }

    var raf = 0;

    function draw() {
      raf = 0;
      var y = window.scrollY || window.pageYOffset;
      var t = Math.min(1, Math.max(0, y / SCROLL_LEN));

      var a = FROM * (1 - t);              // 25 -> 0
      var b = TO + (100 - TO) * t;         // 75 -> 100

      stage.style.clipPath =
        'polygon(' + a.toFixed(2) + '% ' + a.toFixed(2) + '%, ' +
                     b.toFixed(2) + '% ' + a.toFixed(2) + '%, ' +
                     b.toFixed(2) + '% ' + b.toFixed(2) + '%, ' +
                     a.toFixed(2) + '% ' + b.toFixed(2) + '%)';

      if (media) {
        // The original animates background-size; this is a real element, so
        // scale is the equivalent and stays on the compositor.
        var s = 1.35 - 0.35 * Math.min(1, y / (SCROLL_LEN + 500));
        media.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(4) + ')';
      }

      if (cue) cue.style.opacity = String(Math.max(0, 1 - t * 2.2));
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(draw);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Only decode while the aperture is actually on screen.
    if ('IntersectionObserver' in window && video) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            attach();
            whenRevealed(function () {
              // Coming back to a finished take plays it again; coming back to a
              // paused one just resumes.
              if (video.ended) video.currentTime = 0;
              if (video.paused) video.play().catch(function () {});
            });
          } else if (!video.paused) {
            video.pause();
          }
        });
      }, { threshold: 0.05 }).observe(ap);
    } else {
      attach();
    }

    draw();
  }());

  /* ----------------------------------------------------- founder parallax */

  // The portrait drifts inside its clipped frame as the section crosses the
  // viewport. Decorative layer only — the copy beside it never moves, because
  // parallaxed body text is genuinely unpleasant to read.
  var fFrame = document.querySelector('.founder__frame');
  if (fFrame && !reduce.matches) (function () {
    var img = fFrame.querySelector('img');
    if (!img) return;

    var RANGE = 22;              // px; the image is scaled 1.07 so this never shows an edge
    var raf = 0;

    function draw() {
      raf = 0;
      var r = fFrame.getBoundingClientRect();
      var vh = window.innerHeight;
      if (r.bottom < -80 || r.top > vh + 80) return;   // offscreen: nothing to do

      // -1 above the fold .. +1 below it, 0 when centred
      var p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      p = Math.max(-1, Math.min(1, p));
      img.style.setProperty('--py', (-p * RANGE).toFixed(1) + 'px');
    }

    function onScroll() { if (!raf) raf = requestAnimationFrame(draw); }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    draw();
  }());

  /* --------------------------------------------------------- layered text */

  // Each row steps sideways from the centre so the stack shears into an
  // isometric solid. Pure geometry, so it is set once rather than animated.
  Array.prototype.forEach.call(document.querySelectorAll('[data-layered]'), function (list) {
    var rows = list.querySelectorAll('.layered__row');
    var centre = Math.floor(rows.length / 2);
    var step = parseFloat(getComputedStyle(list).getPropertyValue('--row-step')) || 35;

    Array.prototype.forEach.call(rows, function (row, i) {
      row.style.setProperty('--x', ((i - centre) * step) + 'px');
      Array.prototype.forEach.call(row.querySelectorAll('p'), function (p) {
        p.style.setProperty('--i', i);
      });
    });
  });
}());
