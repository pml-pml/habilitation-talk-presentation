/*
 * Trzy animacje obrazu siatki przez automorfizmy dysku (model Möbiusa).
 * Ten moduł jest niezależny od js/animations.js, aby teksty można było
 * zmieniać lokalnie bez ingerencji w silnik animacji.
 *
 * Eliptyczny: pełny, płynny obrót co 16 s, bez przerwy między cyklami.
 * Paraboliczny i hiperboliczny: postęp trwa data-duration-seconds slajdu,
 * po czym zostaje ostatnia klatka. Brzegowe punkty stałe są osiągane tylko
 * asymptotycznie — animacja kończy się przed nimi.
 */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const TYPES = new Set(['elliptic', 'parabolic', 'hyperbolic']);
  const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const print = new URLSearchParams(location.search).has('print-pdf');
  const TAU = 2 * Math.PI;
  const cx = 280, cy = 265, R = 204;
  const z = (re, im = 0) => ({re, im});
  const add = (a, b) => z(a.re + b.re, a.im + b.im);
  const sub = (a, b) => z(a.re - b.re, a.im - b.im);
  const mul = (a, b) => z(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const conj = a => z(a.re, -a.im);
  const div = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return z((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  };
  const one = z(1);
  const fixedElliptic = z(-0.19, 0.16);
  const tau = (w, a) => div(add(w, a), add(one, mul(conj(a), w)));
  const tauInv = (w, a) => div(sub(w, a), sub(one, mul(conj(a), w)));
  const cayley = w => div(add(one, w), sub(one, w));
  const cayleyInv = w => div(sub(w, one), add(w, one));

  // Każda transformacja jest dokładnym automorfizmem dysku, a nie
  // ręcznie interpolowanym przesunięciem rysunku.
  function transform(type, w, phase) {
    if (type === 'elliptic') {
      const angle = TAU * phase;
      return tau(mul(tauInv(w, fixedElliptic), z(Math.cos(angle), Math.sin(angle))), fixedElliptic);
    }
    if (type === 'parabolic') {
      // Re C(z) jest zachowana, ruch w półpłaszczyźnie jest translacją i*s.
      // Parametryzacja dba o widoczny ruch przez pełne 75 s.
      const rest = 1 - 0.984 * phase;
      const s = 2 * Math.sqrt(1 / (rest * rest) - 1);
      return cayleyInv(add(cayley(w), z(0, s)));
    }
    // q=tanh(s/2), więc (z+q)/(1+qz) jest grupą hiperboliczną.
    // Parametryzacja utrzymuje ruch aż do końca przewidzianych 90 s.
    const q = 0.995 * phase;
    return div(add(w, z(q)), add(one, mul(z(q), w)));
  }

  const pixel = w => [cx + R * w.re, cy - R * w.im];
  const fmt = v => (Math.round(v * 100) / 100).toString();
  function node(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    if (parent) parent.appendChild(el);
    return el;
  }
  function path(points, fn) {
    return points.map((w, i) => {
      const [x, y] = pixel(fn(w));
      return (i ? 'L' : 'M') + fmt(x) + ' ' + fmt(y);
    }).join(' ');
  }
  const circles = [.21, .38, .55, .72, .87].map(r => ({
    kind: 'circle',
    points: Array.from({length: 121}, (_, i) => z(r * Math.cos(TAU * i / 120), r * Math.sin(TAU * i / 120)))
  }));
  const rays = Array.from({length: 12}, (_, j) => ({
    kind: j === 0 ? 'accent' : 'ray',
    points: Array.from({length: 66}, (_, i) => {
      const r = .006 + (.91 - .006) * i / 65;
      return z(r * Math.cos(TAU * j / 12), r * Math.sin(TAU * j / 12));
    })
  }));
  const grid = [...circles, ...rays];
  const seeds = {elliptic: z(.52, -.23), parabolic: z(-.36, .09), hyperbolic: z(-.46, .16)};
  const descriptions = {
    elliptic: 'Eliptyczny automorfizm obraca siatkę wokół punktu stałego wewnątrz dysku',
    parabolic: 'Paraboliczny automorfizm zagęszcza siatkę w pobliżu jedynego brzegowego punktu stałego 1',
    hyperbolic: 'Hiperboliczny automorfizm przesuwa siatkę od odpychającego punktu -1 ku przyciągającemu 1'
  };
  const captions = {elliptic: 'ELIPTYCZNY', parabolic: 'PARABOLICZNY', hyperbolic: 'HIPERBOLICZNY'};
  const instances = [];

  function create(figure) {
    const type = figure.dataset.diskAutomorphism;
    if (!TYPES.has(type) || figure.dataset.diskInitialized) return null;
    figure.dataset.diskInitialized = 'true';
    figure.classList.add('disk-auto-figure');
    const section = figure.closest('.reveal .slides > section');
    const duration = Math.max(10, Number(section?.dataset.durationSeconds) || 75);
    const period = 16;

    const frame = document.createElement('div');
    frame.className = 'disk-auto-frame';
    const picture = node('svg', {
      viewBox: '0 0 560 540', role: 'img', class: 'disk-auto-svg',
      'aria-label': descriptions[type], 'data-type': type
    });
    frame.appendChild(picture);
    const caption = document.createElement('div');
    caption.className = 'disk-auto-meta';
    const kind = document.createElement('span');
    kind.className = 'disk-auto-kind';
    kind.textContent = captions[type];
    const time = document.createElement('span');
    time.className = 'disk-auto-time';
    time.setAttribute('aria-live', 'off');
    caption.append(kind, time);
    const bar = document.createElement('div');
    bar.className = 'disk-auto-track';
    const fill = document.createElement('div');
    fill.className = 'disk-auto-fill';
    bar.appendChild(fill);
    figure.append(frame, caption, bar);

    node('circle', {cx, cy, r: R, fill: '#fcfbf7', stroke: '#254765', 'stroke-width': 2.6}, picture);
    const ghost = node('g', {fill: 'none', 'stroke-linecap': 'round'}, picture);
    for (const line of grid) node('path', {d: path(line.points, w => w), class: 'disk-auto-ghost'}, ghost);
    const morph = node('g', {fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, picture);
    const paths = grid.map(line => ({
      points: line.points,
      element: node('path', {
        class: line.kind === 'accent' ? 'disk-auto-mainline' :
          line.kind === 'circle' ? 'disk-auto-circle' : 'disk-auto-ray'
      }, morph)
    }));
    const orbit = node('path', {class: 'disk-auto-orbit', fill: 'none'}, picture);
    const moving = node('circle', {r: 7.5, class: 'disk-auto-moving'}, picture);

    const marks = node('g', {}, picture);
    function mark(w, label, repelling = false) {
      const [x, y] = pixel(w);
      node('circle', {cx: x, cy: y, r: 10,
        class: 'disk-auto-fixed-halo' + (repelling ? ' disk-auto-repelling' : '')}, marks);
      node('circle', {cx: x, cy: y, r: 5.5,
        class: 'disk-auto-fixed' + (repelling ? ' disk-auto-repelling' : '')}, marks);
      const txt = node('text', {x: w.re === -1 ? x + 10 : x - 14,
        y: y - 16, class: 'disk-auto-label'}, marks);
      txt.textContent = label;
    }
    if (type === 'elliptic') mark(fixedElliptic, 'a');
    else {
      if (type === 'hyperbolic') mark(z(-1), '−1', true);
      mark(z(1), '1');
    }

    function render(phase, elapsed) {
      const p = type === 'elliptic' ? phase % 1 : Math.max(0, Math.min(1, phase));
      const fn = w => transform(type, w, p);
      for (const item of paths) item.element.setAttribute('d', path(item.points, fn));
      // Stała, zamknięta trajektoria w przypadku eliptycznym — bez skoku
      // na końcu obrotu. W pozostałych przypadkach trajektoria narasta.
      const tracePhase = type === 'elliptic' ? 1 : p;
      const trajectory = Array.from({length: 81}, (_, i) =>
        transform(type, seeds[type], tracePhase * i / 80));
      orbit.setAttribute('d', path(trajectory, w => w));
      const [mx, my] = pixel(fn(seeds[type]));
      moving.setAttribute('cx', fmt(mx));
      moving.setAttribute('cy', fmt(my));
      fill.style.width = (p * 100).toFixed(1) + '%';
      time.textContent = type === 'elliptic'
        ? 'obrót · ' + Math.round(p * 360) + '°'
        : Math.min(duration, Math.round(elapsed)) + ' / ' + duration + ' s';
      figure.dataset.diskProgress = p.toFixed(5);
    }

    figure.title = 'Kliknij, aby zatrzymać lub wznowić animację';
    figure.tabIndex = 0;
    render(type === 'elliptic' ? .2 : 0, 0);
    return {figure, section, type, duration, period, render, active: false, paused: false, elapsed: 0, last: null};
  }

  let raf = 0;
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function tick(stamp) {
    const active = instances.find(x => x.active);
    if (!active) { raf = 0; return; }
    if (active.last === null) active.last = stamp;
    const dt = Math.max(0, (stamp - active.last) / 1000);
    active.last = stamp;
    if (!active.paused && !document.hidden) active.elapsed += dt;
    const seconds = active.type === 'elliptic'
      ? active.elapsed % active.period : Math.min(active.duration, active.elapsed);
    const phase = active.type === 'elliptic'
      ? seconds / active.period : seconds / active.duration;
    active.render(phase, seconds);
    if (active.type !== 'elliptic' && seconds >= active.duration) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  function activate(slide) {
    stop();
    for (const inst of instances) {
      inst.active = inst.section === slide;
      inst.paused = false;
      inst.elapsed = 0;
      inst.last = null;
      inst.figure.classList.remove('disk-auto-paused');
      if (inst.active) inst.render(0, 0);
    }
    const active = instances.find(x => x.active);
    if (!active) return;
    if (reduceMotion || print) {
      const poster = active.type === 'elliptic' ? .3 : .8;
      active.render(poster, active.duration * poster);
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  function init() {
    for (const el of document.querySelectorAll('[data-disk-automorphism]')) {
      try {
        const inst = create(el);
        if (!inst) continue;
        instances.push(inst);
        function toggle() {
          if (!inst.active || reduceMotion || print) return;
          inst.paused = !inst.paused;
          inst.last = null;
          inst.figure.classList.toggle('disk-auto-paused', inst.paused);
          if (!inst.paused && !raf) raf = requestAnimationFrame(tick);
        }
        el.addEventListener('click', e => { e.stopPropagation(); toggle(); });
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }
        });
      } catch (error) { console.error('Siatka automorfizmu:', error); }
    }
    if (!instances.length) return;
    activate(window.Reveal.getCurrentSlide());
    window.Reveal.on('slidechanged', event => activate(event.currentSlide));
    window.addEventListener('keydown', event => {
      if (event.key === 'r' || event.key === 'R') activate(window.Reveal.getCurrentSlide());
    });
    document.addEventListener('visibilitychange', () => {
      for (const inst of instances) inst.last = null;
    });
    window.DiskAutomorphismGrids = {instances, transform};
  }
  if (window.Reveal) {
    if (window.Reveal.isReady?.()) init();
    else window.Reveal.on('ready', init);
  }
})();
