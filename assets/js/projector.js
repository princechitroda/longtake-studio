/* ==========================================================================
   LONGTAKE STUDIO — projector

   A WebGL backdrop for the whole page: a volumetric beam of light through
   haze, with dust caught in it. It is the apparatus of the thing the studio
   sells, so it belongs here in a way that a generic particle field would not.

   Written against raw WebGL rather than a library. The whole effect is one
   fullscreen quad and one fragment shader — two triangles — which is far
   cheaper than any scene graph and keeps the payload at a few KB.

   Bails out entirely on: no WebGL, reduced-motion, or a device that looks
   too weak to carry it. The page is designed to be complete without it.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('projector');
  if (!canvas) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Weak-device heuristic. Neither signal is reliable alone and both are
  // absent on Safari, so treat "unknown" as capable and let the frame-time
  // guard below catch anything that turns out not to be.
  var lowPower =
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

  if (reduce.matches || lowPower) return;

  var gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: false
  });
  if (!gl) return;

  /* ---------------------------------------------------------------- shaders */

  var VERT = [
    'attribute vec2 p;',
    'void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform float u_scroll;',   // 0..1 through the document
    'uniform vec2  u_ptr;        // -1..1, eased pointer',
    'uniform float u_fade;       // master opacity, eased in after load',

    // --- hash / value noise -------------------------------------------------
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',

    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',           // smoothstep
    '  return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),',
    '             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);',
    '}',

    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }',
    '  return v;',
    '}',

    // Distance from point to a ray, used to shape the beam.
    'float rayDist(vec2 pt, vec2 o, vec2 d){',
    '  float t = max(dot(pt - o, d), 0.0);',
    '  return length(pt - (o + d * t));',
    '}',

    'void main(){',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;',   // aspect-correct, y in [-.5,.5]
    '  float t = u_time;',

    // The beam enters from off-frame upper-left and sweeps slowly. Scroll
    // rotates it a little further, so moving down the page feels like the
    // projector head is tracking with you.
    '  float ang = -0.62 + sin(t * 0.05) * 0.05 + u_scroll * 0.30 + u_ptr.x * 0.03;',
    '  vec2  dir = normalize(vec2(cos(ang), sin(ang)));',
    '  vec2  org = vec2(-1.15, 0.62) + u_ptr * 0.045;',

    '  float d = rayDist(uv, org, dir);',
    '  float along = dot(uv - org, dir);',

    // Haze density drifting along the beam axis: this is what makes it read
    // as light through air rather than a flat gradient.
    '  vec2  np = vec2(along * 1.7 - t * 0.16, d * 3.4 + sin(along * 0.7) * 0.35);',
    '  float haze = fbm(np);',

    // Cone: widens with distance from the origin, softened by the haze.
    '  float width = 0.035 + along * 0.062;',
    '  float beam  = exp(-pow(d / max(width, 0.001), 2.0));',
    '  beam *= smoothstep(0.0, 0.55, along);',            // ramp on after the lens
    '  beam *= 1.0 - smoothstep(1.1, 2.5, along);',       // fall off into the dark
    '  beam *= 0.55 + haze * 0.85;',

    // Dust: two drifting cells of sparse points, only visible where the beam
    // actually reaches them.
    '  float dust = 0.0;',
    '  for (int k = 0; k < 2; k++) {',
    '    float fk = float(k);',
    '    float sc = 26.0 + fk * 17.0;',
    '    vec2  q  = uv * sc;',
    '    q.y += t * (0.26 + fk * 0.20);',                  // slow fall
    '    q.x += sin(t * 0.20 + fk * 2.1 + uv.y * 3.0) * 0.7;',
    '    vec2  c  = floor(q);',
    '    vec2  f  = fract(q) - 0.5;',
    '    float h  = hash(c + fk * 37.0);',
    '    if (h > 0.9555) {',                                // sparse
    '      float m = 1.0 - smoothstep(0.0, 0.16 + h * 0.10, length(f));',
    '      dust += m * (0.5 + 0.5 * sin(t * 1.7 + h * 60.0));',  // slow twinkle
    '    }',
    '  }',
    '  float dustLit = dust * smoothstep(0.30, 0.02, d) * smoothstep(0.05, 0.7, along);',

    // Palette: warm bone light, with a faint tally-red bloom near the lens so
    // the brand colour is present without being a coloured wash.
    '  vec3 warm  = vec3(1.00, 0.955, 0.90);',
    '  vec3 tally = vec3(0.894, 0.204, 0.110);',

    '  float lens = exp(-pow(length(uv - (org + dir * 0.30)) * 2.6, 2.0));',

    '  vec3 col = vec3(0.0);',
    '  col += warm  * beam * 1.10;',
    '  col += tally * lens * 0.30;',
    '  col += warm  * dustLit * 1.60;',

    // Anamorphic streak — the horizontal flare a cine lens gives you.
    '  float streak = exp(-pow(abs(uv.y - (org.y + dir.y * 0.30)) * 34.0, 2.0))',
    '               * exp(-pow(abs(uv.x - (org.x + dir.x * 0.30)) * 1.05, 2.0));',
    '  col += vec3(0.55, 0.62, 0.80) * streak * 0.22;',

    // Keep the corners heavy so page copy always sits on something dark.
    '  float vig = 1.0 - smoothstep(0.35, 1.15, length(uv * vec2(0.92, 1.25)));',
    '  col *= 0.52 + 0.48 * vig;',

    // Soft ceiling. The page's own body copy sets a hard limit on how bright
    // anything behind it may get; this saturates smoothly toward that limit
    // instead of clipping, so the beam keeps its gradation and the dust keeps
    // its shape while never crossing the contrast budget.
    // Soft ceiling rather than a clip, so the beam keeps its gradation and the
    // dust keeps its shape. 0.17 over ink lands at rgb 61 — the brightest a
    // background may get while body copy on it still clears AA.
    '  col = vec3(0.11) * (1.0 - exp(-col * 4.5));',
    '  col *= u_fade;',

    // The canvas IS the page background, so paint the ink here and add light
    // to it. No alpha compositing means the result is exactly predictable.
    '  gl_FragColor = vec4(vec3(0.0706, 0.0667, 0.0627) + col, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------- compilation */

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // Never let a shader problem take the page down with it.
      if (window.console) console.warn('[projector] shader:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    if (window.console) console.warn('[projector] link:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);
  // The shaders are linked into the program now; the objects themselves are
  // no longer needed and would otherwise sit in driver memory for the session.
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {
    res:    gl.getUniformLocation(prog, 'u_res'),
    time:   gl.getUniformLocation(prog, 'u_time'),
    scroll: gl.getUniformLocation(prog, 'u_scroll'),
    ptr:    gl.getUniformLocation(prog, 'u_ptr'),
    fade:   gl.getUniformLocation(prog, 'u_fade')
  };

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  /* -------------------------------------------------------------- state loop */

  // A full-screen fragment shader is fill-rate bound, so resolution is the
  // single biggest cost lever. Cap hard and drop further on small screens.
  var dprCap = window.innerWidth < 820 ? 1.0 : 1.5;
  var scale = 1.0;                       // reduced by the frame-time guard
  var W = 0, H = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap) * scale;
    var w = Math.max(1, Math.floor(window.innerWidth * dpr));
    var h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(U.res, W, H);
  }

  var scroll = 0, ptrX = 0, ptrY = 0, tgtX = 0, tgtY = 0;
  var fade = 0, running = true, visible = true, raf = 0;
  var start = performance.now();

  function onScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scroll = Math.min(1, Math.max(0, (window.scrollY || window.pageYOffset) / max));
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize, { passive: true });

  // Pointer parallax, desktop only — on touch it would just fight the scroll.
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', function (e) {
      tgtX = (e.clientX / window.innerWidth) * 2 - 1;
      tgtY = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible && running && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // Frame-time guard: if we cannot hold a reasonable budget, step the
  // resolution down once, then switch off rather than jank the whole page.
  var slow = 0, last = performance.now(), degraded = 0;

  function frame(now) {
    raf = 0;
    if (!running || !visible) return;

    var dt = now - last; last = now;
    if (dt > 34) { slow++; } else if (slow > 0) { slow--; }

    if (slow > 90) {
      slow = 0;
      degraded++;
      if (degraded === 1)      { scale = 0.70; W = H = 0; resize(); }
      else if (degraded === 2) { scale = 0.50; W = H = 0; resize(); }
      else                     { stop(); return; }
    }

    ptrX += (tgtX - ptrX) * 0.045;
    ptrY += (tgtY - ptrY) * 0.045;
    fade = Math.min(1, fade + dt / 900);   // ~0.9s to full, independent of frame rate

    gl.uniform1f(U.time, (now - start) / 1000);
    gl.uniform1f(U.scroll, scroll);
    gl.uniform2f(U.ptr, ptrX, ptrY);
    gl.uniform1f(U.fade, fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    canvas.style.display = 'none';
    // Hand the GPU resources back rather than leaving them parked in VRAM.
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    var lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }

  // A lost context (tab backgrounded on mobile, GPU reset) otherwise leaves a
  // permanently black canvas sitting over the page.
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    canvas.style.display = 'none';
  });

  // Honour a mid-session switch to reduced motion.
  var onPref = function (e) { if (e.matches && running) stop(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onPref);
  else if (reduce.addListener) reduce.addListener(onPref);


  // Named 'begin', not 'start': `start` is already the animation epoch above,
  // and a var assignment would overwrite a same-named function declaration.
  function begin() {
    if (!running || raf) return;
    resize();
    onScroll();
    document.documentElement.classList.add('has-projector');
    start = last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Hold off while the leader is up: a fullscreen shader competing with the
  // countdown for frames makes the load feel slower than it is.
  if (document.getElementById('leader') &&
      !document.documentElement.classList.contains('is-revealed')) {
    document.addEventListener('leader:done', begin, { once: true });
    setTimeout(begin, 3600);                   // never depend on that event alone
  } else {
    begin();
  }
}());
