/* ==========================================================================
   LONGTAKE STUDIO — motion

   Three things:
     1. Split-word type reveals, so headings arrive as a camera move rather
        than a fade.
     2. A smooth-scroll system, on desktop pointers only.
     3. Parallax tilt on the work frames, so they sit in space.

   Every one of them is opt-out under prefers-reduced-motion, and none of them
   is load-bearing: with this file removed the page still reads and scrolls.
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ======================================================================
     1. SPLIT TYPE
     Words are wrapped in a mask so they can ride up into frame. The walker
     recurses through elements rather than flattening textContent, so inline
     markup — the red full stop, the accent word — survives intact.
     ====================================================================== */

  var SPLIT = [
    '.section-head h2', '.scene__title', '.case-hero h1',
    '.contact h2', '.next-take h2', '.approach__lead'
  ].join(',');

  function splitNode(node, out) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (child) {
      if (child.nodeType === 3) {                       // text
        var parts = child.nodeValue.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var mask  = document.createElement('span');
          var inner = document.createElement('span');
          mask.className = 'w';
          inner.className = 'w-i';
          inner.textContent = part;
          mask.appendChild(inner);
          frag.appendChild(mask);
          out.push(inner);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1 && !child.classList.contains('w')) {
        splitNode(child, out);                          // keep the element, split inside it
      }
    });
  }

  if (!reduce.matches) {
    Array.prototype.forEach.call(document.querySelectorAll(SPLIT), function (el) {
      if (el.dataset.split) return;
      var words = [];
      splitNode(el, words);
      if (!words.length) return;
      el.dataset.split = '1';
      words.forEach(function (w, i) {
        w.style.transitionDelay = Math.min(i, 14) * 42 + 'ms';
      });

      if (!('IntersectionObserver' in window)) { el.classList.add('type-in'); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('type-in');
          io.unobserve(e.target);
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
      io.observe(el);
    });
  }

  /* ======================================================================
     2. SMOOTH SCROLL

     Deliberately desktop-pointer only. Touch platforms already have momentum
     scrolling that feels better than anything re-implemented here, and taking
     over the scroller on iOS breaks more than it improves.

     Native scrolling stays the source of truth — this only eases toward the
     position, and any scroll it did not initiate resyncs it, so the scrollbar,
     find-in-page and keyboard all keep working.
     ====================================================================== */

  var smooth = null;

  function initSmooth() {
    if (reduce.matches || !finePointer.matches) return null;
    if (navigator.maxTouchPoints > 0 && !finePointer.matches) return null;

    var target = window.scrollY, current = target, raf = 0, wheeling = false;

    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }
    function clamp(v) { return Math.max(0, Math.min(maxScroll(), v)); }

    function loop() {
      raf = 0;
      var delta = target - current;
      if (Math.abs(delta) < 0.4) {
        current = target;
        window.scrollTo(0, current);
        wheeling = false;
        return;
      }
      current += delta * 0.115;              // the easing constant is the feel
      window.scrollTo(0, current);
      raf = requestAnimationFrame(loop);
    }

    function kick() { if (!raf) raf = requestAnimationFrame(loop); }

    window.addEventListener('wheel', function (e) {
      // Leave modified wheels alone: ctrl+wheel is zoom, shift+wheel is
      // horizontal, and anything inside its own scroller is not ours.
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      var node = e.target;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 2) {
          var cs = getComputedStyle(node).overflowY;
          if (cs === 'auto' || cs === 'scroll') return;
        }
        node = node.parentElement;
      }
      e.preventDefault();
      if (!wheeling) { current = window.scrollY; target = current; wheeling = true; }
      target = clamp(target + e.deltaY * (e.deltaMode === 1 ? 18 : 1));
      kick();
    }, { passive: false });

    // Anything we did not drive — scrollbar drag, keyboard, find-in-page,
    // anchor jumps — becomes the new truth.
    window.addEventListener('scroll', function () {
      if (!raf && !wheeling) { current = target = window.scrollY; }
    }, { passive: true });

    window.addEventListener('resize', function () { target = clamp(target); }, { passive: true });

    return {
      to: function (y) { target = clamp(y); current = window.scrollY; wheeling = true; kick(); },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; wheeling = false; }
    };
  }

  smooth = initSmooth();
  if (smooth) document.documentElement.classList.add('has-smooth');

  // Anchor links go through the easing too, so in-page jumps match the feel.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || !smooth) return;
    var id = a.getAttribute('href');
    if (!id || id === '#') return;
    var dest = document.querySelector(id);
    if (!dest) return;
    e.preventDefault();
    var head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 68;
    smooth.to(dest.getBoundingClientRect().top + window.scrollY - head - 24);
    // Keep the URL and focus behaviour a normal anchor would have given.
    history.pushState(null, '', id);
    dest.setAttribute('tabindex', '-1');
    dest.focus({ preventScroll: true });
  });

  /* ======================================================================
     3. FRAME TILT
     A small perspective shift toward the pointer. Enough to give the work
     frames a sense of being objects in space; not enough to be a gimmick.
     ====================================================================== */

  if (!reduce.matches && finePointer.matches) {
    Array.prototype.forEach.call(document.querySelectorAll('.frame'), function (frame) {
      var rect = null, raf = 0, rx = 0, ry = 0, tx = 0, ty = 0;

      function apply() {
        raf = 0;
        rx += (tx - rx) * 0.12;
        ry += (ty - ry) * 0.12;
        frame.style.transform =
          'perspective(1100px) rotateX(' + (-ry * 3.2).toFixed(3) + 'deg) rotateY(' +
          (rx * 3.8).toFixed(3) + 'deg) translateZ(0)';
        if (Math.abs(tx - rx) > 0.002 || Math.abs(ty - ry) > 0.002) raf = requestAnimationFrame(apply);
      }

      frame.addEventListener('pointerenter', function () { rect = frame.getBoundingClientRect(); });
      frame.addEventListener('pointermove', function (e) {
        if (!rect) rect = frame.getBoundingClientRect();
        tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      frame.addEventListener('pointerleave', function () {
        tx = ty = 0; rect = null;
        if (!raf) raf = requestAnimationFrame(apply);
      });
    });
  }
}());
