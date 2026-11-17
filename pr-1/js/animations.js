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
    let items = [];
    function layout() {
      if (!box.offsetWidth) return;
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
          items.push({ path, len, end, halo, dot, paper: p, topic: li, start: t0 + gap * k++ });
        });
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
        if (u > 0 && u < 1) active.add(it.paper);
        if (u >= 1) reached.add(it.topic);
      }
      box.querySelectorAll('.papers li').forEach(li => li.classList.toggle('is-active', active.has(li)));
      box.querySelectorAll('.topics li').forEach(li => li.classList.toggle('is-reached', reached.has(li)));
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

  factories['carleson-seq'] = function (root) {
    const cx = 160, cy = 165, R = 138, N = 11, delta = 0.22;
    const lam = [];
    for (let n = 0; n < N; n++) {
      const rho = 1 - 0.9 * Math.pow(0.6, n);
      const th = 0.5 + 2.39996 * n;
      lam.push([rho * Math.cos(th), rho * Math.sin(th)]);
    }
    svg('circle', { cx, cy, r: R, class: 'disk-fill' }, root);
    svg('circle', { cx, cy, r: R, class: 'ink-line' }, root);
    const items = lam.map((l, n) => {
      const m2 = l[0] * l[0] + l[1] * l[1];
      const k = (1 - delta * delta) / (1 - delta * delta * m2);
      const rad = delta * (1 - m2) / (1 - delta * delta * m2);
      const g = svg('g', { opacity: 0 }, root);
      svg('circle', { cx: f1(cx + R * k * l[0]), cy: f1(cy - R * k * l[1]), r: (R * rad).toFixed(2), class: 'slate-line', 'stroke-width': 1.3, 'fill': 'rgba(65,107,134,.08)' }, g);
      const r0 = n < 6 ? 5 : 3.6;
      const dot = svg('circle', { cx: f1(cx + R * l[0]), cy: f1(cy - R * l[1]), r: r0, class: 'dot-slate' }, g);
      return { g, dot, r0 };
    });
    const lab = rich(root, 0, 0, [['λ'], ['n', 'sub']]);
    lab.setAttribute('opacity', 0);

    // Wartości f(λ_n) jako słupki.
    const bx0 = 352, base = 282, bw = 16, gap = 5, hmax = 200;
    svg('path', { d: 'M' + (bx0 - 8) + ' ' + base + 'H' + (bx0 + N * (bw + gap) + 4), class: 'axis' }, root);
    rich(root, bx0 - 6, 50, [['T'], ['λ', 'sub'], [' f = (f(λ', ''], ['n', 'sub'], ['))', '']]);
    const bars = [];
    for (let n = 0; n < N; n++) {
      const h = hmax * (0.28 + 0.68 * Math.abs(Math.sin(1.9 * n + 0.7)));
      const x = bx0 + n * (bw + gap);
      const b = svg('rect', { x, y: base - h, width: bw, height: h, rx: 3, class: 'bar' }, root);
      b.style.transformBox = 'fill-box';
      b.style.transformOrigin = '50% 100%';
      bars.push({ b, h });
      if (n % 2 === 0) {
        const tl = svg('text', { x: x + bw / 2, y: base + 20, class: 'lbl', 'text-anchor': 'middle' }, root);
        tl.textContent = n;
      }
    }
    const oN = output(root, 'n'), oD = output(root, 'dist');
    const step = 0.62, first = 0.5, P = first + N * step + 3.2;

    return {
      poster: P - 1,
      frame(t) {
        const u = t % P;
        const fade = u > P - 0.7 ? (P - u) / 0.7 : 1;
        const cur = clamp(Math.floor((u - first) / step), 0, N - 1);
        for (let n = 0; n < N; n++) {
          const e = ease(clamp((u - first - n * step) / 0.45));
          items[n].g.setAttribute('opacity', (e * fade).toFixed(3));
          const isCur = n === cur && u < first + N * step + 0.2;
          items[n].dot.setAttribute('class', isCur ? 'dot-gold' : 'dot-slate');
          items[n].dot.setAttribute('r', isCur ? 6.5 : items[n].r0);
          bars[n].b.style.transform = 'scaleY(' + e.toFixed(3) + ')';
          bars[n].b.setAttribute('opacity', fade.toFixed(3));
          bars[n].b.setAttribute('class', isCur ? 'bar is-current' : 'bar');
        }
        const l = lam[cur];
        set(lab, { x: f1(cx + R * l[0] + 9), y: f1(cy - R * l[1] - 9), opacity: (u > first ? fade : 0).toFixed(2) });
        setText(oN, String(cur));
        setText(oD, fmt(1 - cabs(l), 3));
      }
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
    rich(root, 52, 409, [['|u(b)| ≤ |λ| ≤ |u(a)|: pierścień dla ', 'up'], ['ℬ', 'up'], [' i ', 'up'], ['𝒟', 'up']], 'lbl');

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

  function loop(now) {
    // Znacznik czasu klatki może być wcześniejszy niż t0.
    const t = Math.max(0, (now - t0) / 1000);
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
        instances.push({ name, el, section, anim });
        anim.frame(anim.poster || 0);
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
