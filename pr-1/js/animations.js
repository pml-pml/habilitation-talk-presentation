/*
 * Animacje slajdów.
 *
 * Każdy element z atrybutem data-anim dostaje funkcję frame(t), gdzie t to czas
 * w sekundach od wejścia na slajd. Animacja działa tylko na bieżącym slajdzie;
 * klawisz R uruchamia ją od początku. Przy prefers-reduced-motion i w trybie
 * druku (?print-pdf) rysowana jest jedna klatka (poster).
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const PRINT = /print-pdf/i.test(window.location.search);
  const TAU = 2 * Math.PI;

  /* ---------------- narzędzia ---------------- */

  function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function set(e, attrs) { for (const k in attrs) e.setAttribute(k, attrs[k]); }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, s) => a + (b - a) * s;
  const ease = s => (s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2);
  const fmt = (x, d = 2) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ',');
  const f1 = x => x.toFixed(1);

  // Cykl: wzrost (up), postój (hold), powrót (down), przerwa (rest); wynik w [0,1].
  function sweep(t, up, hold, down, rest) {
    const T = up + hold + down + (rest || 0);
    let u = t % T;
    if (u < up) return ease(u / up);
    u -= up;
    if (u < hold) return 1;
    u -= hold;
    if (u < down) return 1 - ease(u / down);
    return 0;
  }

  function output(root, key) {
    const fig = root.closest('.figure') || root.parentElement;
    return fig ? fig.querySelector('[data-out="' + key + '"]') : null;
  }
  function setText(node, s) { if (node && node.textContent !== s) node.textContent = s; }

  // Tekst z indeksami: parts = [['λ'], ['n', 'sub'], ['(', ''], ['it', 'sup']].
  function rich(parent, x, y, parts, cls, extra) {
    const t = svg('text', Object.assign({ x, y, class: cls || 'mth' }, extra || {}), parent);
    let shift = 0;
    for (const [s, kind] of parts) {
      const sp = svg('tspan', {}, t);
      const want = kind === 'sub' ? 5 : kind === 'sup' ? -8 : 0;
      if (want !== shift) { sp.setAttribute('dy', want - shift); shift = want; }
      if (kind === 'sub' || kind === 'sup') sp.setAttribute('font-size', '0.72em');
      if (kind === 'up') sp.setAttribute('font-style', 'normal');
      sp.textContent = s;
    }
    return t;
  }

  function circlePath(cx, cy, r) {
    return 'M' + f1(cx - r) + ' ' + f1(cy) + 'a' + f1(r) + ' ' + f1(r) + ' 0 1 0 ' + f1(2 * r) +
      ' 0a' + f1(r) + ' ' + f1(r) + ' 0 1 0 ' + f1(-2 * r) + ' 0Z';
  }

  // Sektor pierścienia; kąty matematyczne (oś y w górę), a1 < a2, a2 - a1 < π.
  function sectorPath(cx, cy, r1, r2, a1, a2) {
    const P = (r, a) => f1(cx + r * Math.cos(a)) + ' ' + f1(cy - r * Math.sin(a));
    return 'M' + P(r2, a1) + 'A' + f1(r2) + ' ' + f1(r2) + ' 0 0 0 ' + P(r2, a2) +
      'L' + P(r1, a2) + 'A' + f1(r1) + ' ' + f1(r1) + ' 0 0 1 ' + P(r1, a1) + 'Z';
  }

  // Deterministyczny generator liczb pseudolosowych (ten sam rysunek przy każdym pokazie).
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Liczby zespolone jako pary [re, im].
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const cabs = a => Math.hypot(a[0], a[1]);

  // Oś pozioma z podziałką -π, 0, π.
  function piAxis(root, x0, x1, y) {
    svg('path', { d: 'M' + x0 + ' ' + y + 'H' + x1, class: 'axis' }, root);
    const xm = (x0 + x1) / 2;
    [[x0, '−π'], [xm, '0'], [x1, 'π']].forEach(([x, s]) => {
      svg('path', { d: 'M' + x + ' ' + y + 'v6', class: 'axis' }, root);
      const t = svg('text', { x, y: y + 24, class: 'lbl', 'text-anchor': 'middle' }, root);
      t.textContent = s;
    });
  }

  const factories = {};

  /* ---------------- slajd 2: prace i zagadnienia ---------------- */

  factories['overview-links'] = function (root) {
    const box = root;
    const links = box.querySelector('svg.links');
    const papers = box.querySelector('.papers');
    // Linie biegną kolejno od pracy do tematu; t0 — początek, dur — czas jednej linii.
    const t0 = 0.9, dur = 1.8, gap = 1.2;
    // Półkola między tematami, od kropek, do których dochodzą linie: [od, do, promień poziomy].
    // Operatory Carlesona → wagowe operatory złożenia; przestrzenie Hardy’ego → wagowe operatory złożenia.
    const ARCS = [[0, 1, 44], [2, 1, 44]];
    let items = [];
    const firstLink = new Map();
    function layout() {
      if (!box.offsetWidth) return;
      firstLink.clear();
      while (links.firstChild) links.removeChild(links.firstChild);
      set(links, { viewBox: '0 0 ' + box.offsetWidth + ' ' + box.offsetHeight });
      const x1 = papers.offsetLeft + papers.offsetWidth + 6;
      items = [];
      let k = 0;
      box.querySelectorAll('.topics li').forEach(li => {
        const x2 = li.offsetLeft - 6;
        const y2 = li.offsetTop + li.offsetHeight / 2;
        li.dataset.papers.split(/\s+/).forEach(n => {
          const p = box.querySelector('.papers li[data-paper="' + n + '"]');
          if (!p) return;
          const y1 = p.offsetTop + p.offsetHeight / 2;
          const cx = (x2 - x1) * 0.5;
          const d = 'M' + f1(x1) + ' ' + f1(y1) + 'C' + f1(x1 + cx) + ' ' + f1(y1) + ' ' +
            f1(x2 - cx) + ' ' + f1(y2) + ' ' + f1(x2) + ' ' + f1(y2);
          svg('circle', { cx: f1(x1), cy: f1(y1), r: 4, class: 'anchor' }, links);
          const path = svg('path', { d }, links);
          const len = path.getTotalLength();
          set(path, { 'stroke-dasharray': f1(len) + ' ' + f1(len + 10), 'stroke-dashoffset': f1(len) });
          const end = svg('circle', { cx: f1(x2), cy: f1(y2), r: 5, class: 'anchor-end', opacity: 0 }, links);
          const halo = svg('circle', { r: 13, class: 'runner-halo', opacity: 0 }, links);
          const dot = svg('circle', { r: 6.5, class: 'runner', opacity: 0 }, links);
          const it = { path, len, end, halo, dot, paper: p, topic: li, start: t0 + gap * k++ };
          items.push(it);
          if (!firstLink.has(li) || firstLink.get(li).start > it.start) firstLink.set(li, it);
        });
      });
      // Półkola po lewej stronie kafelków; rysują się po liniach.
      const tl = box.querySelectorAll('.topics li');
      const arcStart = t0 + gap * (k - 1) + dur + 0.5;
      ARCS.forEach(([a, b, rx], j) => {
        const A = tl[a], B = tl[b];
        if (!A || !B) return;
        const xa = A.offsetLeft - 6, xb = B.offsetLeft - 6;
        const ya = A.offsetTop + A.offsetHeight / 2, yb = B.offsetTop + B.offsetHeight / 2;
        const ry = Math.abs(yb - ya) / 2;
        const sweep = yb > ya ? 0 : 1;
        const d = 'M' + f1(xa) + ' ' + f1(ya) + 'A' + f1(rx) + ' ' + f1(ry) + ' 0 0 ' + sweep + ' ' + f1(xb) + ' ' + f1(yb);
        const path = svg('path', { d, class: 'arc' }, links);
        const len = path.getTotalLength();
        set(path, { 'stroke-dasharray': f1(len) + ' ' + f1(len + 10), 'stroke-dashoffset': f1(len) });
        const end = svg('circle', { cx: f1(xb), cy: f1(yb), r: 5, class: 'anchor-end', opacity: 0 }, links);
        const halo = svg('circle', { r: 13, class: 'runner-halo', opacity: 0 }, links);
        const dot = svg('circle', { r: 6.5, class: 'runner', opacity: 0 }, links);
        items.push({ path, len, end, halo, dot, start: arcStart + gap * j });
      });
    }
    function frame(t) {
      if (!items.length) layout();
      const reached = new Set(), active = new Set();
      for (const it of items) {
        const u = clamp((t - it.start) / dur);
        const s = (1 - Math.cos(Math.PI * u)) / 2;
        it.path.setAttribute('stroke-dashoffset', f1(it.len * (1 - s)));
        const q = it.path.getPointAtLength(it.len * s);
        const vis = u > 0 && u < 1 ? 1 : 0;
        set(it.dot, { cx: f1(q.x), cy: f1(q.y), opacity: vis });
        set(it.halo, { cx: f1(q.x), cy: f1(q.y), opacity: vis });
        it.end.setAttribute('opacity', u >= 1 ? 1 : 0);
        if (it.paper && u > 0 && u < 1) active.add(it.paper);
        if (it.topic && u >= 1) reached.add(it.topic);
      }
      box.querySelectorAll('.papers li').forEach(li => li.classList.toggle('is-active', active.has(li)));
      box.querySelectorAll('.topics li').forEach(li => li.classList.toggle('is-reached', reached.has(li)));
      // Kafelek tematu wyłania się, gdy zbliża się do niego pierwsza linia.
      for (const [li, first] of firstLink) {
        const u = clamp((t - first.start) / dur);
        const s = ease(clamp((u - 0.15) / 0.85));
        li.style.opacity = f1(s * 100) / 100;
        li.style.transform = s >= 1 ? '' : 'translateX(' + f1((1 - s) * 28) + 'px) scale(' + (0.96 + 0.04 * s).toFixed(3) + ')';
      }
    }
    return {
      poster: 60,
      start() { layout(); },
      frame,
      relayout() { layout(); }
    };
  };

  /* ---------------- slajd 3: przestrzeń HX ---------------- */

  factories['hx-radial'] = function (root) {
    const cx = 150, cy = 165, R = 128;
    const gx0 = 330, gx1 = 585, gy0 = 282, gyTop = 46, vmax = 4;
    const X = t => gx0 + (t + Math.PI) / TAU * (gx1 - gx0);
    const Y = v => gy0 - Math.min(v, vmax) / vmax * (gy0 - gyTop);
    const absf = (r, t) => Math.pow(1 - 2 * r * Math.cos(t) + r * r, -1 / 6);

    svg('circle', { cx, cy, r: R, class: 'disk-fill' }, root);
    [0.25, 0.5, 0.75].forEach(s => svg('circle', { cx, cy, r: R * s, class: 'grid-line' }, root));
    svg('circle', { cx, cy, r: R, class: 'ink-line' }, root);
    const ring = svg('circle', { cx, cy, r: R / 2, class: 'gold-line thick' }, root);
    svg('circle', { cx: cx + R, cy, r: 5, class: 'dot-slate' }, root);
    rich(root, cx + R + 9, cy + 6, [['1', 'up']]);
    const rl = rich(root, cx + 6, cy - 8, [['r']]);
    const radius = svg('path', { class: 'cursor-line' }, root);
    const pt = svg('circle', { r: 6, class: 'dot-ink' }, root);
    rich(root, cx - R + 4, cy - R + 12, [['𝔻', 'up']], 'mth');

    piAxis(root, gx0, gx1, gy0);
    svg('path', { d: 'M' + gx0 + ' ' + gy0 + 'V' + (gyTop - 10), class: 'axis' }, root);
    rich(root, gx0 + 8, gyTop - 14, [['|f(re'], ['it', 'sup'], [')|', '']]);
    function curve(r) {
      let d = '';
      for (let k = 0; k <= 260; k++) {
        const t = -Math.PI + TAU * k / 260;
        d += (k ? 'L' : 'M') + f1(X(t)) + ' ' + f1(Y(absf(r, t)));
      }
      return d;
    }
    [0.4, 0.65, 0.85, 0.95].forEach(r => svg('path', { d: curve(r), class: 'ghost-line' }, root));
    const area = svg('path', { class: 'soft-area' }, root);
    const line = svg('path', { class: 'gold-line thick' }, root);
    const cursor = svg('path', { class: 'cursor-line' }, root);
    const cdot = svg('circle', { r: 5, class: 'dot-ink' }, root);

    function norm2(r) {
      let s = 0; const N = 900;
      for (let k = 0; k < N; k++) { const v = absf(r, -Math.PI + TAU * (k + 0.5) / N); s += v * v; }
      return Math.sqrt(s / N);
    }
    const oR = output(root, 'r'), oN = output(root, 'norm');
    let lastR = -1, lastNorm = 0;

    return {
      poster: 6.5,
      frame(t) {
        const r = 0.2 + 0.78 * sweep(t, 6.5, 1.8, 1.6, 0.4);
        const tc = -Math.PI + TAU * ((t % 5) / 5);
        ring.setAttribute('r', f1(R * r));
        const px = cx + R * r * Math.cos(tc), py = cy - R * r * Math.sin(tc);
        set(pt, { cx: f1(px), cy: f1(py) });
        set(radius, { d: 'M' + cx + ' ' + cy + 'L' + f1(px) + ' ' + f1(py) });
        set(rl, { x: f1(cx + 0.5 * R * r * Math.cos(tc) + 6), y: f1(cy - 0.5 * R * r * Math.sin(tc) - 6) });
        if (Math.abs(r - lastR) > 1e-4) {
          const c = curve(r);
          line.setAttribute('d', c);
          area.setAttribute('d', c + 'L' + gx1 + ' ' + gy0 + 'L' + gx0 + ' ' + gy0 + 'Z');
          lastNorm = norm2(r); lastR = r;
        }
        const yv = Y(absf(r, tc));
        set(cursor, { d: 'M' + f1(X(tc)) + ' ' + gy0 + 'V' + f1(yv) });
        set(cdot, { cx: f1(X(tc)), cy: f1(yv) });
        setText(oR, fmt(r));
        setText(oN, fmt(lastNorm, 3));
      }
    };
  };

  /* ---------------- slajd 4: ciąg interpolacyjny ---------------- */

  factories['carleson-zoom'] = function (root) {
    // λ_n = 1 − 2^{−n}, n ⩾ 1; d_n = 1 − λ_n = 2^{−n}. Dyski {z : ρ(z, λ_n) < r}.
    const r = 0.15, NMAX = 32, KMAX = 12;
    const pts = [];
    for (let n = 1; n <= NMAX; n++) {
      const d = Math.pow(2, -n), a = 1 - d, q = 1 - r * r * a * a;
      // Środek dysku 1 − dc, promień rad (euklidesowo).
      pts.push({ n, d, a, dc: d * (1 + r * r * a) / q, rad: r * d * (2 - d) / q });
    }
    const rho = (x, y) => Math.abs(x - y) / (1 - x * y);
    const delta = k => pts.reduce((p, q) => (q.n === k ? p : p * rho(q.a, 1 - Math.pow(2, -k))), 1);
    const deltas = pts.map(p => delta(p.n));
    const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const sci = x => {
      if (x >= 1e-3) return fmt(x, 5);
      const e = Math.floor(Math.log10(x)), m = x / Math.pow(10, e);
      return fmt(m, 2) + '·10' + String(e).split('').map(c => SUP[c]).join('');
    };

    const cx = 150, cy = 165, R = 128;
    const PX0 = 330, PW = 256, PY0 = 26, PH = 278, PYc = PY0 + PH / 2, X1 = PX0 + 0.9 * PW;
    const NS_ = { 'vector-effect': 'non-scaling-stroke' };
    const diskSt = 'fill:rgba(65,107,134,.08);stroke:var(--slate);stroke-width:1.2';
    const goldSt = 'fill:none;stroke:var(--gold);stroke-width:1.8';

    // Lewy panel: cały dysk (skala stała, współrzędne płaszczyzny przez transform).
    const left = svg('g', { transform: 'matrix(' + R + ' 0 0 ' + (-R) + ' ' + cx + ' ' + cy + ')' }, root);
    svg('circle', Object.assign({ cx: 0, cy: 0, r: 1, style: 'fill:#fff;fill-opacity:.75;stroke:var(--ink);stroke-width:2.2' }, NS_), left);
    svg('path', Object.assign({ d: 'M-1 0H1.2', class: 'grid-line', style: 'stroke-dasharray:none' }, NS_), left);
    const lDisks = svg('g', { opacity: 0 }, left);
    pts.forEach(p => svg('circle', Object.assign({ cx: 1 - p.dc, cy: 0, r: p.rad, style: diskSt }, NS_), lDisks));
    const lDots = pts.map(p => svg('path', Object.assign({ d: 'M' + p.a + ' 0h0', style: 'stroke:var(--slate);stroke-linecap:round;stroke-width:6', opacity: 0 }, NS_), left));
    const lGD = [0, 1].map(() => svg('circle', Object.assign({ cy: 0, style: goldSt, opacity: 0 }, NS_), left));
    const lGold = svg('path', Object.assign({ style: 'stroke:var(--gold);stroke-linecap:round;stroke-width:10', opacity: 0 }, NS_), left);
    rich(root, cx + R + 6, cy + 20, [['1', 'up']], 'lbl');
    rich(root, cx - 4, cy + 20, [['0', 'up']], 'lbl', { 'text-anchor': 'end' });
    svg('circle', { cx, cy, r: 2.5, style: 'fill:var(--ink)' }, root);

    // Okno powiększenia na lewym rysunku i linie do prawego panelu.
    const win = svg('rect', { style: 'fill:var(--gold);fill-opacity:.1;stroke:var(--gold);stroke-width:1.6' }, root);
    const c1 = svg('path', { class: 'cursor-line' }, root);
    const c2 = svg('path', { class: 'cursor-line' }, root);

    // Prawy panel: otoczenie punktu 1, rysowane w pikselach (duże powiększenia).
    const clip = svg('clipPath', { id: 'clip-carleson-zoom' }, svg('defs', {}, root));
    svg('rect', { x: PX0, y: PY0, width: PW, height: PH, rx: 6 }, clip);
    svg('rect', { x: PX0, y: PY0, width: PW, height: PH, rx: 6, style: 'fill:#fbf8f2;stroke:var(--ink);stroke-opacity:.25;stroke-width:1.2' }, root);
    const right = svg('g', { 'clip-path': 'url(#clip-carleson-zoom)' }, root);
    const inside = svg('path', { style: 'fill:#fff;fill-opacity:.75;stroke:none' }, right);
    svg('path', { d: 'M' + (PX0 - 2) + ' ' + PYc + 'H' + (PX0 + PW + 2), class: 'grid-line', style: 'stroke-dasharray:none' }, right);
    const arc = svg('path', { style: 'fill:none;stroke:var(--ink);stroke-width:2.2' }, right);
    const rDisks = svg('g', { opacity: 0 }, right);
    const rD = pts.map(() => svg('circle', { cy: PYc, style: diskSt }, rDisks));
    const rDots = pts.map(() => svg('circle', { cy: PYc, r: 4, style: 'fill:var(--slate)', opacity: 0 }, right));
    const rGD = [0, 1].map(() => svg('circle', { cy: PYc, style: goldSt, opacity: 0 }, right));
    const rGold = svg('circle', { cy: PYc, r: 6.5, style: 'fill:var(--gold)', opacity: 0 }, right);
    const zl = svg('text', { x: PX0 + 10, y: PY0 + 22, class: 'lbl' }, root);
    const lab = rich(root, 0, PYc - 14, [['λ'], ['1', 'sub']], 'mth', { 'text-anchor': 'middle' });
    const labSub = lab.lastChild;
    rich(root, X1 + 6, PYc + 20, [['1', 'up']], 'lbl');

    const oK = output(root, 'k'), oE = output(root, 'e'), oR = output(root, 'r'), oD = output(root, 'd');

    const tDots = 0.4, dStep = 0.4, nFirst = 8, tDisk = tDots + nFirst * dStep + 0.3, tZoom = tDisk + 1.3, dZoom = 12;
    const PHASE = tZoom + dZoom + 3, depth = KMAX - 1;
    let manual = null, last = { u: 0 };

    // Okno: d = 1 − Re z ∈ [−0,2 w, 1,8 w], skala s px na jednostkę; X(d) = X1 − s·d.
    const zoomAt = u => depth * ease(clamp((u - tZoom) / dZoom));
    const view = zs => { const w = 0.5 * Math.pow(2, -zs); return { w, s: PW / (2 * w) }; };
    const X = (V, d) => X1 - V.s * d;

    function draw(t) {
      const u = manual ? manual.u : t % PHASE;
      const fade = Math.min(clamp(u / 0.4), u > PHASE - 0.6 ? (PHASE - u) / 0.6 : 1);
      const zs = zoomAt(u), V = view(zs);
      setText(zl, '×' + Math.round(Math.pow(2, zs)).toLocaleString('pl-PL'));

      // Brzeg dysku w oknie: d = 1 − √(1 − y²) = y²/(1 + √(1 − y²)).
      let pa = '';
      for (let j = 0; j <= 48; j++) {
        const Y = PY0 - 4 + (PH + 8) * j / 48, y = (PYc - Y) / V.s;
        const d = y * y / (1 + Math.sqrt(Math.max(0, 1 - y * y)));
        pa += (j ? 'L' : 'M') + f1(Math.max(PX0 - 50, X(V, d))) + ' ' + f1(Y);
      }
      arc.setAttribute('d', pa);
      inside.setAttribute('d', pa + 'L' + (PX0 - 50) + ' ' + (PY0 + PH + 4) + 'L' + (PX0 - 50) + ' ' + (PY0 - 4) + 'Z');

      const hh = V.w * PH / PW;
      const rx1 = cx + R * (1 + 0.2 * V.w), rw = Math.max(4, 2 * R * V.w), rh = Math.max(4, 2 * R * hh);
      set(win, { x: f1(rx1 - rw), y: f1(cy - rh / 2), width: f1(rw), height: f1(rh), opacity: fade.toFixed(2) });
      set(c1, { d: 'M' + f1(rx1) + ' ' + f1(cy - rh / 2) + 'L' + PX0 + ' ' + PY0, opacity: fade.toFixed(2) });
      set(c2, { d: 'M' + f1(rx1) + ' ' + f1(cy + rh / 2) + 'L' + PX0 + ' ' + (PY0 + PH), opacity: fade.toFixed(2) });

      // Wyróżniony punkt: najnowszy przy pojawianiu się, potem najbliższy środka okna (d = 0,8 w).
      const shownN = clamp(Math.floor((u - tDots) / dStep) + 1, 0, nFirst);
      let i;
      if (manual) i = manual.i;
      else if (u < tDisk) i = Math.max(0, shownN - 1);
      else i = clamp(Math.round(-Math.log2(0.8 * V.w)) - 1, 0, NMAX - 2);
      const p = pts[i];

      const rest = clamp((u - tDots - nFirst * dStep) / 0.5);
      const diskOn = clamp((u - tDisk) / 1);
      lDisks.setAttribute('opacity', (diskOn * fade).toFixed(3));
      rDisks.setAttribute('opacity', (diskOn * fade).toFixed(3));
      pts.forEach((q, j) => {
        const op = ((j < nFirst ? ease(clamp((u - tDots - j * dStep) / 0.3)) : rest) * fade).toFixed(3);
        lDots[j].setAttribute('opacity', op);
        const xd = X(V, q.d), xc = X(V, q.dc), rr = V.s * q.rad;
        const vis = xc + rr > PX0 - 5 && xc - rr < PX0 + PW + 5;
        rD[j].style.display = vis ? '' : 'none';
        if (vis) set(rD[j], { cx: f1(xc), r: f1(rr) });
        const dv = xd > PX0 - 6 && xd < PX0 + PW + 6;
        rDots[j].style.display = dv ? '' : 'none';
        if (dv) set(rDots[j], { cx: f1(xd), opacity: op });
      });

      const on = (u >= tDots ? fade : 0).toFixed(2);
      const dOn = (diskOn * fade).toFixed(2);
      set(lGold, { d: 'M' + p.a + ' 0h0', opacity: on });
      set(rGold, { cx: f1(X(V, p.d)), opacity: on });
      [0, 1].forEach(m => {
        const q = pts[i + m];
        set(lGD[m], { cx: 1 - q.dc, r: q.rad, opacity: dOn });
        set(rGD[m], { cx: f1(X(V, q.dc)), r: f1(V.s * q.rad), opacity: dOn });
      });
      const lx = X(V, p.d);
      setText(labSub, String(p.n));
      set(lab, { x: f1(lx - 4), opacity: lx > PX0 + 8 && lx < PX0 + PW - 8 ? on : 0 });
      setText(oK, String(p.n));
      setText(oE, sci(Math.pow(2, -p.n - 1)));
      setText(oR, fmt(1 / (3 - Math.pow(2, -p.n)), 3));
      setText(oD, fmt(deltas[i], 4));
      return { u };
    }

    return {
      poster: PHASE - 1,
      pausable: true,
      frame(t) { last = draw(t); },
      // Kliknięcie w punkt: wyróżnienie go (animacja się zatrzymuje).
      click(ev, t) {
        const pt = root.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        const q = pt.matrixTransform(root.getScreenCTM().inverse());
        const V = view(zoomAt(last.u));
        const inRight = q.x >= PX0 && q.x <= PX0 + PW;
        let best = -1, bd = 12;
        pts.forEach((p, j) => {
          if (j > NMAX - 2) return;
          const x = inRight ? X(V, p.d) : cx + R * p.a, y = inRight ? PYc : cy;
          const d = Math.hypot(q.x - x, q.y - y);
          if (d < bd) { bd = d; best = j; }
        });
        if (best < 0) return false;
        manual = { u: last.u, i: best };
        draw(t);
        return true;
      },
      resume() { manual = null; }
    };
  };

  /* ---------------- slajd 7: iteracje uC_φ ---------------- */

  factories['orbit-weight'] = function (root) {
    const cx = 165, cy = 165, R = 135, s = 0.45, N = 12;
    const phi = z => cdiv([z[0] + s, z[1]], [1 + s * z[0], s * z[1]]);
    const u = z => [0.75 + 0.5 * z[0], 0.5 * z[1]];
    const z0 = [-0.62, 0.5];
    const orbit = [z0];
    for (let k = 1; k < N; k++) orbit.push(phi(orbit[k - 1]));
    const gm = [];
    let logp = 0;
    for (let n = 1; n <= N; n++) { logp += Math.log(cabs(u(orbit[n - 1]))); gm.push(Math.exp(logp / n)); }

    const P = (z) => [cx + R * z[0], cy - R * z[1]];
    svg('circle', { cx, cy, r: R, class: 'disk-fill' }, root);
    // Łuk okręgu przez -1, 1 i z0: środek (0, k).
    const kc = (z0[0] * z0[0] + z0[1] * z0[1] - 1) / (2 * z0[1]);
    const rc = Math.sqrt(1 + kc * kc);
    let d = '';
    for (let j = 0; j <= 120; j++) {
      const a = lerp(Math.atan2(-kc, -1), Math.atan2(-kc, 1), j / 120);
      const q = P([rc * Math.cos(a), kc + rc * Math.sin(a)]);
      d += (j ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]);
    }
    svg('path', { d, class: 'grid-line' }, root);
    svg('path', { d: 'M' + (cx - R) + ' ' + cy + 'H' + (cx + R), class: 'grid-line' }, root);
    svg('circle', { cx, cy, r: R, class: 'ink-line' }, root);
    svg('circle', { cx: cx + R, cy, r: 7, class: 'dot-gold' }, root);
    svg('circle', { cx: cx - R, cy, r: 6, class: 'dot-slate' }, root);
    rich(root, cx + R + 10, cy + 6, [['a']]);
    rich(root, cx - R - 22, cy + 6, [['b']]);
    const pts = orbit.map((z, k) => {
      const q = P(z);
      return svg('circle', { cx: f1(q[0]), cy: f1(q[1]), r: k === 0 ? 6 : 4.6, class: 'dot-ink', opacity: 0 }, root);
    });
    const zl = rich(root, f1(P(z0)[0] - 8), f1(P(z0)[1] - 12), [['z']]);
    zl.setAttribute('text-anchor', 'end');

    // Wykres |u_(n)(z)|^{1/n}.
    const gx0 = 350, gx1 = 585, gy0 = 282, gyTop = 52, v0 = 0.3, v1 = 1.45;
    const GX = n => gx0 + (n - 1) / (N - 1) * (gx1 - gx0);
    const GY = v => gy0 - (v - v0) / (v1 - v0) * (gy0 - gyTop);
    svg('path', { d: 'M' + gx0 + ' ' + gy0 + 'H' + gx1, class: 'axis' }, root);
    svg('path', { d: 'M' + gx0 + ' ' + gy0 + 'V' + (gyTop - 8), class: 'axis' }, root);
    const yA = GY(1.25);
    svg('path', { d: 'M' + gx0 + ' ' + f1(yA) + 'H' + gx1, class: 'cursor-line' }, root);
    rich(root, gx1 - 2, yA - 9, [['|u(a)| = 1,25', 'up']], 'lbl', { 'text-anchor': 'end' });
    rich(root, gx0 + 8, gyTop - 14, [['|u'], ['(n)', 'sub'], ['(z)|', ''], ['1/n', 'sup']]);
    [1, 4, 8, 12].forEach(n => {
      const tt = svg('text', { x: GX(n), y: gy0 + 20, class: 'lbl', 'text-anchor': 'middle' }, root);
      tt.textContent = n;
    });
    const poly = svg('path', { class: 'gold-line' }, root);
    const gdots = gm.map((v, j) => svg('circle', { cx: f1(GX(j + 1)), cy: f1(GY(v)), r: 4, class: 'dot-ink', opacity: 0 }, root));

    const oN = output(root, 'n'), oG = output(root, 'g');
    const step = 0.75, T = N * step + 3.5;
    return {
      poster: T - 1,
      frame(t) {
        const w = t % T;
        const n = clamp(Math.floor(w / step) + 1, 1, N);
        const fade = w > T - 0.6 ? (T - w) / 0.6 : 1;
        pts.forEach((p, k) => {
          p.setAttribute('opacity', (k < n ? fade : 0).toFixed(2));
          p.setAttribute('class', k === n - 1 ? 'dot-gold' : 'dot-ink');
        });
        let dd = '';
        for (let j = 0; j < n; j++) dd += (j ? 'L' : 'M') + f1(GX(j + 1)) + ' ' + f1(GY(gm[j]));
        poly.setAttribute('d', dd);
        poly.setAttribute('opacity', fade.toFixed(2));
        gdots.forEach((g, j) => g.setAttribute('opacity', (j < n ? fade : 0).toFixed(2)));
        setText(oN, String(n));
        setText(oG, fmt(gm[n - 1], 3));
      }
    };
  };

  /* ---------------- slajd 9: widmo, przypadek paraboliczny ---------------- */

  factories['spectrum-parabolic'] = function (root) {
    const cx = 280, cy = 180, S = 92;
    svg('path', { d: 'M' + (cx - 250) + ' ' + cy + 'H' + (cx + 250) + 'M' + cx + ' ' + (cy - 170) + 'V' + (cy + 170), class: 'axis' }, root);
    rich(root, cx + 244, cy - 10, [['Re', 'up']], 'lbl', { 'text-anchor': 'end' });
    rich(root, cx + 8, cy - 156, [['Im', 'up']], 'lbl');
    svg('circle', { cx, cy, r: S, class: 'grid-line' }, root);
    rich(root, cx - S * 0.71 - 6, cy + S * 0.71 + 18, [['|λ| = 1', 'up']], 'lbl', { 'text-anchor': 'end' });
    const curve = svg('path', { class: 'slate-line', 'stroke-opacity': 0.75 }, root);
    const spec = svg('circle', { cx, cy, r: S, class: 'gold-line thick' }, root);
    const rad = svg('path', { class: 'cursor-line' }, root);
    const ua = svg('circle', { r: 7, class: 'dot-gold' }, root);
    const ual = rich(root, 0, 0, [['u(a)']]);
    const sl = rich(root, 0, 0, [['σ(uC'], ['φ', 'sub'], [')', '']], 'mth mth-gold');
    const cl = rich(root, 0, 0, [['u(𝕋)']], 'mth');
    cl.setAttribute('fill', '#416b86');
    const out = output(root, 'ua');
    const uf = (z, s) => {
      const z2 = cmul(z, z);
      const e = [0.45 * Math.cos(s), 0.45 * Math.sin(s)];
      const q = cmul(e, z2);
      return [1 - 0.2 * z[0] + q[0], -0.2 * z[1] + q[1]];
    };
    return {
      poster: 2.5,
      frame(t) {
        const s = TAU * t / 12;
        let d = '';
        for (let k = 0; k <= 240; k++) {
          const a = TAU * k / 240;
          const w = uf([Math.cos(a), Math.sin(a)], s);
          d += (k ? 'L' : 'M') + f1(cx + S * w[0]) + ' ' + f1(cy - S * w[1]);
        }
        curve.setAttribute('d', d + 'Z');
        const w = uf([1, 0], s);
        const m = cabs(w);
        spec.setAttribute('r', f1(S * m));
        const px = cx + S * w[0], py = cy - S * w[1];
        set(ua, { cx: f1(px), cy: f1(py) });
        set(rad, { d: 'M' + cx + ' ' + cy + 'L' + f1(px) + ' ' + f1(py) });
        set(ual, { x: f1(px + 10), y: f1(py - 10) });
        const ang = Math.atan2(w[1], w[0]) + Math.PI * 0.62;
        set(sl, { x: f1(cx + (S * m + 16) * Math.cos(ang)), y: f1(cy - (S * m + 16) * Math.sin(ang)),
          'text-anchor': Math.cos(ang) < 0 ? 'end' : 'start' });
        const w2 = uf([Math.cos(2.2), Math.sin(2.2)], s);
        set(cl, { x: f1(cx + S * w2[0] - 52), y: f1(cy - S * w2[1] + 4) });
        setText(out, fmt(m));
      }
    };
  };

  /* ---------------- slajd 10: widmo, przypadek hiperboliczny ---------------- */

  factories['spectrum-hyperbolic'] = function (root) {
    const cx = 280, cy = 205, S = 80;
    const s = 0.45;
    const dA = (1 - s) / (1 + s), dB = (1 + s) / (1 - s); // φ'(1), φ'(-1)
    const uA = 1, uB = 0.6;
    svg('path', { d: 'M' + (cx - 260) + ' ' + cy + 'H' + (cx + 260) + 'M' + cx + ' ' + (cy - 190) + 'V' + (cy + 160), class: 'axis' }, root);
    rich(root, cx + 254, cy - 10, [['Re', 'up']], 'lbl', { 'text-anchor': 'end' });
    rich(root, cx + 8, cy - 176, [['Im', 'up']], 'lbl');
    const ann = svg('path', { class: 'slate-area' }, root);
    const outer = svg('circle', { cx, cy, class: 'slate-line' }, root);
    const inner = svg('circle', { cx, cy, class: 'slate-line' }, root);
    svg('circle', { cx, cy, r: S * uA, class: 'gold-line', 'stroke-dasharray': '7 6' }, root);
    svg('circle', { cx, cy, r: S * uB, class: 'gold-line', 'stroke-dasharray': '7 6' }, root);
    // Podpisy promieni na osi rzeczywistej: H^{p,q} pod osią, B i D nad osią.
    const tickM = svg('path', { class: 'ink-line', 'stroke-width': 2 }, root);
    const tickP = svg('path', { class: 'ink-line', 'stroke-width': 2 }, root);
    const labM = rich(root, 0, 0, [['r'], ['−', 'sub']]);
    const labP = rich(root, 0, 0, [['r'], ['+', 'sub']]);
    // Legenda.
    svg('rect', { x: 18, y: 372, width: 26, height: 14, rx: 3, class: 'slate-area' }, root);
    rich(root, 52, 384, [['widmo na H', 'up'], ['p,q', 'sup']], 'lbl');
    svg('path', { d: 'M18 404h26', class: 'gold-line', 'stroke-dasharray': '7 6' }, root);
    rich(root, 52, 409, [['|u(b)| ⩽ |λ| ⩽ |u(a)|: pierścień dla ', 'up'], ['ℬ', 'up'], [' i ', 'up'], ['𝒟', 'up']], 'lbl');

    const oP = output(root, 'p'), oM = output(root, 'rm'), oR = output(root, 'rp');
    return {
      poster: 0,
      frame(t) {
        const w = 0.5 - 0.5 * Math.cos(TAU * t / 14);
        const p = Math.exp(lerp(Math.log(2), Math.log(9), w) * 1);
        const ra = uA / Math.pow(dA, 1 / p), rb = uB / Math.pow(dB, 1 / p);
        const rp = Math.max(ra, rb), rm = Math.min(ra, rb);
        set(outer, { r: f1(S * rp) });
        set(inner, { r: f1(S * rm) });
        ann.setAttribute('d', circlePath(cx, cy, S * rp) + circlePath(cx, cy, S * rm));
        set(tickM, { d: 'M' + f1(cx + S * rm) + ' ' + (cy - 6) + 'v12' });
        set(tickP, { d: 'M' + f1(cx + S * rp) + ' ' + (cy - 6) + 'v12' });
        set(labM, { x: f1(cx + S * rm - 8), y: cy + 28 });
        set(labP, { x: f1(cx + S * rp - 8), y: cy + 28 });
        setText(oP, fmt(p));
        setText(oM, fmt(rm));
        setText(oR, fmt(rp));
      }
    };
  };

  /* ---------------- slajd 11: porządkowa ograniczoność ---------------- */

  factories['order-bounded'] = function (root) {
    const cx = 150, cy = 165, R = 125;
    const gx0 = 335, gx1 = 585, gy0 = 282, gyTop = 52, vmax = 30;
    const X = t => gx0 + (t + Math.PI) / TAU * (gx1 - gx0);
    const Y = v => gy0 - Math.min(v, vmax) / vmax * (gy0 - gyTop);
    const g = (rho, t) => 1 / (1 - rho * Math.abs(Math.cos(t / 2)));

    svg('circle', { cx, cy, r: R, class: 'disk-fill' }, root);
    svg('circle', { cx, cy, r: R, class: 'ink-line' }, root);
    const img = svg('circle', { cy, class: 'gold-area' }, root);
    svg('circle', { cx: cx + R, cy, r: 5, class: 'dot-slate' }, root);
    rich(root, cx + R + 9, cy + 6, [['1', 'up']]);
    const il = rich(root, 0, 0, [['φ(𝔻)']], 'mth mth-gold');
    rich(root, cx - R + 4, cy - R + 12, [['𝔻', 'up']]);

    piAxis(root, gx0, gx1, gy0);
    svg('path', { d: 'M' + gx0 + ' ' + gy0 + 'V' + (gyTop - 10), class: 'axis' }, root);
    rich(root, gx0 + 8, gyTop - 14, [['(1 − |φ(e'], ['it', 'sup'], [')|)', ''], ['−1', 'sup']]);
    svg('path', { d: 'M' + (gx0 - 4) + ' ' + gyTop + 'h8', class: 'axis' }, root);
    const yl = svg('text', { x: gx0 - 8, y: gyTop + 5, class: 'lbl', 'text-anchor': 'end' }, root);
    yl.textContent = vmax;
    const area = svg('path', { class: 'soft-area' }, root);
    const line = svg('path', { class: 'gold-line thick' }, root);
    const clip = svg('path', { class: 'gold-line', 'stroke-width': 2 }, root);

    function integral(rho) {
      // (1/π)∫_0^π g dt, podstawienie t = π s², gęsto przy t = 0.
      const N = 3000; let sum = 0;
      for (let k = 0; k < N; k++) {
        const sv = (k + 0.5) / N;
        const t = Math.PI * sv * sv;
        sum += g(rho, t) * 2 * Math.PI * sv / N;
      }
      return sum / Math.PI;
    }
    const oRho = output(root, 'rho'), oInt = output(root, 'int');
    let last = -1, lastI = 0;
    return {
      poster: 5.5,
      frame(t) {
        const rho = 0.55 + 0.445 * sweep(t, 7, 1.8, 1.6, 0.6);
        set(img, { cx: f1(cx + R * rho / 2), r: f1(R * rho / 2) });
        set(il, { x: f1(cx + R * rho / 2 - 22), y: f1(cy + 6) });
        if (Math.abs(rho - last) > 1e-4) {
          let d = '';
          const K = 400;
          for (let k = 0; k <= K; k++) {
            const sv = -1 + 2 * k / K;
            const tt = Math.PI * sv * Math.abs(sv);
            d += (k ? 'L' : 'M') + f1(X(tt)) + ' ' + f1(Y(g(rho, tt)));
          }
          line.setAttribute('d', d);
          area.setAttribute('d', d + 'L' + gx1 + ' ' + gy0 + 'L' + gx0 + ' ' + gy0 + 'Z');
          const peak = g(rho, 0);
          clip.setAttribute('d', peak > vmax ? 'M' + f1(X(0) - 7) + ' ' + (gyTop - 2) + 'l7 -9l7 9' : '');
          lastI = integral(rho); last = rho;
        }
        setText(oRho, fmt(rho, 3));
        setText(oInt, fmt(lastI, 1));
      }
    };
  };

  /* ---------------- slajd 12: przesunięcie ---------------- */

  factories['shift-bars'] = function (root) {
    const x0 = 46, stepX = 44, base = 222, hmax = 160, slots = 13, bw = 28;
    const heights = [0.92, 0.55, 0.78, 0.36, 0.62, 0.27, 0.44, 0.2, 0.3, 0.13, 0.18, 0.09, 0.11];
    svg('path', { d: 'M' + (x0 - 24) + ' ' + base + 'H' + (x0 + (slots - 1) * stepX + 24), class: 'axis' }, root);
    for (let k = 0; k < slots; k++) {
      const tt = svg('text', { x: x0 + k * stepX, y: base + 24, class: 'lbl', 'text-anchor': 'middle' }, root);
      tt.textContent = k;
    }
    const zeros = [];
    for (let k = 0; k < 6; k++) zeros.push(svg('circle', { cx: x0 + k * stepX, cy: base - 6, r: 5, class: 'slate-line', 'stroke-width': 1.6, opacity: 0 }, root));
    const bars = heights.map((h, j) => {
      const b = svg('rect', { y: f1(base - hmax * h), width: bw, height: f1(hmax * h), rx: 3, class: 'bar' }, root);
      const lb = rich(root, 0, f1(base - hmax * h - 8), [['a'], [String(j), 'sub']], 'mth', { 'font-size': 15, 'text-anchor': 'middle' });
      return { b, lb };
    });
    rich(root, x0 - 14, 40, [['S'], ['k', 'sup'], ['f', '']]);
    svg('path', { d: 'M' + (x0 + 30) + ' 34h70', class: 'gold-line' }, root);
    svg('path', { d: 'M' + (x0 + 100) + ' 34l-9 -5v10z', fill: '#c39457' }, root);

    const oK = output(root, 'k');
    const per = 1.5, M = 5, T = (M + 1) * per + 1.2;
    return {
      poster: T - 1,
      frame(t) {
        const w = t % T;
        const m = Math.min(M, Math.floor(w / per));
        const fade = w > T - 0.5 ? (T - w) / 0.5 : 1;
        // Przesunięcie o m pozycji (m = 0,...,M), płynnie w pierwszej części kroku.
        const cur = m === 0 ? 0 : (m - 1) + ease(clamp((w - m * per) / 0.65));
        bars.forEach(({ b, lb }, j) => {
          const x = x0 + (j + cur) * stepX;
          const vis = j + cur <= slots - 1 + 0.01 ? 1 : clamp(1 - (j + cur - (slots - 1)) * 1.5);
          set(b, { x: f1(x - bw / 2), opacity: (vis * fade).toFixed(2) });
          set(lb, { x: f1(x), opacity: (vis * fade).toFixed(2) });
          b.setAttribute('class', j === 0 ? 'bar is-current' : 'bar');
        });
        zeros.forEach((z, k) => z.setAttribute('opacity', (k < Math.floor(cur + 0.5) ? fade : 0).toFixed(2)));
        setText(oK, String(Math.round(cur)));
      }
    };
  };

  /* ---------------- slajd 13: macierze B^n T S^n ---------------- */

  factories['toeplitz-matrix'] = function (root) {
    const N = 15, cell = 13, W = 6, zc = 15;
    const uco = [1, 0.6, 0.3];
    function polymul(a, b) {
      const r = new Array(Math.min(a.length + b.length - 1, N + 2)).fill(0);
      for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (i + j < r.length) r[i + j] += a[i] * b[j];
      return r;
    }
    // Macierz M_u: kolumna j to współczynniki u(z) z^j.
    const A = [], B = [];
    for (let i = 0; i < N; i++) { A.push(new Array(N).fill(0)); B.push(new Array(N).fill(0)); }
    for (let j = 0; j < N; j++) for (let k = 0; k < uco.length; k++) if (j + k < N) A[j + k][j] = uco[k];
    // Macierz uC_φ, φ(z) = (1+z)/2,5: kolumna j to współczynniki u·φ^j.
    let pw = [1];
    for (let j = 0; j < N; j++) {
      const col = polymul(uco, pw);
      for (let i = 0; i < N; i++) B[i][j] = col[i] || 0;
      pw = polymul(pw, [0.4, 0.4]);
    }
    const inten = v => Math.min(1, Math.sqrt(Math.abs(v)));

    function panel(M, ox, oy, zx, zy, title) {
      svg('rect', { x: ox - 1, y: oy - 1, width: N * cell + 2, height: N * cell + 2, class: 'cell-frame' }, root);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const v = inten(M[i][j]);
        if (v > 0.02) svg('rect', { x: ox + j * cell + 0.5, y: oy + i * cell + 0.5, width: cell - 1, height: cell - 1, rx: 2, class: 'cell', 'fill-opacity': (0.85 * v).toFixed(3) }, root);
      }
      title(ox, oy - 16);
      const win = svg('rect', { width: W * cell, height: W * cell, rx: 3, class: 'window' }, root);
      const c1 = svg('path', { class: 'cursor-line' }, root);
      const c2 = svg('path', { class: 'cursor-line' }, root);
      svg('rect', { x: zx - 1, y: zy - 1, width: W * zc + 2, height: W * zc + 2, rx: 4, fill: '#fff', stroke: '#c39457', 'stroke-width': 2 }, root);
      const zcells = [];
      for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) zcells.push(svg('rect', { x: zx + j * zc + 0.5, y: zy + i * zc + 0.5, width: zc - 1, height: zc - 1, rx: 2, class: 'cell', 'fill-opacity': 0 }, root));
      rich(root, zx, zy - 10, [['B'], ['n', 'sup'], ['TS', ''], ['n', 'sup']], 'mth', { 'font-size': 17 });
      return { M, ox, oy, zx, zy, win, c1, c2, zcells, lastN: -1 };
    }
    const P1 = panel(A, 18, 70, 228, 116, (x, y) => rich(root, x, y, [['T = M'], ['u', 'sub'], [',  φ = id', '']]));
    const P2 = panel(B, 346, 70, 556, 116, (x, y) => rich(root, x, y, [['T = uC'], ['φ', 'sub'], [',  ‖φ‖', ''], ['∞', 'sub'], [' < 1', '']]));

    const oN = output(root, 'n');
    const per = 1.1, nMax = N - W, T = nMax * per + 2.6;
    function update(P, n) {
      const x = P.ox + n * cell, y = P.oy + n * cell, s = W * cell;
      set(P.win, { x: f1(x), y: f1(y) });
      set(P.c1, { d: 'M' + f1(x + s) + ' ' + f1(y) + 'L' + P.zx + ' ' + P.zy });
      set(P.c2, { d: 'M' + f1(x + s) + ' ' + f1(y + s) + 'L' + P.zx + ' ' + (P.zy + W * zc) });
      const k = Math.round(n);
      if (k !== P.lastN) {
        for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) {
          const v = inten(P.M[i + k] ? P.M[i + k][j + k] || 0 : 0);
          P.zcells[i * W + j].setAttribute('fill-opacity', (0.85 * v).toFixed(3));
        }
        P.lastN = k;
      }
    }
    return {
      poster: T - 1.5,
      frame(t) {
        const w = t % T;
        const m = Math.floor(w / per);
        const n = m >= nMax ? nMax : m + ease(clamp((w - m * per) / 0.6));
        update(P1, n);
        update(P2, n);
        setText(oN, String(Math.round(n)));
      }
    };
  };

  /* ---------------- obszar kołowy (slajdy 14 i 15) ---------------- */

  const HOLES = [[-0.38, 0.28, 0.2], [0.36, 0.3, 0.16], [0.08, -0.45, 0.22]];

  function omegaPath(cx, cy, R, eps) {
    let d = circlePath(cx, cy, R * (1 - eps));
    for (const [a, b, r] of HOLES) d += circlePath(cx + R * a, cy - R * b, R * (r + eps));
    return d;
  }

  factories['circular-domain'] = function (root) {
    const cx = 172, cy = 170, R = 152, EMAX = 0.12;
    svg('path', { d: omegaPath(cx, cy, R, 0), class: 'omega-fill' }, root);
    const shade = svg('path', { class: 'soft-area', 'fill-rule': 'evenodd', opacity: 0 }, root);
    const ripples = [0, 1, 2, 3].map(() => svg('path', { class: 'slate-line', 'stroke-width': 1.4, fill: 'none' }, root));
    svg('path', { d: omegaPath(cx, cy, R, 0), class: 'ink-line', 'fill-rule': 'evenodd' }, root);
    const comps = [[0, 0, 1]].concat(HOLES);
    const hl = comps.map(([a, b, r]) => svg('circle', { cx: f1(cx + R * a), cy: f1(cy - R * b), r: f1(R * r), class: 'gold-line thick', opacity: 0 }, root));
    const gl = [[cx - R * 0.78, cy - R * 0.78], [cx + R * (-0.38) - 10, cy - R * 0.28 + 6], [cx + R * 0.36 - 10, cy - R * 0.3 + 6], [cx + R * 0.08 - 10, cy + R * 0.45 + 6]];
    const glabels = gl.map(([x, y], k) => rich(root, f1(x), f1(y), [['Γ', 'up'], [String(k), 'sub']]));

    // Prawa część: rozkład f.
    const tx = 360;
    const terms = [];
    const line = svg('text', { x: tx, y: 120, class: 'mth', 'font-size': 23 }, root);
    const add = (s, kind, idx) => {
      const sp = svg('tspan', {}, line);
      if (kind === 'sub') { sp.setAttribute('dy', 6); sp.setAttribute('font-size', '0.7em'); }
      if (kind === 'back') sp.setAttribute('dy', -6);
      sp.textContent = s;
      if (idx !== undefined) terms[idx] = (terms[idx] || []).concat(sp);
      return sp;
    };
    add('f = ', '');
    for (let k = 0; k < 4; k++) {
      add('f', '', k); add(String(k), 'sub', k); add(k < 3 ? ' + ' : '', 'back');
    }
    const memb = rich(root, tx, 170, [['f'], ['k', 'sub'], [' ∈ HX(E', ''], ['k', 'sub'], [')', '']], 'mth', { 'font-size': 20 });
    void memb;
    const ek = rich(root, tx, 215, [['E'], ['0', 'sub'], [' = 𝔻', 'up']], 'mth', { 'font-size': 18 });
    const ekAlt = svg('g', {}, root);
    rich(ekAlt, tx, 215, [['E'], ['k', 'sub'], [' — dopełnienie', 'up']], 'mth', { 'font-size': 18 });
    rich(ekAlt, tx, 240, [['domkniętego dysku', 'up']], 'mth', { 'font-size': 18 });
    const out = output(root, 'k');

    return {
      poster: 1.5,
      frame(t) {
        ripples.forEach((p, k) => {
          const ph = ((t / 6 + k / 4) % 1);
          const eps = EMAX * (1 - ph);
          p.setAttribute('d', omegaPath(cx, cy, R, eps));
          p.setAttribute('stroke-opacity', (0.6 * Math.sin(Math.PI * ph)).toFixed(3));
        });
        const per = 3.2;
        const k = Math.floor(t / per) % 4;
        const ph = (t % per) / per;
        const a = ph < 0.15 ? ph / 0.15 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
        hl.forEach((h, j) => h.setAttribute('opacity', j === k ? a.toFixed(2) : 0));
        if (k === 0) shade.setAttribute('d', circlePath(cx, cy, R));
        else {
          const [hx, hy, hr] = HOLES[k - 1];
          shade.setAttribute('d', circlePath(cx, cy, R * 1.1) + circlePath(cx + R * hx, cy - R * hy, R * hr));
        }
        shade.setAttribute('opacity', (0.9 * a).toFixed(2));
        terms.forEach((arr, j) => arr.forEach(sp => sp.setAttribute('fill', j === k ? '#9b6f35' : '#0d2846')));
        glabels.forEach((g, j) => g.setAttribute('fill', j === k ? '#9b6f35' : '#0d2846'));
        ek.setAttribute('opacity', k === 0 ? 1 : 0);
        ekAlt.setAttribute('opacity', k === 0 ? 0 : 1);
        setText(out, 'Γ' + '₀₁₂₃'[k]);
      }
    };
  };

  /* ---------------- slajd 15: okna Carlesona ---------------- */

  factories['carleson-windows'] = function (root) {
    const cx = 160, cy = 165, R = 140, dx = 462, dR = 112;
    svg('path', { d: omegaPath(cx, cy, R, 0), class: 'omega-fill' }, root);
    // Miara: punkty rozłożone w Ω (deterministycznie).
    const rand = rng(7);
    const dots = [];
    while (dots.length < 240) {
      const x = 2 * rand() - 1, y = 2 * rand() - 1;
      if (x * x + y * y >= 0.985) continue;
      if (HOLES.some(([a, b, r]) => (x - a) ** 2 + (y - b) ** 2 <= (r + 0.012) ** 2)) continue;
      dots.push({ x, y, e: svg('circle', { cx: f1(cx + R * x), cy: f1(cy - R * y), r: 1.7, class: 'dot-faint' }, root) });
    }
    svg('path', { d: omegaPath(cx, cy, R, 0), class: 'ink-line', 'fill-rule': 'evenodd' }, root);
    rich(root, cx - R + 2, cy - R + 14, [['Ω', 'up']]);
    const w0 = svg('path', { class: 'gold-area' }, root);
    const w1 = svg('path', { class: 'gold-area' }, root);
    const [hx, hy, hr] = HOLES[0];

    svg('circle', { cx: dx, cy, r: dR, class: 'disk-fill' }, root);
    svg('circle', { cx: dx, cy, r: dR, class: 'ink-line' }, root);
    rich(root, dx - dR + 2, cy - dR + 14, [['𝔻', 'up']]);
    const wd = svg('path', { class: 'gold-area' }, root);
    const link0 = svg('path', { class: 'cursor-line' }, root);
    const link1 = svg('path', { class: 'cursor-line' }, root);
    const l0 = rich(root, 0, 0, [['η'], ['0', 'sub']], 'mth mth-gold', { 'font-size': 17 });
    const l1 = rich(root, 0, 0, [['η'], ['1', 'sub']], 'mth mth-gold', { 'font-size': 17 });
    const oH = output(root, 'h');

    return {
      poster: 2,
      frame(t) {
        const h = 0.12 + 0.13 * (0.5 - 0.5 * Math.cos(TAU * t / 7));
        const al = 0.9 + 0.32 * t;
        w0.setAttribute('d', sectorPath(cx, cy, R * (1 - h), R, al - h, al + h));
        const hcx = cx + R * hx, hcy = cy - R * hy;
        w1.setAttribute('d', sectorPath(hcx, hcy, R * hr, R * hr / (1 - h), -al - h, -al + h));
        wd.setAttribute('d', sectorPath(dx, cy, dR * (1 - h), dR, al - h, al + h));
        // Łączniki od okna w 𝔻 do okien w Ω.
        const pd = [dx + dR * (1 - h / 2) * Math.cos(al), cy - dR * (1 - h / 2) * Math.sin(al)];
        const p0 = [cx + R * (1 - h / 2) * Math.cos(al), cy - R * (1 - h / 2) * Math.sin(al)];
        const rm = R * hr * (1 + h / 2);
        const p1 = [hcx + rm * Math.cos(-al), hcy - rm * Math.sin(-al)];
        const mid = (a, b, lift) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - lift];
        const m0 = mid(pd, p0, 60), m1 = mid(pd, p1, -40);
        link0.setAttribute('d', 'M' + f1(pd[0]) + ' ' + f1(pd[1]) + 'Q' + f1(m0[0]) + ' ' + f1(m0[1]) + ' ' + f1(p0[0]) + ' ' + f1(p0[1]));
        link1.setAttribute('d', 'M' + f1(pd[0]) + ' ' + f1(pd[1]) + 'Q' + f1(m1[0]) + ' ' + f1(m1[1]) + ' ' + f1(p1[0]) + ' ' + f1(p1[1]));
        set(l0, { x: f1((pd[0] + m0[0] * 2 + p0[0]) / 4), y: f1((pd[1] + m0[1] * 2 + p0[1]) / 4 - 6) });
        set(l1, { x: f1((pd[0] + m1[0] * 2 + p1[0]) / 4), y: f1((pd[1] + m1[1] * 2 + p1[1]) / 4 + 16) });
        // Punkty miary w oknach.
        const ca = Math.cos(al), sa = Math.sin(al);
        for (const d of dots) {
          const r0 = Math.hypot(d.x, d.y);
          const ang0 = Math.atan2(d.x * -sa + d.y * ca, d.x * ca + d.y * sa);
          let inW = r0 > 1 - h && Math.abs(ang0) < h;
          if (!inW) {
            const qx = d.x - hx, qy = d.y - hy;
            const r1 = Math.hypot(qx, qy);
            const ang1 = Math.atan2(qx * sa + qy * ca, qx * ca - qy * sa);
            inW = r1 < hr / (1 - h) && Math.abs(ang1) < h;
          }
          const cls = inW ? 'dot-gold' : 'dot-faint';
          if (d.cls !== cls) { d.e.setAttribute('class', cls); d.e.setAttribute('r', inW ? 2.6 : 1.7); d.cls = cls; }
        }
        setText(oH, fmt(h));
      }
    };
  };

  /* ---------------- sterowanie ---------------- */

  const instances = [];
  let running = [];
  let t0 = 0;
  let raf = 0;

  let paused = false, pauseT = 0;

  function now_() { return Math.max(0, (performance.now() - t0) / 1000); }

  function setPaused(p) {
    if (p === paused) return;
    if (p) pauseT = now_();
    else {
      t0 = performance.now() - pauseT * 1000;
      for (const inst of running) if (inst.anim.resume) inst.anim.resume();
    }
    paused = p;
    for (const inst of running) {
      const fig = inst.el.closest('.figure');
      if (fig) fig.classList.toggle('is-paused', p);
    }
  }

  function loop(now) {
    // Znacznik czasu klatki może być wcześniejszy niż t0.
    const t = paused ? pauseT : Math.max(0, (now - t0) / 1000);
    for (const inst of running) {
      try { inst.anim.frame(t); } catch (e) { console.error('Animacja', inst.name, e); }
    }
    raf = window.requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function activate(section) {
    stop();
    setPaused(false);
    running = instances.filter(i => i.section === section);
    for (const inst of running) if (inst.anim.start) inst.anim.start();
    if (!running.length) return;
    if (REDUCED || PRINT) {
      for (const inst of running) inst.anim.frame(inst.anim.poster || 0);
      return;
    }
    t0 = performance.now();
    raf = window.requestAnimationFrame(loop);
  }

  function init() {
    document.querySelectorAll('.reveal .slides > section').forEach(sec => {
      sec.querySelectorAll('.enter').forEach((e, k) => e.style.setProperty('--i', k));
    });
    document.querySelectorAll('[data-anim]').forEach(el => {
      const name = el.getAttribute('data-anim');
      const make = factories[name];
      if (!make) return;
      try {
        const anim = make(el);
        const section = el.closest('.slides > section');
        const inst = { name, el, section, anim };
        instances.push(inst);
        anim.frame(anim.poster || 0);
        // Kliknięcie rysunku zatrzymuje i wznawia animację; anim.click może wyróżnić element.
        if (anim.pausable) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', ev => {
            if (!running.includes(inst) || REDUCED || PRINT) return;
            const wasPaused = paused;
            if (!paused) setPaused(true);
            if (anim.click && anim.click(ev, pauseT)) return;
            if (wasPaused) setPaused(false);
          });
        }
      } catch (e) { console.error('Animacja', name, e); }
    });
    activate(window.Reveal.getCurrentSlide());
    window.Reveal.on('slidechanged', ev => activate(ev.currentSlide));
    window.Reveal.on('resize', () => instances.forEach(i => i.anim.relayout && i.anim.relayout()));
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
      window.MathJax.startup.promise.then(() => instances.forEach(i => i.anim.relayout && i.anim.relayout()));
    }
    window.Reveal.addKeyBinding({ keyCode: 82, key: 'R', description: 'Animacja od początku' },
      () => activate(window.Reveal.getCurrentSlide()));
  }

  if (window.Reveal) {
    if (window.Reveal.isReady && window.Reveal.isReady()) init();
    else window.Reveal.on('ready', init);
  }
})();
