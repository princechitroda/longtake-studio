/* ==========================================================================
   LONGTAKE STUDIO — interaction layer

   Design intent: the page is one continuous take. Scroll is the playhead.
   The timecode in the header and the scrubber at the top of the viewport are
   both driven by scroll position, so the film metaphor is something you
   operate rather than something you read about.

   No dependencies. Every scroll/resize read is batched into a single
   rAF frame so the main thread stays free on mid-range phones.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ----------------------------------------------------------------------
     1. HERO LOAD SEQUENCE
     One class on <body> drives the whole staggered entrance from CSS, so
     the choreography lives with the styles instead of in setTimeout chains.
     ---------------------------------------------------------------------- */
  function startLoadSequence() {
    // Double rAF: guarantees the initial (hidden) state has been painted,
    // otherwise the browser may collapse both states into one frame and
    // the entrance never animates.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add('is-loaded');
      });
    });
  }

  if (document.fonts && document.fonts.ready) {
    // Wait for webfonts so the title doesn't animate in, then reflow when
    // Archivo swaps in. Capped so a slow font CDN can never hold the page.
    var fontsSettled = false;
    var go = function () {
      if (fontsSettled) return;
      fontsSettled = true;
      startLoadSequence();
    };
    document.fonts.ready.then(go);
    setTimeout(go, 900);
  } else {
    startLoadSequence();
  }

  /* ----------------------------------------------------------------------
     2. SCROLL REVEALS
     Elements carrying [data-reveal] fade up once. Siblings inside a
     [data-reveal-group] stagger, capped at 8 so the last item never lags.
     ---------------------------------------------------------------------- */
  var revealables = document.querySelectorAll('[data-reveal]');

  if (!('IntersectionObserver' in window)) {
    // Old browser: show everything rather than hiding content behind a
    // feature it doesn't have.
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target); // reveal once, then stop watching
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    // Assign stagger delays per group before observing
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal-group]'), function (group) {
      var kids = group.querySelectorAll('[data-reveal]');
      Array.prototype.forEach.call(kids, function (kid, i) {
        kid.style.setProperty('--reveal-delay', Math.min(i, 7) * 70 + 'ms');
      });
    });

    Array.prototype.forEach.call(revealables, function (el) { revealObserver.observe(el); });
  }

  /* ----------------------------------------------------------------------
     3. LAZY MEDIA
     Images and videos inside .frame fade over the slate placeholder only
     once they've actually decoded. If a file is missing the slate simply
     stays — a deliberate production artifact, not a broken-image icon.
     ---------------------------------------------------------------------- */
  function markReady(el) { el.classList.add('is-ready'); }

  Array.prototype.forEach.call(document.querySelectorAll('img.frame__media'), function (img) {
    if (img.complete && img.naturalWidth > 0) { markReady(img); return; }
    img.addEventListener('load', function () { markReady(img); });
    img.addEventListener('error', function () { img.remove(); }); // fall back to slate
  });

  var videoFrames = document.querySelectorAll('video.frame__media[data-src]');
  if (videoFrames.length && 'IntersectionObserver' in window) {
    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var v = entry.target;
        if (entry.isIntersecting) {
          if (!v.dataset.attached) {
            v.dataset.attached = '1';
            v.addEventListener('loadeddata', function () { markReady(v); });
            v.addEventListener('error', function () { v.remove(); });
            // Assigning .src runs the resource selection algorithm. Appending a
            // <source> child here would not: the element has already selected
            // (and found nothing), so a late child is ignored without a reload.
            v.src = v.dataset.src;
          }
          // play() is what actually starts the download. Under reduced motion we
          // deliberately skip it and let the poster image stand.
          if (!reduceMotion.matches) v.play().catch(function () { /* autoplay blocked; poster stands */ });
        } else if (!v.paused) {
          v.pause(); // don't decode video that's off-screen
        }
      });
    }, { threshold: 0.25 });
    Array.prototype.forEach.call(videoFrames, function (v) { videoObserver.observe(v); });
  }

  /* ----------------------------------------------------------------------
     4. THE PLAYHEAD — scrubber, timecode, header state
     All three read the same scroll value inside one rAF tick.
     ---------------------------------------------------------------------- */
  var header    = document.querySelector('.site-header');
  var fill      = document.querySelector('.scrubber__fill');
  var marksWrap = document.querySelector('.scrubber__marks');
  var tcOut     = document.querySelector('[data-timecode]');

  // Nominal runtime for this page, in seconds. Declared per page so a short
  // case study reads as a shorter take than the full reel.
  var runtime = parseInt(document.body.dataset.runtime, 10) || 210;
  var FPS = 24;

  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  var markers = [];

  function buildMarkers() {
    if (!marksWrap || !scenes.length) return;
    marksWrap.innerHTML = '';
    markers = scenes.map(function (section) {
      var mark = document.createElement('span');
      mark.className = 'scrubber__mark';
      marksWrap.appendChild(mark);
      return { el: mark, section: section };
    });
    positionMarkers();
  }

  function scrollableHeight() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function positionMarkers() {
    var max = scrollableHeight();
    markers.forEach(function (m) {
      var top = m.section.getBoundingClientRect().top + window.scrollY;
      // Clamp inside the rail so the first and last marks stay on screen
      var pct = Math.min(99.6, Math.max(0.4, (top / max) * 100));
      m.el.style.left = pct + '%';
    });
  }

  function pad(n, width) {
    var s = String(Math.floor(Math.abs(n)));
    while (s.length < (width || 2)) s = '0' + s;
    return s;
  }

  // progress (0–1) -> SMPTE-style HH:MM:SS:FF
  function formatTimecode(progress) {
    var total = progress * runtime;
    var h = total / 3600;
    var m = (total % 3600) / 60;
    var s = total % 60;
    var f = (total % 1) * FPS;
    return pad(h) + ':' + pad(m) + ':' + pad(s) + ':' + pad(f);
  }

  var ticking = false;
  var lastTc = '';

  function render() {
    ticking = false;

    var y = window.scrollY || window.pageYOffset;
    var progress = Math.min(1, Math.max(0, y / scrollableHeight()));

    if (fill) fill.style.width = (progress * 100).toFixed(3) + '%';

    if (tcOut) {
      var tc = formatTimecode(progress);
      if (tc !== lastTc) { tcOut.textContent = tc; lastTc = tc; } // avoid needless DOM writes
    }

    if (header) header.classList.toggle('is-stuck', y > 24);

    // Mark the scene the playhead is currently inside
    if (markers.length) {
      var mid = y + window.innerHeight * 0.35;
      var activeIndex = -1;
      markers.forEach(function (m, i) {
        var top = m.section.getBoundingClientRect().top + window.scrollY;
        if (top <= mid) activeIndex = i;
      });
      markers.forEach(function (m, i) {
        if (i === activeIndex) m.el.dataset.active = 'true';
        else delete m.el.dataset.active;
      });
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(render);
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { positionMarkers(); render(); }, 140);
  }, { passive: true });

  // Late-loading media changes document height, which moves every marker.
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function () { positionMarkers(); render(); });
    ro.observe(document.body);
  }

  buildMarkers();
  render();

  /* ----------------------------------------------------------------------
     5. MOBILE NAVIGATION
     ---------------------------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');

  if (toggle && nav) {
    var setNav = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.dataset.open = String(open);
      document.body.style.overflow = open ? 'hidden' : '';
    };

    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Close on link tap, on Escape, and whenever we grow past the breakpoint
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        toggle.focus();
      }
    });

    var desktop = window.matchMedia('(min-width: 861px)');
    var onBreakpoint = function (e) { if (e.matches) setNav(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
    else if (desktop.addListener) desktop.addListener(onBreakpoint);
  }
}());
