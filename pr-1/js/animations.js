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
    // Dwa ciągi na odcinku (0, 1), d_n = 1 − λ_n; dyski {z : ρ(z, λ_n) < r}.
    // Najpierw λ_n = 1 − 2^{−n} (jednostajnie oddzielony), potem λ_n = 1 − 2^{−√n}:
    // ciąg Blaschkego, ale ρ(λ_n, λ_{n+1}) → 0, więc nie jest oddzielony.
    // nDraw — punkty rysowane (dalsze leżą poniżej piksela od 1 przy ×2048),
    // nDelta — wyrazy iloczynu δ_k.
    const r = 0.15, KMAX = 12;
    const SEQS = [
      { d: n => Math.pow(2, -n), nDraw: 32, nDelta: 80 },
      // Dyski nachodzą na siebie wielokrotnie: bez wypełnienia, cieńsze linie.
      { d: n => Math.pow(2, -Math.sqrt(n)), nDraw: 361, nDelta: 4000,
        diskSt: 'fill:none;stroke:var(--slate);stroke-opacity:.45;stroke-width:.7' }
    ];
    // ρ dla punktów 1 − x, 1 − y odcinka (0, 1), liczone przez x, y (precyzja przy 1).
    const rhoD = (x, y) => Math.abs(x - y) / (x + y - x * y);
    SEQS.forEach(S => {
      S.pts = [];
      for (let n = 1; n <= S.nDraw; n++) {
        const d = S.d(n), a = 1 - d, q = 1 - r * r * a * a;
        // Środek dysku 1 − dc, promień rad (euklidesowo).
        S.pts.push({ n, d, a, dc: d * (1 + r * r * a) / q, rad: r * d * (2 - d) / q });
      }
      S.dAll = [];
      for (let n = 1; n <= S.nDelta; n++) S.dAll.push(S.d(n));
      S.memo = {};
      // log10 δ_k (iloczyn liczony w logarytmach — dla drugiego ciągu δ_k jest bardzo małe).
      S.logDelta = i => {
        if (!(i in S.memo)) {
          const dk = S.dAll[i];
          let L = 0;
          S.dAll.forEach((x, j) => { if (j !== i) L += Math.log10(rhoD(x, dk)); });
          S.memo[i] = L;
        }
        return S.memo[i];
      };
    });
    const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const pow10 = (m, e) => fmt(m, 2) + '·10' + String(e).split('').map(c => SUP[c]).join('');
    const sci = x => {
      if (x >= 1e-3) return fmt(x, 5);
      const e = Math.floor(Math.log10(x));
      return pow10(x / Math.pow(10, e), e);
    };
    const sciLog = L => {
      if (L >= -3) return fmt(Math.pow(10, L), 4);
      const e = Math.floor(L);
      return pow10(Math.pow(10, L - e), e);
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
    SEQS.forEach(S => {
      S.lG = svg('g', {}, left);
      S.lDisks = svg('g', { opacity: 0 }, S.lG);
      S.pts.forEach(p => svg('circle', Object.assign({ cx: 1 - p.dc, cy: 0, r: p.rad, style: S.diskSt || diskSt }, NS_), S.lDisks));
      S.lDots = S.pts.map(p => svg('path', Object.assign({ d: 'M' + p.a + ' 0h0', style: 'stroke:var(--slate);stroke-linecap:round;stroke-width:6', opacity: 0 }, NS_), S.lG));
    });
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
    SEQS.forEach(S => {
      S.rG = svg('g', {}, right);
      S.rDisks = svg('g', { opacity: 0 }, S.rG);
      S.rD = S.pts.map(() => svg('circle', { cy: PYc, style: S.diskSt || diskSt }, S.rDisks));
      S.rDots = S.pts.map(() => svg('circle', { cy: PYc, r: 4, style: 'fill:var(--slate)', opacity: 0 }, S.rG));
    });
    const rGD = [0, 1].map(() => svg('circle', { cy: PYc, style: goldSt, opacity: 0 }, right));
    const rGold = svg('circle', { cy: PYc, r: 6.5, style: 'fill:var(--gold)', opacity: 0 }, right);
    const zl = svg('text', { x: PX0 + 10, y: PY0 + 22, class: 'lbl' }, root);
    const lab = rich(root, 0, PYc - 14, [['λ'], ['1', 'sub']], 'mth', { 'text-anchor': 'middle' });
    const labSub = lab.lastChild;
    rich(root, X1 + 6, PYc + 20, [['1', 'up']], 'lbl');

    const oK = output(root, 'k'), oE = output(root, 'e'), oR = output(root, 'r'), oD = output(root, 'd');
    const oSeq = [output(root, 'seq0'), output(root, 'seq1')];

    const tDots = 0.4, dStep = 0.4, nFirst = 8, tDisk = tDots + nFirst * dStep + 0.3, tZoom = tDisk + 1.3, dZoom = 12;
    const PHASE = tZoom + dZoom + 3, depth = KMAX - 1;
    let manual = null, last = { u: 0, s: 0 };

    // Okno: d = 1 − Re z ∈ [−0,2 w, 1,8 w], skala s px na jednostkę; X(d) = X1 − s·d.
    const zoomAt = u => depth * ease(clamp((u - tZoom) / dZoom));
    const view = zs => { const w = 0.5 * Math.pow(2, -zs); return { w, s: PW / (2 * w) }; };
    const X = (V, d) => X1 - V.s * d;
    // Punkt najbliższy (w skali logarytmicznej) środka okna d = 0,8 w.
    const nearest = (S, w) => {
      const L = Math.log(0.8 * w);
      let best = 0, bd = Infinity;
      for (let j = 0; j <= S.nDraw - 2; j++) {
        const e = Math.abs(Math.log(S.pts[j].d) - L);
        if (e < bd) { bd = e; best = j; }
      }
      return best;
    };

    function draw(t) {
      const sIdx = manual ? manual.s : Math.floor(t / PHASE) % SEQS.length;
      const u = manual ? manual.u : t % PHASE;
      const S = SEQS[sIdx];
      SEQS.forEach((Q, m) => {
        const disp = m === sIdx ? '' : 'none';
        Q.lG.style.display = disp; Q.rG.style.display = disp;
        if (oSeq[m]) oSeq[m].style.display = m === sIdx ? '' : 'none';
      });
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

      // Wyróżniony punkt: najnowszy przy pojawianiu się, potem najbliższy środka okna.
      const shownN = clamp(Math.floor((u - tDots) / dStep) + 1, 0, nFirst);
      let i;
      if (manual) i = manual.i;
      else if (u < tDisk) i = Math.max(0, shownN - 1);
      else i = nearest(S, V.w);
      const p = S.pts[i];

      const rest = clamp((u - tDots - nFirst * dStep) / 0.5);
      const diskOn = clamp((u - tDisk) / 1);
      S.lDisks.setAttribute('opacity', (diskOn * fade).toFixed(3));
      S.rDisks.setAttribute('opacity', (diskOn * fade).toFixed(3));
      S.pts.forEach((q, j) => {
        const op = ((j < nFirst ? ease(clamp((u - tDots - j * dStep) / 0.3)) : rest) * fade).toFixed(3);
        S.lDots[j].setAttribute('opacity', op);
        const xd = X(V, q.d), xc = X(V, q.dc), rr = V.s * q.rad;
        const vis = xc + rr > PX0 - 5 && xc - rr < PX0 + PW + 5;
        S.rD[j].style.display = vis ? '' : 'none';
        if (vis) set(S.rD[j], { cx: f1(xc), r: f1(rr) });
        const dv = xd > PX0 - 6 && xd < PX0 + PW + 6;
        S.rDots[j].style.display = dv ? '' : 'none';
        if (dv) set(S.rDots[j], { cx: f1(xd), opacity: op });
      });

      const on = (u >= tDots ? fade : 0).toFixed(2);
      const dOn = (diskOn * fade).toFixed(2);
      set(lGold, { d: 'M' + p.a + ' 0h0', opacity: on });
      set(rGold, { cx: f1(X(V, p.d)), opacity: on });
      [0, 1].forEach(m => {
        const q = S.pts[i + m];
        set(lGD[m], { cx: 1 - q.dc, r: q.rad, opacity: dOn });
        set(rGD[m], { cx: f1(X(V, q.dc)), r: f1(V.s * q.rad), opacity: dOn });
      });
      const lx = X(V, p.d);
      setText(labSub, String(p.n));
      set(lab, { x: f1(lx - 4), opacity: lx > PX0 + 8 && lx < PX0 + PW - 8 ? on : 0 });
      const q1 = S.pts[i + 1];
      setText(oK, String(p.n));
      setText(oE, sci(p.d - q1.d));
      setText(oR, fmt(rhoD(p.d, q1.d), 3));
      setText(oD, sciLog(S.logDelta(i)));
      return { u, s: sIdx };
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
        const S = SEQS[last.s];
        let best = -1, bd = 12;
        S.pts.forEach((p, j) => {
          if (j > S.nDraw - 2) return;
          const x = inRight ? X(V, p.d) : cx + R * p.a, y = inRight ? PYc : cy;
          const d = Math.hypot(q.x - x, q.y - y);
          if (d < bd) { bd = d; best = j; }
        });
        if (best < 0) return false;
        manual = { u: last.u, s: last.s, i: best };
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
    svg('path', { d: 'M' + (x0 + 30) + ' 34h69', class: 'gold-line' }, root);
    svg('path', { d: 'M' + (x0 + 92) + ' 29L' + (x0 + 100) + ' 34L' + (x0 + 92) + ' 39', class: 'gold-line' }, root);

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

  /* ---------------- slajd 13: jednostajna wypukłość kuli ℓ^{3/2} ---------------- */

  // Kula jednostkowa ℓ^{3/2} w ℝ²; cięciwy o długości (w tej normie) co najmniej ε,
  // ich środki leżą w kuli (1 − δ)B, δ = δ(ε) — moduł wypukłości liczony numerycznie.
  factories['uniform-convexity'] = function (root) {
    const cx = 200, cy = 192, S = 162;
    const p = 1.5, q = 1 / p * 2;                      // q = 4/3: |cos u|^q, |sin u|^q leżą na sferze
    const EPS = 1.3;
    const P = u => {
      const c = Math.cos(u), s = Math.sin(u);
      return [Math.sign(c) * Math.pow(Math.abs(c), q), Math.sign(s) * Math.pow(Math.abs(s), q)];
    };
    const norm = v => Math.pow(Math.pow(Math.abs(v[0]), p) + Math.pow(Math.abs(v[1]), p), 1 / p);
    const dist = (a, b) => norm([a[0] - b[0], a[1] - b[1]]);
    // Parametr v > u punktu sfery w odległości L od P(u) (bisekcja; odległość rośnie do 2 przy v = u + π).
    const ahead = (u, L) => {
      const x = P(u);
      let lo = u, hi = u + Math.PI;
      for (let k = 0; k < 48; k++) {
        const m = (lo + hi) / 2;
        if (dist(P(m), x) < L) lo = m; else hi = m;
      }
      return hi;
    };
    // δ(ε) i parametr początku cięciwy, przy której środek jest najdalej od środka kuli.
    let delta = 1, uMin = 0;
    for (let k = 0; k <= 900; k++) {
      const u = (Math.PI / 2) * k / 900;
      const x = P(u), y = P(ahead(u, EPS));
      const g = 1 - norm([(x[0] + y[0]) / 2, (x[1] + y[1]) / 2]);
      if (g < delta) { delta = g; uMin = u; }
    }
    const X = v => cx + S * v[0], Y = v => cy - S * v[1];
    const ballPath = r => {
      let d = '';
      for (let k = 0; k < 720; k++) {
        const v = P(TAU * k / 720);
        d += (k ? 'L' : 'M') + f1(cx + S * r * v[0]) + ' ' + f1(cy - S * r * v[1]);
      }
      return d + 'Z';
    };

    // Kolory i grubości jak w animacjach automorfizmów (slajdy 9–11).
    const C = { ink: '#254765', blue: '#638A9E', move: '#2E708F', gold: '#C49A5A', paper: '#fffefa' };
    const disk = svg('g', { opacity: 0 }, root);
    svg('path', { d: ballPath(1), fill: '#fcfbf7', stroke: 'none' }, disk);
    const layer = svg('path', { d: ballPath(1) + ballPath(1 - delta), fill: C.blue, 'fill-opacity': 0.12, 'fill-rule': 'evenodd' }, root);
    const inner = svg('path', { d: ballPath(1 - delta), fill: 'none', stroke: C.gold, 'stroke-width': 1.5, 'stroke-dasharray': '6 6' }, root);
    svg('path', { d: ballPath(1), fill: 'none', stroke: C.ink, 'stroke-width': 2 }, disk);
    // Podpis δ w pierścieniu, na dole kuli (w kierunku osi szerokość pierścienia to dokładnie δ).
    const dGroup = svg('g', { opacity: 0 }, root);
    const yb0 = cy + S, yb1 = cy + S * (1 - delta);
    rich(dGroup, cx, f1((yb0 + yb1) / 2 + 6), [['δ']], 'mth', { 'text-anchor': 'middle' });

    const chord = svg('path', { fill: 'none', stroke: C.blue, 'stroke-width': 1.6, opacity: 0 }, root);
    const gauge = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 }, root);
    const g1 = svg('circle', { r: 2.6, fill: C.gold, stroke: C.paper, 'stroke-width': 1.2, opacity: 0 }, root);
    const g2 = svg('circle', { r: 2.6, fill: C.gold, stroke: C.paper, 'stroke-width': 1.2, opacity: 0 }, root);
    const epsLbl = rich(root, 0, 0, [['ε']], 'mth mth-gold', { 'text-anchor': 'middle', opacity: 0 });
    const dx = svg('circle', { r: 4.3, fill: C.move, stroke: C.paper, 'stroke-width': 2.2, opacity: 0 }, root);
    const dy = svg('circle', { r: 4.3, fill: C.move, stroke: C.paper, 'stroke-width': 2.2, opacity: 0 }, root);
    const halo = svg('circle', { r: 7, fill: 'none', stroke: '#CAA16B', 'stroke-width': 1.2, opacity: 0 }, root);
    const mid = svg('circle', { r: 3.8, fill: '#CAA16B', stroke: C.paper, 'stroke-width': 1.6, opacity: 0 }, root);

    // Ruch: początek cięciwy obiega sferę (ćwiartka w QT s), długość L ⩾ ε wraca do ε,
    // gdy cięciwa jest symetryczna względem przekątnej (tam środek dotyka (1 − δ)B).
    const T0 = 5, QT = 7;
    const amp = [0.4, 0.2, 0.58, 0.3];
    const state = tau => {
      const k = Math.floor(tau / QT), f = tau / QT - k;
      const g = f - 0.55 / TAU * Math.sin(TAU * f);      // zwolnienie przy cięciwach granicznych
      const u = uMin + (Math.PI / 2) * (k + g);
      const L = EPS + amp[((k % 4) + 4) % 4] * Math.pow(Math.sin(Math.PI * g), 2);
      const x = P(u), y = P(ahead(u, L));
      return { x, y, L, m: [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2] };
    };

    return {
      poster: T0 + 4 * QT,
      frame(t) {
        const a1 = ease(clamp(t / 1.2)), a2 = ease(clamp((t - 0.8) / 1.2));
        const a3 = ease(clamp((t - 2) / 0.8)), a4 = ease(clamp((t - 3) / 1.4));
        set(disk, { opacity: a1.toFixed(2) });
        set(dGroup, { opacity: a2.toFixed(2) });
        const st = state(Math.max(0, t - T0));
        const gap = 1 - norm(st.m) - delta;              // ⩾ 0; zero przy cięciwach granicznych
        const glow = clamp(1 - gap / 0.03);
        set(layer, { opacity: (a2 * (0.7 + 0.3 * glow)).toFixed(2) });
        set(inner, { opacity: (a2 * (0.6 + 0.4 * glow)).toFixed(2) });
        const { x, y, m } = st;
        set(chord, { d: 'M' + f1(X(x)) + ' ' + f1(Y(x)) + 'L' + f1(lerp(X(x), X(y), a3)) + ' ' + f1(lerp(Y(x), Y(y), a3)), opacity: a3.toFixed(2) });
        set(dx, { cx: f1(X(x)), cy: f1(Y(x)), opacity: a3.toFixed(2) });
        set(dy, { cx: f1(X(y)), cy: f1(Y(y)), opacity: a3.toFixed(2) });
        const am = clamp((t - 2.6) / 0.4);
        set(mid, { cx: f1(X(m)), cy: f1(Y(m)), opacity: am.toFixed(2) });
        set(halo, { cx: f1(X(m)), cy: f1(Y(m)), opacity: (am * (0.3 + 0.5 * glow)).toFixed(2) });
        // Wzorzec ε: odcinek długości ε (w normie ℓ^{3/2}) na cięciwie, symetrycznie wokół jej środka.
        const h = EPS / st.L / 2 * a4;
        const e1 = [lerp(m[0], x[0], 2 * h), lerp(m[1], x[1], 2 * h)];
        const e2 = [lerp(m[0], y[0], 2 * h), lerp(m[1], y[1], 2 * h)];
        set(gauge, { d: 'M' + f1(X(e1)) + ' ' + f1(Y(e1)) + 'L' + f1(X(e2)) + ' ' + f1(Y(e2)), opacity: a4 > 0 ? 1 : 0 });
        set(g1, { cx: f1(X(e1)), cy: f1(Y(e1)), opacity: a4.toFixed(2) });
        set(g2, { cx: f1(X(e2)), cy: f1(Y(e2)), opacity: a4.toFixed(2) });
        // Podpis ε obok odcinka, po stronie środka kuli.
        const vx = X(y) - X(x), vy = Y(y) - Y(x), vl = Math.hypot(vx, vy) || 1;
        let nx = -vy / vl, ny = vx / vl;
        if (nx * (X(m) - cx) + ny * (Y(m) - cy) > 0) { nx = -nx; ny = -ny; }
        const lx = lerp(X(m), X(e2), 0.55) + 17 * nx, ly = lerp(Y(m), Y(e2), 0.55) + 17 * ny + 6;
        set(epsLbl, { x: f1(lx), y: f1(ly), opacity: a4.toFixed(2) });
      }
    };
  };

  /* ---------------- slajd 14: macierz Toeplitza, S*T_aS = T_a ---------------- */

  factories['toeplitz-matrix'] = function (root) {
    // Symbol a(e^{it}) = 0,9 + 0,72e^{it} − 0,48e^{−it} + 0,34e^{2it} + 0,20e^{−2it} + 0,22e^{3it} + 0,14e^{−3it}
    //                    + 0,12e^{4it} + 0,06e^{−4it};
    // macierz T_a na H² w bazie 1, z, z², …: (T_a)_{ij} = â(i − j); po 4 niezerowe przekątne z każdej strony.
    const coef = { 0: 0.9, 1: 0.72, '-1': -0.48, 2: 0.34, '-2': 0.2, 3: 0.22, '-3': 0.14, 4: 0.12, '-4': 0.06 };
    const ahat = k => coef[k] || 0;
    const N = 15, cell = 16, ox = 4, oy = 4;            // widoczny fragment N×N
    // Powiększenie tuż przy prawym górnym rogu macierzy, wyrównane do jej górnego brzegu.
    const W = 5, zc = 30, zp = 5, zx = ox + N * cell + 26 + zp, zy = oy + zp;
    const STOPS = [0, 2, 4, 6, 8];                       // pozycje ramki: n wierszy i n kolumn
    const C = { ink: '#0d2846', blue: '#416b86', rose: '#AA765E', gold: '#c39457', paper: '#fffefa' };
    // Kolory przekątnych: główna granatowa; poniżej odcienie niebieskiego (nasycenie wg |â(d)|),
    // powyżej odcienie różowego, coraz słabsze z odległością od głównej przekątnej.
    const ROSE = { '-1': 0.55, '-2': 0.38, '-3': 0.26, '-4': 0.17 };
    const look = d => {
      const v = ahat(d);
      if (d === 0) return { fill: C.ink, op: 0.95 };
      if (d > 0) return { fill: C.blue, op: 0.85 * (0.25 + 0.75 * Math.min(1, Math.abs(v) / 0.9)) };
      return { fill: C.rose, op: ROSE[d] };
    };
    const edge = (i, j) => clamp((N - 0.4 - Math.max(i, j)) / 2.6);   // zanikanie na brzegu: macierz jest nieskończona


    // Macierz: komórki pogrupowane według przekątnych d = i − j.
    const diag = new Map();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const d = i - j, v = ahat(d);
      if (!diag.has(d)) diag.set(d, svg('g', { opacity: 0 }, root));
      const g = diag.get(d);
      const e = edge(i, j);
      if (v === 0) svg('rect', { x: ox + j * cell + 1, y: oy + i * cell + 1, width: cell - 2, height: cell - 2, rx: 2,
        fill: 'none', stroke: C.ink, 'stroke-opacity': (0.1 * e).toFixed(3), 'stroke-width': 0.8 }, g);
      else svg('rect', { x: ox + j * cell + 1, y: oy + i * cell + 1, width: cell - 2, height: cell - 2, rx: 2,
        fill: look(d).fill, 'fill-opacity': (look(d).op * e).toFixed(3), 'data-v': v }, g);
    }

    // Ramka, linie łączące i powiększenie (zawartość: [â(i − j)], 0 ⩽ i, j < W).
    const ghost = svg('rect', { x: ox, y: oy, width: W * cell, height: W * cell, rx: 3, fill: 'none', stroke: C.gold,
      'stroke-width': 1.4, 'stroke-dasharray': '4 3', opacity: 0 }, root);
    const win = svg('rect', { width: W * cell, height: W * cell, rx: 3, class: 'window', opacity: 0 }, root);
    win.style.strokeWidth = '2';
    win.style.fill = 'none';
    // Podświetlenie przekątnej: złote obwódki komórek w ramce i w powiększeniu.
    const band = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 1.6, opacity: 0 }, root);
    const c1 = svg('path', { class: 'cursor-line', opacity: 0 }, root);
    const c2 = svg('path', { class: 'cursor-line', opacity: 0 }, root);
    const zoom = svg('g', { opacity: 0 }, root);
    const zframe = svg('rect', { x: zx - zp, y: zy - zp, width: W * zc + 2 * zp, height: W * zc + 2 * zp, rx: 6,
      fill: C.paper, stroke: C.gold, 'stroke-width': 2 }, zoom);
    const zcells = [];
    for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) {
      const r = svg('rect', { x: zx + j * zc + 2, y: zy + i * zc + 2, width: zc - 4, height: zc - 4, rx: 3 }, zoom);
      const lb = rich(zoom, zx + j * zc + zc / 2 - 1.5, zy + i * zc + zc / 2 + 5, [['a'], ['', 'sub']], 'mth',
        { 'text-anchor': 'middle' });
      lb.style.fontSize = '14px';
      zcells.push({ r, lb, sub: lb.lastChild });
    }
    let lastK = -1;
    // Powiększenie: elementy (T_a)_{i+k, j+k}, liczone z tej samej funkcji â.
    function fillZoom(k) {
      if (k === lastK) return;
      lastK = k;
      for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) {
        const d = (i + k) - (j + k), v = ahat(d), z = zcells[i * W + j];
        if (v === 0) set(z.r, { fill: 'none', stroke: C.ink, 'stroke-opacity': 0.12, 'stroke-width': 1, 'fill-opacity': 1, 'data-v': 0 });
        else set(z.r, { fill: look(d).fill, stroke: 'none', 'fill-opacity': look(d).op.toFixed(3), 'data-v': v });
        z.lb.setAttribute('opacity', v === 0 ? 0 : 1);
        z.lb.style.fill = v !== 0 && look(d).op > 0.6 ? '#ffffff' : C.ink;
        z.sub.textContent = String(d).replace('-', '−');
      }
    }
    fillZoom(0);
    const zband = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 1.8, opacity: 0 }, zoom);

    const oN = output(root, 'n');
    // Fazy: 0–4 s macierz, 4–8 s ramka i powiększenie, 8–18 s przesunięcia, 18–23 s porównanie.
    const T = 23, MOVE = 1.2, STEP = 2.5;
    const HL = [0, 1, -1, -2];                            // przekątne podświetlane po kolejnych przesunięciach
    function pos(w) {
      if (w < 8) return { n: 0, hold: -1 };
      const s = Math.floor((w - 8) / STEP), u = (w - 8) - s * STEP;
      if (s >= STOPS.length - 1) return { n: STOPS[STOPS.length - 1], hold: STOPS.length - 2 };
      if (u < MOVE) return { n: lerp(STOPS[s], STOPS[s + 1], ease(u / MOVE)), hold: -1 };
      return { n: STOPS[s + 1], hold: s };
    }
    function bandPath(x0, y0, c, d, from, to, m) {        // komórki przekątnej d w kwadracie from..to−1
      const i0 = from + Math.max(0, d), len = to - from - Math.abs(d);
      let p = '';
      for (let k = 0; k < len; k++) {
        const i = i0 + k, j = i - d;
        p += 'M' + f1(x0 + j * c + m) + ' ' + f1(y0 + i * c + m) + 'h' + (c - 2 * m) + 'v' + (c - 2 * m) + 'h' + (2 * m - c) + 'Z';
      }
      return p;
    }
    return {
      poster: 20.5,
      frame(t) {
        const w = t % T;
        diag.forEach((g, d) => {
          const order = ahat(d) !== 0 ? Math.abs(d) : 5;
          g.setAttribute('opacity', ease(clamp((w - 0.3 - 0.75 * order) / 0.8)).toFixed(2));
        });
        const aw = ease(clamp((w - 4.2) / 0.9)), az = ease(clamp((w - 5) / 1.2));
        const { n, hold } = pos(w);
        const x = ox + n * cell, y = oy + n * cell, s = W * cell;
        set(win, { x: f1(x), y: f1(y), opacity: aw.toFixed(2) });
        // Styczne zewnętrzne: lewy górny róg ramki z lewym górnym rogiem powiększenia, prawy dolny z prawym dolnym.
        set(c1, { d: 'M' + f1(x) + ' ' + f1(y) + 'L' + (zx - zp) + ' ' + (zy - zp), opacity: az.toFixed(2) });
        set(c2, { d: 'M' + f1(x + s) + ' ' + f1(y + s) + 'L' + (zx + W * zc + zp) + ' ' + (zy + W * zc + zp), opacity: az.toFixed(2) });
        set(zoom, { opacity: az.toFixed(2) });
        fillZoom(Math.round(n));
        // Podświetlenie tej samej przekątnej w ramce i w powiększeniu podczas postoju.
        let hk = null, ha = 0;
        if (hold >= 0 && w < 18) {
          const u = (w - 8) - (hold + 1) * STEP + STEP - MOVE;      // czas od zatrzymania
          hk = HL[hold % HL.length]; ha = Math.sin(Math.PI * clamp(u / (STEP - MOVE)));
        }
        if (hk !== null) {
          const k = Math.round(n);
          band.setAttribute('d', bandPath(ox, oy, cell, hk, k, k + W, 1));
          zband.setAttribute('d', bandPath(zx, zy, zc, hk, 0, W, 2));
        }
        band.setAttribute('opacity', (0.95 * ha).toFixed(2));
        zband.setAttribute('opacity', (0.95 * ha).toFixed(2));
        // Faza IV: ramka początkowa (przerywana) obok końcowej, wyróżnione obramowanie powiększenia.
        const a4 = ease(clamp((w - 18.3) / 0.9)) * (1 - ease(clamp((w - 22.4) / 0.6)));
        ghost.setAttribute('opacity', a4.toFixed(2));
        zframe.setAttribute('stroke-width', (1.6 + 1 * a4).toFixed(2));
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

  /* ---------------- slajd 15: miara harmoniczna i izomorfizm θ ---------------- */

  // Ω: dysk jednostkowy bez trzech dysków (a_k, r_k), jak na wykładzie przedhabilitacyjnym.
  // ω_z liczona torami ruchu Browna metodą spacerów po kołach (Muller 1956);
  // θ(ζ) = Σ_{i<k} ω_z(Γ_i) + ω_z((x^k, ζ)), ζ ∈ Γ_k — wzór (3.1) w [5].
  factories['harmonic-measure'] = function (root) {
    const HM = [[-1 / 3, 0, 1 / 3], [1 / 3, 1 / 3, 1 / 6], [1 / 3, -5 / 12, 1 / 4]];
    const COMPS = [[0, 0, 1]].concat(HM);
    const ZX = 0.4, ZY = 0;
    const NS = 100000, BUDGET = 4, BINS = 720, NTR = 400, SLOW = 4;

    // Odległość od brzegu i najbliższa składowa.
    const near = (x, y) => {
      let d = 1 - Math.hypot(x, y), k = 0;
      for (let j = 0; j < 3; j++) {
        const e = Math.hypot(x - HM[j][0], y - HM[j][1]) - HM[j][2];
        if (e < d) { d = e; k = j + 1; }
      }
      return [d, k];
    };
    // Spacer po kołach z z; wynik: składowa k, położenie s ∈ [0, 1) od x^k = a_k + r_k
    // w orientacji dodatniej względem Ω (Γ_0 przeciwnie do ruchu wskazówek zegara, dziury zgodnie).
    const walk = (R, eps, steps) => {
      let x = ZX, y = ZY;
      for (;;) {
        const [d, k] = near(x, y);
        if (d < eps) {
          const [a, b] = COMPS[k];
          const ang = Math.atan2(y - b, x - a);
          let s = (k === 0 ? ang : -ang) / TAU;
          s -= Math.floor(s);
          return { k, s, ang };
        }
        if (steps) steps.push([x, y, d]);
        const u = TAU * R();
        x += d * Math.cos(u); y += d * Math.sin(u);
      }
    };

    // Tory rysowane (ε = 10⁻³): cztery wolne, potem szybkie; ziarno 138 — wolne kończą się na różnych składowych.
    const RT = rng(138);
    const tracks = [];
    for (let i = 0; i < NTR; i++) {
      const steps = i < SLOW ? [] : null;
      const w = walk(RT, 1e-3, steps);
      tracks.push(Object.assign(w, { steps }));
    }

    // Próbka do θ (ε = 10⁻⁴), liczona porcjami w kolejnych klatkach.
    const RS = rng(20190867);
    const hist = [0, 1, 2, 3].map(() => new Float64Array(BINS));
    const cnt = [0, 0, 0, 0];
    let done = 0;
    let om = null, off = null, cum = null;
    // ms — czas na porcję w jednej klatce (Infinity: całość od razu).
    const sampleStep = ms => {
      const tEnd = performance.now() + ms;
      while (done < NS) {
        for (const end = Math.min(NS, done + 500); done < end; done++) {
          const w = walk(RS, 1e-4);
          cnt[w.k]++;
          hist[w.k][Math.min(BINS - 1, Math.floor(w.s * BINS))]++;
        }
        if (performance.now() > tEnd) break;
      }
      if (done === NS && !om) finish();
    };
    const theta = (k, s) => {
      const c = cum[k], x = s * BINS, j = Math.min(BINS - 1, Math.floor(x));
      return off[k] + lerp(c[j], c[j + 1], x - j);
    };
    // θ^{-1}: t ∈ [0, 1) → (k, s); odwrócenie dystrybuanty z interpolacją liniową.
    const thetaInv = t => {
      let k = 3;
      while (k > 0 && t < off[k]) k--;
      const c = cum[k], v = t - off[k];
      let lo = 0, hi = BINS;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= v) lo = m; else hi = m; }
      const w = c[lo + 1] - c[lo];
      return { k, s: (lo + (w > 0 ? clamp((v - c[lo]) / w) : 0)) / BINS };
    };
    const onComp = (k, s) => {
      const [a, b, r] = COMPS[k], ang = (k === 0 ? 1 : -1) * TAU * s;
      return [a + r * Math.cos(ang), b + r * Math.sin(ang)];
    };
    // |f| dla f(w) = Σ_{k=1}^{3} 1/(w − a_k).
    const fabs = (x, y) => {
      let re = 0, im = 0;
      for (const [a, b] of HM) { const dx = x - a, dy = y - b, q = dx * dx + dy * dy; re += dx / q; im -= dy / q; }
      return Math.hypot(re, im);
    };

    // Geometria rysunku.
    const cx = 165, cy = 170, R = 140;
    const PX = x => cx + R * x, PY = y => cy - R * y;
    const X0 = 345, X1 = 575, W = X1 - X0, YB = 300, VS = 250 / 8.5;
    const C = { ink: '#0d2846', blue: '#638A9E', move: '#2E708F', gold: '#C49A5A', paper: '#fffefa' };
    const CC = ['#0d2846', '#416b86', '#7596ab', '#a6bccb'];

    // Lewa część: Ω, składowe brzegu, punkt z.
    let dOm = circlePath(cx, cy, R);
    HM.forEach(([a, b, r]) => { dOm += circlePath(PX(a), PY(b), R * r); });
    svg('path', { d: dOm, class: 'omega-fill' }, root);
    const walkG = svg('g', {}, root);
    const rings = COMPS.map(([a, b, r], k) => svg('circle', { cx: f1(PX(a)), cy: f1(PY(b)), r: f1(R * r), fill: 'none', stroke: CC[k], 'stroke-width': 2.2 }, root));
    const lblAt = [[cx - R * 0.8 - 12, cy - R * 0.8 - 4], [PX(-1 / 3), PY(0) + 6], [PX(1 / 3), PY(1 / 3) + 6], [PX(1 / 3), PY(-5 / 12) + 6]];
    lblAt.forEach(([x, y], k) => rich(root, f1(x), f1(y), [['Γ', 'up'], [String(k), 'sub']], 'mth', { 'font-size': 16, 'text-anchor': 'middle' }));
    const massTicks = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 1.5, 'stroke-opacity': 0.6 }, root);
    const slowTicks = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, root);
    const zx = PX(ZX), zy = PY(ZY);
    svg('circle', { cx: f1(zx), cy: f1(zy), r: 4.3, fill: C.gold, stroke: C.paper, 'stroke-width': 2.2 }, root);
    rich(root, f1(zx + 9), f1(zy + 5), [['z']], 'mth', { 'font-size': 17 });

    // Elementy toru: koła spaceru, odcinek skoku, bieżący punkt.
    const jump = svg('path', { fill: 'none', stroke: C.blue, 'stroke-width': 1.2 }, root);
    const cur = svg('circle', { r: 2.8, fill: C.ink, stroke: C.paper, 'stroke-width': 1.2 }, root);

    // Prawa część: odcinek [0, 1), kawałki ω_z(Γ_k), kreski θ(ζ), wykres |f∘θ^{-1}|.
    const right = svg('g', {}, root);
    const axis = svg('g', { opacity: 0 }, right);
    svg('path', { d: 'M' + X0 + ' ' + YB + 'V46', class: 'axis' }, axis);
    [4, 8].forEach(v => {
      const y = f1(YB - v * VS);
      svg('path', { d: 'M' + (X0 - 4) + ' ' + y + 'h4', class: 'axis' }, axis);
      svg('text', { x: X0 - 8, y: +y + 5, class: 'lbl', 'text-anchor': 'end', 'font-size': 13 }, axis).textContent = String(v);
    });
    const bar = svg('g', { opacity: 0 }, right);
    const pieces = CC.map(c => svg('rect', { y: YB - 3, height: 6, fill: c }, bar));
    const plab = [0, 1, 2, 3].map(k => rich(bar, 0, YB + 24, [['Γ', 'up'], [String(k), 'sub']], 'mth', { 'text-anchor': 'middle' }));
    svg('text', { x: X0 - 8, y: YB + 5, class: 'lbl', 'text-anchor': 'end' }, bar).textContent = '0';
    svg('text', { x: X1 + 8, y: YB + 5, class: 'lbl' }, bar).textContent = '1';
    const landTicks = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 1, 'stroke-opacity': 0.5 }, right);
    const flyTicks = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 1.4, 'stroke-opacity': 0.75 }, root);
    const clip = svg('clipPath', { id: 'clip-harmonic-measure' }, svg('defs', {}, root));
    const clipR = svg('rect', { x: X0 - 2, y: 30, height: YB - 28, width: 0 }, clip);
    const graph = svg('path', { fill: 'none', stroke: C.gold, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'clip-path': 'url(#clip-harmonic-measure)' }, right);
    const gLbl = svg('g', { opacity: 0 }, right);
    rich(gLbl, X1, 64, [['|f ∘ θ', ''], ['−1', 'sup'], ['|', '']], 'mth mth-gold', { 'text-anchor': 'end', 'font-size': 18 });

    const oN = output(root, 'n'), oW = [0, 1, 2, 3].map(k => output(root, 'w' + k)), oF = output(root, 'frow');

    // Po zebraniu próbki: kawałki odcinka, położenia kresek θ(ζ), wykres.
    function finish() {
      om = cnt.map(c => c / NS);
      off = [0, om[0], om[0] + om[1], om[0] + om[1] + om[2]];
      cum = hist.map(h => { const c = new Float64Array(BINS + 1); for (let j = 0; j < BINS; j++) c[j + 1] = c[j] + h[j] / NS; return c; });
      om.forEach((w, k) => {
        set(pieces[k], { x: f1(X0 + W * off[k]), width: f1(W * w) });
        // Wąskie kawałki Γ_0, Γ_1: mniejsza czcionka, podpisy rozsunięte.
        const xm = X0 + W * (off[k] + w / 2) + (k === 0 ? 3 : k === 1 ? -3 : 0);
        set(plab[k], { x: f1(xm), 'font-size': w < 0.12 ? 13 : 17, 'text-anchor': k === 0 ? 'end' : k === 1 ? 'start' : 'middle' });
      });
      tracks.forEach(tr => { tr.th = theta(tr.k, tr.s); });
      const order = tracks.map((tr, i) => i).sort((i, j) => tracks[i].th - tracks[j].th);
      order.forEach((i, r) => { tracks[i].rank = r; });
      let d = '', prevK = -1;
      for (let j = 0; j <= 920; j++) {
        const t = Math.min(j / 920, 1 - 1e-9), q = thetaInv(t), p = onComp(q.k, q.s);
        d += (q.k !== prevK ? 'M' : 'L') + f1(X0 + W * t) + ' ' + f1(YB - VS * fabs(p[0], p[1]));
        prevK = q.k;
      }
      graph.setAttribute('d', d);
    }

    // Kreska prostopadła do brzegu, długość 2h px; ang — kąt normalnej.
    const bpt = tr => { const [a, b, r] = COMPS[tr.k]; return [PX(a + r * Math.cos(tr.ang)), PY(b + r * Math.sin(tr.ang))]; };
    const tick = (x, y, ang, h) => {
      const ux = Math.cos(ang) * h, uy = -Math.sin(ang) * h;
      return 'M' + f1(x - ux) + ' ' + f1(y - uy) + 'L' + f1(x + ux) + ' ' + f1(y + uy);
    };

    // Przebieg (s): 0–1 obszar i z; 1–6 cztery wolne tory; 6–10 do 400 torów;
    // 10–14 odcinek i przelot kresek; 14–20 wykres; 20–23 postój i wygaszenie.
    const CYCLE = 23, TS = 1, DS = 1.25, LS = 1.2, TF0 = 6, TF1 = 10, TB = 10, TFLY = 10.6, SPREAD = 2.5, FLY = 0.9, TG0 = 14, TG1 = 20;
    // Wolne tory: koła spaceru (tworzone raz); czas kroków rośnie z promieniem koła,
    // więc drobne kroki przy brzegu są krótkie.
    for (let j = 0; j < SLOW; j++) {
      const tr = tracks[j], wts = tr.steps.map(p => Math.sqrt(Math.max(R * p[2], 2)));
      const tot = wts.reduce((a, b) => a + b, 0);
      let acc = 0;
      tr.tt = wts.map(w => { const a = acc; acc += w / tot; return a; });
      tr.circ = tr.steps.map(p => svg('circle', { cx: f1(PX(p[0])), cy: f1(PY(p[1])), r: f1(R * p[2]), fill: 'none', stroke: C.blue, 'stroke-width': 1, opacity: 0 }, walkG));
    }
    let started = false;

    function nShown(t) {
      if (t < TS) return 0;
      if (t < TF0) return clamp(Math.floor((t - TS + DS - LS) / DS), 0, SLOW);
      if (t < TF1) return SLOW + Math.round((NTR - SLOW) * Math.pow((t - TF0) / (TF1 - TF0), 2));
      return NTR;
    }

    function draw(t) {
      const u = t % CYCLE;
      const fade = u > 21.5 ? clamp((CYCLE - u) / 1.5) : 1;
      if (!om) sampleStep((REDUCED || PRINT) ? Infinity : BUDGET);

      // Wolne tory: koła do bieżącego kroku, odcinek skoku, bieżący punkt; po końcu toru koła gasną.
      jump.setAttribute('d', ''); cur.setAttribute('opacity', 0);
      for (let j = 0; j < SLOW; j++) {
        const tr = tracks[j], st = tr.steps, tt = tr.tt, t0 = TS + j * DS, loc = (u - t0) / LS;
        if (loc < 0) { tr.circ.forEach(e => e.setAttribute('opacity', 0)); continue; }
        if (loc > 1) {
          const op = (0.35 * clamp(1 - (u - t0 - LS) / 0.5)).toFixed(2);
          tr.circ.forEach(e => e.setAttribute('opacity', op));
          continue;
        }
        let i = 0;
        while (i + 1 < st.length && tt[i + 1] <= loc) i++;
        tr.circ.forEach((e, m) => e.setAttribute('opacity', m <= i ? 0.35 : 0));
        const s1 = i + 1 < st.length ? tt[i + 1] : 1, fr = ease(clamp((loc - tt[i]) / (s1 - tt[i])));
        const a = [PX(st[i][0]), PY(st[i][1])], q = i + 1 < st.length ? [PX(st[i + 1][0]), PY(st[i + 1][1])] : bpt(tr);
        const b = [lerp(a[0], q[0], fr), lerp(a[1], q[1], fr)];
        jump.setAttribute('d', 'M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]));
        set(cur, { cx: f1(b[0]), cy: f1(b[1]), opacity: 1 });
      }

      // Kreski na brzegu i odczyty.
      const n = nShown(u);
      let ds = '', dm = '';
      const c = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const tr = tracks[i], [x, y] = bpt(tr);
        c[tr.k]++;
        if (i < SLOW) ds += tick(x, y, tr.ang, 4); else dm += tick(x, y, tr.ang, 3.5);
      }
      slowTicks.setAttribute('d', ds); massTicks.setAttribute('d', dm);
      slowTicks.setAttribute('opacity', fade.toFixed(2)); massTicks.setAttribute('opacity', fade.toFixed(2));
      setText(oN, String(n));
      oW.forEach((o, k) => setText(o, n ? fmt(c[k] / n) : '–'));

      // Odcinek [0, 1), przelot kresek, wykres.
      const ready = !!om;
      const aBar = ready ? ease(clamp((u - TB) / 0.6)) * fade : 0;
      bar.setAttribute('opacity', aBar.toFixed(2));
      let dl = '', df = '';
      const thick = [0, 0, 0, 0];
      if (ready && u >= TFLY) {
        tracks.forEach(tr => {
          const t0 = TFLY + SPREAD * tr.rank / NTR, s = (u - t0) / FLY;
          const qx = X0 + W * tr.th;
          if (s >= 1) { dl += 'M' + f1(qx) + ' ' + (YB - 15) + 'V' + (YB - 5); return; }
          if (s < 0) return;
          thick[tr.k] = 1;
          const [px, py] = bpt(tr), e = ease(s);
          const mx = (px + qx) / 2, my = Math.min(py, YB) - 90;
          const x = (1 - e) * (1 - e) * px + 2 * (1 - e) * e * mx + e * e * qx;
          const y = (1 - e) * (1 - e) * py + 2 * (1 - e) * e * my + e * e * (YB - 10);
          df += tick(x, y, lerp(tr.ang, tr.ang >= 0 ? Math.PI / 2 : -Math.PI / 2, e), lerp(3.5, 5, e));
        });
      }
      landTicks.setAttribute('d', dl); flyTicks.setAttribute('d', df);
      landTicks.setAttribute('opacity', fade.toFixed(2));
      rings.forEach((g, k) => g.setAttribute('stroke-width', thick[k] ? 4 : 2.2));
      const aG = ready ? clamp((u - TG0) / (TG1 - TG0 - 1)) : 0;
      clipR.setAttribute('width', f1((W + 4) * aG));
      graph.setAttribute('opacity', fade.toFixed(2));
      axis.setAttribute('opacity', (ready ? ease(clamp((u - TG0 + 0.6) / 0.6)) * fade : 0).toFixed(2));
      gLbl.setAttribute('opacity', (clamp((u - TG1 + 1.5) / 0.8) * fade).toFixed(2));
      if (oF) oF.style.visibility = u >= TG0 && u < CYCLE - 0.5 ? '' : 'hidden';
    }

    return {
      poster: 20.5,
      pausable: true,
      start() { started = true; },
      frame(t) {
        // Klatka przy wczytaniu strony (slajd niewidoczny): bez liczenia próbki.
        if (!started && !REDUCED && !PRINT) return;
        draw(t);
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
