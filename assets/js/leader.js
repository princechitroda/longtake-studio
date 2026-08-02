/* ==========================================================================
   LONGTAKE STUDIO — the leader

   An Academy leader: the countdown that runs before a reel starts. It is the
   one loading screen this studio could justify, because it is the thing that
   literally precedes film.

   The markup is already in the page so it paints without a flash. This script
   only animates it and takes it away. The inline bootstrap in <head> is what
   reveals it, so a browser with JS off never sees it at all, and a failsafe
   there removes it if this file never arrives.
   ========================================================================== */
(function () {
  'use strict';

  var el = document.getElementById('leader');
  if (!el) return;

  var root      = document.documentElement;
  var sweep     = el.querySelector('.leader__sweep');
  var count     = el.querySelector('.leader__count');
  var pctOut    = el.querySelector('.leader__pct');
  var barFill   = el.querySelector('.leader__bar span');
  var reduce    = window.matchMedia('(prefers-reduced-motion: reduce)');

  var MIN_MS = 1100;      // let the countdown actually read as a countdown
  var MAX_MS = 3000;      // never hold the page hostage to a slow asset
  var t0 = performance.now();

  var target = 0.06, shown = 0, done = false, raf = 0;

  function bump(to) { target = Math.max(target, Math.min(1, to)); }

  /* --------------------------------------------------- real load signals */

  // Fonts matter most here: the hero is display type, and revealing before
  // they swap would show the fallback and then reflow in the user's face.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { bump(0.55); });
  } else {
    bump(0.55);
  }

  var heroImg = document.querySelector('.hero__bg img');
  if (heroImg) {
    if (heroImg.complete && heroImg.naturalWidth > 0) bump(0.75);
    else {
      heroImg.addEventListener('load',  function () { bump(0.75); });
      heroImg.addEventListener('error', function () { bump(0.75); });
    }
  } else {
    bump(0.75);
  }

  if (document.readyState === 'complete') bump(1);
  else window.addEventListener('load', function () { bump(1); }, { once: true });

  // Whatever happens above, the leader comes off at MAX_MS. This is a timer,
  // not a frame callback: on a weak device rAF can be starved badly enough
  // that a countdown driven purely by frames never reaches its exit check,
  // and a loading screen that outlives its own animation is a hang.
  setTimeout(function () { bump(1); }, MAX_MS - 400);
  setTimeout(finish, MAX_MS);

  /* -------------------------------------------------------------- dismiss */

  function finish() {
    if (done) return;
    done = true;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }

    el.classList.add('is-out');
    root.classList.remove('is-loading');
    root.classList.add('is-revealed');   // the hero sequence waits on this
    document.dispatchEvent(new CustomEvent('leader:done'));

    var remove = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    // transitionend can fail to fire if the element is off-screen; back it up.
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 1400);

    window.removeEventListener('keydown', onKey);
    el.removeEventListener('click', finish);
  }

  function onKey(e) {
    // Any deliberate keypress skips it — never make someone wait out a decoration.
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
  }

  window.addEventListener('keydown', onKey);
  el.addEventListener('click', finish);

  if (reduce.matches) { finish(); return; }

  /* ----------------------------------------------------------------- loop */

  function frame(now) {
    raf = 0;
    var elapsed = now - t0;

    // Ease toward whatever has actually loaded, so the bar never stalls dead
    // but also never claims progress it hasn't made.
    shown += (target - shown) * 0.14;

    var pct = Math.round(shown * 100);
    if (pctOut) pctOut.textContent = (pct < 10 ? '0' : '') + pct;
    if (barFill) barFill.style.transform = 'scaleX(' + shown.toFixed(4) + ')';

    // 5 → 1 as the reel counts in
    var n = Math.max(1, Math.min(5, Math.ceil((1 - shown) * 5)));
    if (count && count.textContent !== String(n)) count.textContent = String(n);

    // The sweep hand runs at a constant rate; it is a clock, not a gauge.
    if (sweep) sweep.style.transform = 'rotate(' + ((elapsed / 1000) * 360) + 'deg)';

    if (shown > 0.985 && elapsed > MIN_MS) { finish(); return; }
    if (elapsed > MAX_MS) { finish(); return; }

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
}());
