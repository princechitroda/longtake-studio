/* ==========================================================================
   LONGTAKE STUDIO — the reel

   Five projects on one horizontal track, panned by vertical scroll.

   The page stays a genuinely tall, normally-scrolling document: the scrollbar
   is honest, the keyboard works, find-in-page works. All this does is map the
   scroll position of a tall section onto the track's X while that section is
   pinned. Nothing is hijacked.

   Falls back to an ordinary swipeable horizontal scroller on touch, without
   JS, and under reduced motion — the CSS already styles that case, so this
   file simply declines to take over.
   ========================================================================== */
(function () {
  'use strict';

  var reel = document.querySelector('[data-reel]');
  if (!reel) return;

  var sticky = reel.querySelector('.reel__sticky');
  var track  = reel.querySelector('.reel__track');
  var rail   = reel.querySelector('.reel__rail span');
  var slides = Array.prototype.slice.call(reel.querySelectorAll('.slide'));
  if (!sticky || !track || !slides.length) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine   = window.matchMedia('(hover: hover) and (pointer: fine)');
  var root   = document.documentElement;

  /* ------------------------------------------------------- caption letters */
  // Split titles per character so the caption can lift letter by letter.
  slides.forEach(function (slide) {
    var title = slide.querySelector('.slide__title');
    if (!title || title.dataset.split) return;
    var text = title.textContent;
    title.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var ch = document.createElement('span');
      ch.className = 'c';
      ch.style.setProperty('--i', i);
      // A plain space collapses inside an inline-block, so keep it non-breaking
      ch.textContent = text[i] === ' ' ? ' ' : text[i];
      title.appendChild(ch);
    }
    title.dataset.split = '1';
  });

  /* --------------------------------------------------------------- opt-out */
  // Touch gets the native swipeable scroller: momentum scrolling there already
  // beats anything mapped, and pinning fights the address-bar resize on iOS.
  if (reduce.matches || !fine.matches) return;

  root.classList.add('has-reel');

  /* ----------------------------------------------------------- scroll → X */

  var travel = 0;      // how far the track must move, in px
  var railW  = 0;

  function measure() {
    // Section height = one viewport to pin against, plus the track's overflow.
    travel = Math.max(0, track.scrollWidth - window.innerWidth);
    reel.style.height = (window.innerHeight + travel) + 'px';
    railW = travel;
    layout();
  }

  var hot = null;       // the slide under the pointer
  var lastX = null;

  function layout() {
    var rect = reel.getBoundingClientRect();
    var span = Math.max(1, reel.offsetHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, -rect.top / span));

    var x = -p * travel;
    if (x !== lastX) {
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      lastX = x;
    }
    if (rail) rail.style.transform = 'scaleX(' + p.toFixed(4) + ')';

    // Depth: each slide turns toward the middle of the screen and sits back a
    // little, so the row reads as one space rather than a strip of cards.
    var mid = window.innerWidth / 2;
    slides.forEach(function (slide) {
      var r  = slide.getBoundingClientRect();
      var c  = r.left + r.width / 2;
      var d  = (c - mid) / mid;                     // -1 .. 1 across the screen
      var dd = Math.max(-1.4, Math.min(1.4, d));
      var isHot = slide === hot;

      var rotY = isHot ? 0 : -dd * 7.5;
      var z    = isHot ? 90 : -Math.abs(dd) * 120;
      var s    = isHot ? 1.045 : 1;

      // perspective() per slide rather than a shared 3D context on the track:
      // preserve-3d there makes Chromium drop pointer events on the slides.
      slide.style.transform =
        'perspective(1500px) translate3d(0,0,' + z.toFixed(1) + 'px) rotateY(' +
        rotY.toFixed(2) + 'deg) scale(' + s + ')';

      // "near" is the centre-most slide; it brightens even without a pointer
      slide.classList.toggle('is-near', Math.abs(dd) < 0.45);
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; layout(); });
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(measure, 140);
  }, { passive: true });

  /* -------------------------------------------------------------- hover 3D */

  slides.forEach(function (slide) {
    var video = slide.querySelector('video[data-src]');

    slide.addEventListener('pointerenter', function () {
      hot = slide;
      slide.classList.add('is-hot');
      slide.style.transition = 'transform .55s var(--ease)';
      layout();

      if (!video) return;
      if (!video.dataset.attached) {
        video.dataset.attached = '1';
        video.addEventListener('loadeddata', function () { video.classList.add('is-ready'); });
        video.addEventListener('error', function () { video.remove(); });
        video.src = video.dataset.src;   // .src runs resource selection; a late <source> would not
      }
      video.play().catch(function () { /* autoplay refused; the still stands */ });
    });

    slide.addEventListener('pointerleave', function () {
      if (hot === slide) hot = null;
      slide.classList.remove('is-hot');
      layout();
      // Stop decoding once it is no longer the thing being looked at.
      if (video && !video.paused) video.pause();
    });

    // Keyboard parity: focusing the link should do what hovering does.
    var link = slide.querySelector('a');
    if (link) {
      link.addEventListener('focus', function () { slide.classList.add('is-hot'); hot = slide; layout(); });
      link.addEventListener('blur',  function () { slide.classList.remove('is-hot'); if (hot === slide) hot = null; layout(); });
    }
  });

  // Late-loading media changes the track width, which changes the whole map.
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function () { measure(); });
    ro.observe(track);
  }

  measure();
  onScroll();
}());
