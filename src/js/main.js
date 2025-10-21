(function () {
  // Data points in [0,10] x [0,10]
  let points = [
    { x: 2, y: 8 },
    { x: 4, y: 3 },
    { x: 9, y: 6 },
  ];

  // Animation/interaction state
  const state = {
    a: 0, // slope
    b: 0, // intercept
    path: [], // array of {a,b}
    timer: null,
    stepMs: 60,
    index: 0,
    paused: false,
  };

  // Utility: set canvas to be crisp on high-DPI displays while sizing from CSS
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 600;
    const cssHeight = canvas.clientHeight || 380;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: cssWidth, height: cssHeight, dpr };
  }

  function drawDataPlot(canvas, pts, current) {
    const { ctx, width, height } = setupCanvas(canvas);
  const pad = 36;
  const xmin = 0, xmax = 10;
  const ymin = 0, ymax = 10;

    const xToPx = (x) => pad + ((x - xmin) / (xmax - xmin)) * (width - 2 * pad);
    const yToPx = (y) => height - pad - ((y - ymin) / (ymax - ymin)) * (height - 2 * pad);

    // background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // axes frame
    ctx.strokeStyle = '#e5e7eb';
    ctx.strokeRect(pad, pad, width - 2 * pad, height - 2 * pad);

    // y = 0 line in red
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-red') || '#e11d48';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xToPx(xmin), yToPx(0));
    ctx.lineTo(xToPx(xmax), yToPx(0));
    ctx.stroke();

    // points
    for (const p of pts) {
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(xToPx(p.x), yToPx(p.y), 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // current fit line y = a x + b (if provided)
    const a = current?.a ?? 0;
    const b = current?.b ?? 0;
    ctx.strokeStyle = '#0ea5e9'; // cyan-ish
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xToPx(xmin), yToPx(a * xmin + b));
    ctx.lineTo(xToPx(xmax), yToPx(a * xmax + b));
    ctx.stroke();

  // minimal ticks (0 and 10)
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0', xToPx(0), height - pad + 6);
  ctx.fillText('10', xToPx(10), height - pad + 6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', pad - 6, yToPx(0));
  ctx.fillText('10', pad - 6, yToPx(10));
  }

  // Mean Squared Error for y = a x + b against points
  function mse(a, b, pts) {
    let sum = 0;
    for (const p of pts) {
      const err = a * p.x + b - p.y;
      sum += err * err;
    }
    return sum / pts.length;
  }

  function drawMSEContour(canvas, pts, current) {
    const { ctx, width, height, dpr } = setupCanvas(canvas);
    const pad = 40;

  // Parameter space bounds for (a, b) suited for [0,10] data
  const amin = -2.5, amax = 2.5; // slope
  const bmin = -5, bmax = 12;    // intercept

    const aToPx = (a) => pad + ((a - amin) / (amax - amin)) * (width - 2 * pad);
    const bToPx = (b) => height - pad - ((b - bmin) / (bmax - bmin)) * (height - 2 * pad);

    // background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.strokeStyle = '#e5e7eb';
    ctx.strokeRect(pad, pad, width - 2 * pad, height - 2 * pad);

  // Sample a grid of MSE values
    const nx = 120, ny = 120;
    const vals = new Float32Array(nx * ny);
    let vmin = Infinity, vmax = -Infinity;
    for (let j = 0; j < ny; j++) {
      const b = bmin + (j / (ny - 1)) * (bmax - bmin);
      for (let i = 0; i < nx; i++) {
        const a = amin + (i / (nx - 1)) * (amax - amin);
        const v = mse(a, b, pts);
        vals[j * nx + i] = v;
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
    }

  // Heatmap rendering (device-pixel correct)
  // putImageData ignores transforms, so we must use device-pixel dimensions and positions
  const iw = Math.max(1, Math.round((width - 2 * pad) * dpr));
  const ih = Math.max(1, Math.round((height - 2 * pad) * dpr));
  const img = ctx.createImageData(iw, ih);
    // Nonlinear color mapping to emphasize changes near the minimum
    // tLin in [0,1], then tColor = sqrt(tLin) => fast color changes near vmin
    for (let y = 0; y < ih; y++) {
      // Flip vertically so top of image corresponds to b = bmax
      const bj = (ih - 1 - y) / (ih - 1) * (ny - 1);
      const j0 = Math.floor(bj);
      const tj = bj - j0;
      for (let x = 0; x < iw; x++) {
        const ai = x / (iw - 1) * (nx - 1);
        const i0 = Math.floor(ai);
        const ti = ai - i0;
        // bilinear interpolation of grid values
        const i1 = Math.min(i0 + 1, nx - 1);
        const j1 = Math.min(j0 + 1, ny - 1);
        const v00 = vals[j0 * nx + i0];
        const v10 = vals[j0 * nx + i1];
        const v01 = vals[j1 * nx + i0];
        const v11 = vals[j1 * nx + i1];
        const v0 = v00 * (1 - ti) + v10 * ti;
        const v1 = v01 * (1 - ti) + v11 * ti;
        const v = v0 * (1 - tj) + v1 * tj;
        const tLin = (v - vmin) / (vmax - vmin + 1e-9);
        const t = Math.sqrt(Math.max(0, Math.min(1, tLin))); // accelerate near min
        const [r, g, b] = colormapPlasmaLite(t);
        const idx = (y * iw + x) * 4;
        img.data[idx + 0] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
  // place using device-pixel coords
  ctx.putImageData(img, Math.round(pad * dpr), Math.round(pad * dpr));

    // Optional: a few contour lines using marching squares on coarse grid
    drawContourLines(ctx, pad, pad, width - 2 * pad, height - 2 * pad,
      amin, amax, bmin, bmax, nx, ny, vals, vmin, vmax);

  // Draw the current point at (a,b)
  const ca = current?.a ?? 0;
  const cb = current?.b ?? 0;
  const px = aToPx(ca);
  const py = bToPx(cb);
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Minimal axis ticks for a and b
    ctx.fillStyle = '#374151';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(amin.toFixed(1), aToPx(amin), height - pad + 6);
    ctx.fillText(amax.toFixed(1), aToPx(amax), height - pad + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(bmin.toFixed(0), pad - 6, bToPx(bmin));
    ctx.fillText(bmax.toFixed(0), pad - 6, bToPx(bmax));
  }

  // Simple light-friendly plasma-like colormap (0..1 -> rgb)
  function colormapPlasmaLite(t) {
    // clamp
    t = Math.max(0, Math.min(1, t));
    // pastel-ish: interpolate between soft yellow -> pink -> purple
    const stops = [
      [255, 247, 174], // light yellow
      [255, 179, 186], // pink
      [197, 128, 222], // lavender
      [88,  80,  141], // deep violet
    ];
    const s = t * (stops.length - 1);
    const i = Math.floor(s);
    const f = s - i;
    const c0 = stops[i];
    const c1 = stops[Math.min(i + 1, stops.length - 1)];
    return [
      Math.round(c0[0] * (1 - f) + c1[0] * f),
      Math.round(c0[1] * (1 - f) + c1[1] * f),
      Math.round(c0[2] * (1 - f) + c1[2] * f),
    ];
  }

  // Minimal marching squares to draw a few contour lines
  function drawContourLines(ctx, x, y, w, h, amin, amax, bmin, bmax, nx, ny, vals, vmin, vmax) {
    // Many closely spaced levels near the minimum using a power schedule
    const levels = 24;
    const powK = 2.25; // >1 packs more near vmin
    const thresholds = Array.from({ length: levels }, (_, i) => {
      const t = Math.pow((i + 1) / (levels + 1), powK);
      return vmin + t * (vmax - vmin);
    });
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';

    const ax = (i) => x + (i / (nx - 1)) * w;
    const by = (j) => y + (1 - j / (ny - 1)) * h; // flip vertically

    for (const t of thresholds) {
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const v00 = vals[j * nx + i] - t;
          const v10 = vals[j * nx + (i + 1)] - t;
          const v01 = vals[(j + 1) * nx + i] - t;
          const v11 = vals[(j + 1) * nx + (i + 1)] - t;
          const code = (v00 > 0) | ((v10 > 0) << 1) | ((v11 > 0) << 2) | ((v01 > 0) << 3);
          if (code === 0 || code === 15) continue;

          // interpolate positions along edges
          const lerp = (a, b, t) => a + t * (b - a);
          const x0 = ax(i), x1 = ax(i + 1), y0 = by(j), y1 = by(j + 1);
          const e = [];
          if ((code & 1) !== (code & 2)) {
            const tt = v00 / (v00 - v10); // top edge
            e.push([lerp(x0, x1, tt), y0]);
          }
          if ((code & 2) !== (code & 4)) {
            const tt = v10 / (v10 - v11); // right edge
            e.push([x1, lerp(y0, y1, tt)]);
          }
          if ((code & 4) !== (code & 8)) {
            const tt = v11 / (v11 - v01); // bottom edge
            e.push([lerp(x0, x1, tt), y1]);
          }
          if ((code & 8) !== (code & 1)) {
            const tt = v01 / (v01 - v00); // left edge
            e.push([x0, lerp(y0, y1, tt)]);
          }
          if (e.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(e[0][0], e[0][1]);
            ctx.lineTo(e[1][0], e[1][1]);
            ctx.stroke();
          }
        }
      }
    }
  }

  // Draw both plots
  function renderAll() {
    const dataCanvas = document.getElementById('data-plot');
    const contourCanvas = document.getElementById('contour-plot');
    if (!dataCanvas || !contourCanvas) return;
    drawDataPlot(dataCanvas, points, { a: state.a, b: state.b });
    drawMSEContour(contourCanvas, points, { a: state.a, b: state.b });
  }

  // Initial draw and on resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAll, 100);
  });

  renderAll();

  // CSV parsing and animation
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const steps = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // Accept whitespace-separated only (two columns: b a)
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;
      const b = Number(parts[0]);
      const a = Number(parts[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      steps.push({ a, b });
    }
    return steps;
  }

  function stopAnimation() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function startAnimation(steps, msgEl) {
    stopAnimation();
    if (!steps.length) {
      msgEl.textContent = 'No valid rows found';
      return;
    }
    state.path = steps;
    state.index = 0;
    state.a = steps[0].a;
    state.b = steps[0].b;
    state.paused = false;
    renderAll();
    msgEl.textContent = `Animating ${steps.length} steps`;
    state.timer = setInterval(() => stepOnce(msgEl), state.stepMs);
  }

  function stepOnce(msgEl) {
    if (!state.path.length) return;
    state.index++;
    if (state.index >= state.path.length) {
      stopAnimation();
      msgEl.textContent = 'Animation complete';
      return;
    }
    const s = state.path[state.index];
    state.a = s.a;
    state.b = s.b;
    renderAll();
  }

  function setSpeedFromControl() {
    const speedInput = document.getElementById('speed-ms');
    if (!speedInput) return;
    const v = Number(speedInput.value);
    if (Number.isFinite(v) && v > 0) {
      state.stepMs = v;
      if (state.timer) {
        // restart interval with new speed
        const msgEl = document.getElementById('controls-message');
        clearInterval(state.timer);
        state.timer = setInterval(() => stepOnce(msgEl), state.stepMs);
      }
    }
  }

  // Wire up controls
  const runBtn = document.getElementById('run-animation');
  const textarea = document.getElementById('csv-params');
  const msgEl = document.getElementById('controls-message');
  const copyBtn = document.getElementById('copy-numpy');
  const pauseBtn = document.getElementById('pause-resume');
  const resetBtn = document.getElementById('reset');
  const speedInput = document.getElementById('speed-ms');
  const newPtsBtn = document.getElementById('new-points');
  if (runBtn && textarea && msgEl) {
    runBtn.addEventListener('click', () => {
      msgEl.textContent = '';
      if (/,/.test(textarea.value)) {
        msgEl.textContent = 'Detected commas — please separate columns with whitespace (b a).';
        return;
      }
      const steps = parseCSV(textarea.value);
      setSpeedFromControl();
      startAnimation(steps, msgEl);
    });
  }

  function buildNumpySnippet(pts) {
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const fmt = (arr) => '[' + arr.map(v => (Number.isInteger(v) ? v : (+v).toFixed(6).replace(/0+$/,'').replace(/\.$/,'') )).join(', ') + ']';
    const xPy = fmt(xs);
    const yPy = fmt(ys);
  return `import numpy as np

# Data from the current plot
x = np.array(${xPy}, dtype=float)
y = np.array(${yPy}, dtype=float)

def mse_grad(a, b, x, y):
    """
    Mean squared error: (1/n) * sum_i (a*x_i + b - y_i)**2
    Returns column vector grad = [[db],[da]] with respect to intercept b and slope a.
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    n = x.shape[0]
    r = a * x + b - y  # residuals
    db = (2.0 / n) * np.sum(r)
    da = (2.0 / n) * np.sum(x * r)
    return np.array([[db], [da]], dtype=float)

# Example usage
# a, b = 0.0, 0.0
# lr = 0.05
# for _ in range(20):
#     grad = mse_grad(a, b, x, y)  # shape (2,1)
#     b -= lr * grad[0, 0]
#     a -= lr * grad[1, 0]
#     print(b, a)
`;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  if (copyBtn && msgEl) {
    copyBtn.addEventListener('click', async () => {
      try {
        const snippet = buildNumpySnippet(points);
        await copyToClipboard(snippet);
        msgEl.textContent = 'Copied NumPy gradient snippet';
      } catch (e) {
        msgEl.textContent = 'Unable to copy: ' + (e?.message || 'unknown error');
      }
    });
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateRandomPoints() {
    // three random integer points in [0,10] x [0,10]
    const pts = [];
    for (let i = 0; i < 3; i++) {
      pts.push({ x: randomInt(0, 10), y: randomInt(0, 10) });
    }
    return pts;
  }

  if (newPtsBtn && msgEl) {
    newPtsBtn.addEventListener('click', () => {
      stopAnimation();
      state.a = 0; state.b = 0; state.index = 0; state.path = [];
      points = generateRandomPoints();
      renderAll();
      const desc = points.map(p => `(${p.x}, ${p.y})`).join('  ');
      msgEl.textContent = `New points: ${desc}`;
      // Reset pause button label if needed
      pauseBtn && (pauseBtn.textContent = 'Pause');
    });
  }

  if (pauseBtn && msgEl) {
    pauseBtn.addEventListener('click', () => {
      if (!state.path.length) {
        msgEl.textContent = 'Nothing to pause';
        return;
      }
      if (state.timer) {
        // pause
        clearInterval(state.timer);
        state.timer = null;
        state.paused = true;
        pauseBtn.textContent = 'Resume';
        msgEl.textContent = `Paused at step ${state.index + 1}/${state.path.length}`;
      } else {
        // resume
        state.paused = false;
        pauseBtn.textContent = 'Pause';
        state.timer = setInterval(() => stepOnce(msgEl), state.stepMs);
        msgEl.textContent = 'Animating…';
      }
    });
  }

  if (resetBtn && msgEl) {
    resetBtn.addEventListener('click', () => {
      if (!state.path.length) {
        // Reset to origin if no path
        stopAnimation();
        state.index = 0;
        state.a = 0; state.b = 0;
        renderAll();
        pauseBtn && (pauseBtn.textContent = 'Pause');
        msgEl.textContent = 'Reset to (0,0)';
        return;
      }
      stopAnimation();
      state.index = 0;
      state.a = state.path[0].a;
      state.b = state.path[0].b;
      renderAll();
      pauseBtn && (pauseBtn.textContent = 'Pause');
      msgEl.textContent = 'Reset to first step';
    });
  }

  if (speedInput) {
    speedInput.addEventListener('input', () => {
      setSpeedFromControl();
    });
  }
})();
