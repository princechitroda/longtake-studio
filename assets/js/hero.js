/* ==========================================================================
   LONGTAKE STUDIO — hero

   Two jobs: assemble the headline character by character, and run the montage
   behind it.

   The montage is stills rather than video. Four simultaneous decodes behind a
   headline is precisely the cost this page cannot afford, and a still holds a
   slow drift better than a loop that visibly restarts.
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------- headline assembly */

  var title = document.querySelector('[data-hero-title]');
  if (title && !title.dataset.split) {
    var i = 0;

    // Walk the tree rather than flattening textContent: the red full stop and
    // the accent word are real elements and have to survive.
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.nodeValue.split('').forEach(function (ch) {
            if (ch === ' ') {
              // A wrapped space would collapse against an inline-block, so a
              // bare non-breaking space keeps the word gap honest.
              frag.appendChild(document.createTextNode(' '));
              i++;
              return;
            }
            var s = document.createElement('span');
            s.className = 'ch';
            s.style.setProperty('--i', i++);
            s.textContent = ch;
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && !child.classList.contains('ch')) {
          walk(child);
        }
      });
    }(title));

    title.dataset.split = '1';
  }

  /* ------------------------------------------------------------- montage */

  var plates = Array.prototype.slice.call(document.querySelectorAll('.hero__plate'));
  if (plates.length < 2 || reduce.matches) return;

  var idx = 0, timer = 0;

  function step() {
    plates[idx].classList.remove('is-on');
    idx = (idx + 1) % plates.length;
    var next = plates[idx];
    // Restart the drift: re-adding the class alone will not replay a running
    // animation, so drop it, force a reflow, then put it back.
    next.classList.remove('is-on');
    void next.offsetWidth;
    next.classList.add('is-on');
  }

  function start() {
    if (timer) return;
    plates[0].classList.add('is-on');
    timer = setInterval(step, 5200);
  }

  function stop() {
    clearInterval(timer);
    timer = 0;
  }

  // Nothing should be animating behind a hero that is off-screen or in a
  // background tab.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  var hero = document.querySelector('.hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }, { threshold: 0.05 }).observe(hero);
  } else {
    start();
  }
}());
