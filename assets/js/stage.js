/* ==========================================================================
   LONGTAKE STUDIO — the stage

   Depth on a project's opening: the evidence pinned around the running build
   drifts at different rates as you scroll, so the collage has layers rather
   than sitting on one plane.

   Cheap by construction — one passive scroll listener, one rAF, and a
   transform per card. It does nothing at all on narrow screens (where the
   cards are a plain grid), under reduced motion, or without JS.
   ========================================================================== */
(function () {
  'use strict';

  var stage = document.querySelector('[data-stage]');
  if (!stage) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var wide   = window.matchMedia('(min-width: 901px)');
  if (reduce.matches || !wide.matches) return;

  var layers = Array.prototype.slice.call(stage.querySelectorAll('[data-depth]'));
  if (!layers.length) return;

  // The video only starts once the stage is actually on screen, and stops
  // again when it is not — this page has a lot else to paint.
  var video = stage.querySelector('video[data-src]');
  if (video && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (!video.dataset.attached) {
            video.dataset.attached = '1';
            video.addEventListener('loadeddata', function () { video.classList.add('is-ready'); });
            video.addEventListener('error', function () { video.remove(); });
            video.src = video.dataset.src;
          }
          video.play().catch(function () { /* blocked; the still stands */ });
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { threshold: 0.2 }).observe(video);
  }

  var raf = 0;

  function apply() {
    raf = 0;
    var rect = stage.getBoundingClientRect();
    // -1 above the fold, 0 centred, 1 below — steady across viewport sizes.
    var p = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
    p = Math.max(-1.6, Math.min(1.6, p));

    for (var i = 0; i < layers.length; i++) {
      var el = layers[i];
      var d = parseFloat(el.dataset.depth) || 0;
      el.style.transform = 'translate3d(0,' + (p * d * -64).toFixed(2) + 'px,0)';
    }
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // If the viewport narrows past the breakpoint the cards become a grid and
  // these inline transforms would fight the layout, so clear them.
  var onWide = function (e) {
    if (!e.matches) {
      layers.forEach(function (el) { el.style.transform = ''; });
      window.removeEventListener('scroll', onScroll);
    }
  };
  if (wide.addEventListener) wide.addEventListener('change', onWide);
  else if (wide.addListener) wide.addListener(onWide);

  apply();
}());
