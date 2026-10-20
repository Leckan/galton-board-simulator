import { binomialDistribution, createRandom, theoreticalMoments } from './probability.js';
import { summarizeCounts } from './statistics.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#board-canvas');
const boardContext = canvas.getContext('2d');
const chartCanvas = $('#distribution-canvas');
const chartContext = chartCanvas.getContext('2d');
const reducedMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const COLORS = ['#c7f36b', '#78e0c3', '#ff997c', '#91a8ff'];
const SPEEDS = { 1: 0.63, 2: 1, 3: 1.65 };
const DEFAULTS = { rows: 12, pLeft: 0.5, rate: 12, speed: 2, radius: 4, gravity: 1, bounce: 0.6, spread: 1, maxAnimated: 180, reducedMotion: reducedMotionPreference.matches };
const state = {
  config: { ...DEFAULTS }, counts: Array(DEFAULTS.rows + 1).fill(0), released: 0, landed: 0, balls: [],
  seed: $('#seed-input').value, nextBallId: 1, symmetric: true, continuous: false, paused: false,
  continuousRecord: null, runs: new Map(), fastMode: false, unit: 'count', lastMode: 'ANIMATED MODE', lastFrame: 0, spawnAccumulator: 0,
  lastUiPaint: 0, lastChartPaint: 0, history: loadHistory(), toastTimer: 0, chartHover: null,
};
let currentChartLayout = null;

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem('galton-lab-history') || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch { return []; }
}
function persistHistory() {
  try { localStorage.setItem('galton-lab-history', JSON.stringify(state.history.slice(0, 8))); }
  catch { showToast('Could not save notebook in this browser.'); }
}
function pRight() { return 1 - state.config.pLeft; }
function color(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function formatNumber(value, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
function formatInteger(value) { return new Intl.NumberFormat().format(value); }
function safeLabel(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function updateRangeFill(input) {
  const percent = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
  input.style.setProperty('--range-fill', `${percent}%`);
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}
function announce(message) { $('#announcer').textContent = ''; requestAnimationFrame(() => { $('#announcer').textContent = message; }); }

function getBoardGeometry() {
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 460;
  const { rows, spread } = state.config;
  const top = 28;
  const binTop = height - 42;
  const step = Math.max(8, (binTop - top - 20) / rows);
  const baseSpacing = Math.min(25, (width - 48) / ((rows + 1) * 1.4));
  return { width, height, top, binTop, step, spacing: baseSpacing * spread, center: width / 2, floor: height - 12 };
}
function sizeCanvas(target, ctx) {
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (target.width !== w || target.height !== h) { target.width = w; target.height = h; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function resizeCanvases() {
  sizeCanvas(canvas, boardContext); sizeCanvas(chartCanvas, chartContext);
  drawBoard(); drawDistribution();
}

function drawBoard() {
  const g = getBoardGeometry();
  const ctx = boardContext;
  const { rows, radius, bounce } = state.config;
  const surfaceLine = color('--line-strong');
  const muted = color('--muted');
  const lime = color('--lime');
  const text = color('--text');
  const dim = color('--dim');
  ctx.clearRect(0, 0, g.width, g.height);

  // A restrained centerline and light board rails keep the triangular geometry legible.
  ctx.save();
  ctx.setLineDash([2, 6]); ctx.strokeStyle = color('--line'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(g.center, g.top - 5); ctx.lineTo(g.center, g.binTop - 1); ctx.stroke();
  ctx.setLineDash([]);
  const edge = (rows * g.spacing) / 2 + g.spacing * 0.8;
  const railGradient = ctx.createLinearGradient(0, 0, 0, g.binTop);
  railGradient.addColorStop(0, 'transparent'); railGradient.addColorStop(.2, surfaceLine); railGradient.addColorStop(1, surfaceLine);
  ctx.strokeStyle = railGradient; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(g.center - edge, g.top + 16); ctx.lineTo(g.center - edge, g.binTop - 4); ctx.moveTo(g.center + edge, g.top + 16); ctx.lineTo(g.center + edge, g.binTop - 4); ctx.stroke();

  // Bin walls and a small count bar make the collection state visible on the board itself.
  const binWidth = g.spacing;
  const maxCount = Math.max(1, ...state.counts);
  const barMax = Math.max(7, Math.min(24, g.floor - g.binTop - 15));
  for (let bin = 0; bin <= rows; bin++) {
    const x = g.center + (bin - rows / 2) * g.spacing;
    const left = x - binWidth / 2;
    if (bin < rows) {
      ctx.strokeStyle = color('--line-strong'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left + binWidth, g.binTop); ctx.lineTo(left + binWidth, g.floor); ctx.stroke();
    }
    const count = state.counts[bin] || 0;
    if (count > 0) {
      const barHeight = Math.max(2, (count / maxCount) * barMax);
      ctx.globalAlpha = .34; ctx.fillStyle = lime;
      ctx.fillRect(left + 2, g.floor - barHeight, Math.max(1, binWidth - 4), barHeight); ctx.globalAlpha = 1;
      ctx.fillStyle = muted; ctx.font = '8px "DM Mono", monospace'; ctx.textAlign = 'center';
      if (binWidth > 16) ctx.fillText(count > 9999 ? `${(count / 1000).toFixed(0)}k` : String(count), x, g.floor - barHeight - 4);
    }
  }
  const first = g.center - (rows / 2 + 0.5) * g.spacing;
  const last = g.center + (rows / 2 + 0.5) * g.spacing;
  ctx.strokeStyle = surfaceLine; ctx.beginPath(); ctx.moveTo(first, g.binTop); ctx.lineTo(first, g.floor); ctx.moveTo(last, g.binTop); ctx.lineTo(last, g.floor); ctx.moveTo(first, g.floor); ctx.lineTo(last, g.floor); ctx.stroke();

  // Peg lattice. Pegs are drawn before balls so the trajectories pass in front of them.
  for (let row = 0; row < rows; row++) {
    const y = g.top + (row + 0.45) * g.step;
    for (let col = 0; col <= row; col++) {
      const x = g.center + (col - row / 2) * g.spacing;
      ctx.beginPath(); ctx.arc(x, y, 4.1, 0, Math.PI * 2);
      ctx.fillStyle = color('--surface-3'); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.56)'; ctx.fill();
    }
  }
  // Outlet marker.
  ctx.strokeStyle = color('--lime'); ctx.globalAlpha = .58; ctx.beginPath(); ctx.arc(g.center, g.top - 2, 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;

  for (const ball of state.balls) {
    let x, y;
    if (ball.row < rows) {
      const progress = Math.min(1, ball.progress);
      const currentX = g.center + (ball.rightTurns - ball.row / 2) * g.spacing;
      const decision = ball.nextRight ?? 0;
      const targetX = g.center + (ball.rightTurns + decision - (ball.row + 1) / 2) * g.spacing;
      const deflection = ball.collided ? smoothstep((progress - .45) / .55) : 0;
      const sign = decision ? 1 : -1;
      const littleBounce = Math.sin(deflection * Math.PI) * g.spacing * bounce * .06 * sign;
      x = currentX + (targetX - currentX) * deflection + littleBounce;
      y = g.top + (ball.row + progress) * g.step - Math.sin(deflection * Math.PI) * bounce * 1.5;
    } else {
      const binX = g.center + (ball.rightTurns - rows / 2) * g.spacing;
      x = binX; y = g.top + rows * g.step + ball.progress * (g.binTop + 16 - (g.top + rows * g.step));
    }
    const ballColor = COLORS[ball.id % COLORS.length];
    const r = radius * Math.max(.82, Math.min(1.08, g.spacing / 20));
    ctx.shadowColor = ballColor; ctx.shadowBlur = r * 3.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = ballColor; ctx.fill();
    ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(x - r * .27, y - r * .3, r * .28, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
  }
  ctx.restore();
}
function smoothstep(value) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }

function metricValue(value) { return value === null ? '—' : formatNumber(value); }
function updateInterface() {
  const config = state.config;
  const stats = summarizeCounts(state.counts);
  const theory = theoreticalMoments(config.rows, pRight());
  const moving = state.balls.length;
  $('#rows-value').textContent = config.rows;
  $('#rows-meta').textContent = config.rows;
  $('#bins-meta').textContent = config.rows + 1;
  $('#rate-value').textContent = `${config.rate} / sec`;
  $('#probability-value').textContent = `${Math.round(config.pLeft * 100)}%`;
  $('#left-prob-label').textContent = `${Math.round(config.pLeft * 100)}% LEFT`;
  $('#right-prob-label').textContent = `${Math.round(pRight() * 100)}% RIGHT`;
  $('#symmetric-toggle').setAttribute('aria-pressed', String(state.symmetric));
  $('#probability-input').disabled = state.symmetric;
  const biased = Math.abs(config.pLeft - .5) >= 1e-9;
  $('#bias-note').classList.toggle('biased', biased);
  $('#bias-note').innerHTML = biased
    ? `<span>↗</span> Biased right. The peak shifts toward bin ${formatNumber(config.rows * pRight(), 1)}.`
    : '<span>↔</span> Equal odds. The distribution stays centered.';
  $('#speed-value').textContent = ['Slow', 'Normal', 'Fast'][config.speed - 1];
  $('#size-value').textContent = `${config.radius} px`;
  $('#gravity-value').textContent = `${config.gravity.toFixed(1)}×`;
  $('#bounce-value').textContent = `${config.bounce.toFixed(1)}×`;
  $('#spread-value').textContent = `${config.spread.toFixed(1)}×`;
  $('#max-value').textContent = config.maxAnimated;
  $('#reduced-motion').checked = config.reducedMotion;
  $('#stat-released').textContent = formatInteger(state.released);
  $('#stat-landed').textContent = formatInteger(state.landed);
  $('#stat-moving').textContent = formatInteger(moving);
  $('#board-live-count').textContent = `${formatInteger(moving)} ${moving === 1 ? 'ball' : 'balls'} in motion`;
  $('#stat-mean').textContent = metricValue(stats.mean);
  $('#stat-median').textContent = metricValue(stats.median);
  $('#stat-sd').textContent = metricValue(stats.standardDeviation);
  $('#stat-variance').textContent = metricValue(stats.variance);
  $('#stat-mode').textContent = stats.mode === null ? '—' : String(stats.mode);
  $('#stat-mode-caption').textContent = stats.mode === null ? 'awaiting first landing' : `${formatInteger(state.counts[stats.mode])} balls · ${stats.total ? formatNumber(state.counts[stats.mode] / stats.total * 100, 1) : '0.0'}%`;
  $('#stat-range').textContent = stats.min === null ? '—' : `${stats.min}–${stats.max}`;
  $('#theory-mean').textContent = formatNumber(theory.mean);
  $('#theory-sd').textContent = formatNumber(theory.standardDeviation);
  $('#observed-total').textContent = formatInteger(state.landed);
  $('#chart-note').textContent = `n = ${config.rows} · p(right) = ${pRight().toFixed(2)}`;
  $('#equation-n').textContent = config.rows;
  $('#equation-p').textContent = pRight().toFixed(2);
  $('#insight-mu').textContent = formatNumber(theory.mean);
  $('#insight-var').textContent = formatNumber(theory.variance);
  $('#insight-copy').textContent = biased
    ? `A right-turn chance of ${Math.round(pRight() * 100)}% moves the peak toward larger bin numbers. The expected position is ${formatNumber(theory.mean)}.`
    : 'Each ball makes an independent decision at every row. With equal odds, the most likely outcome is near the center.';
  const percentage = state.released === 0 ? 0 : Math.min(100, state.landed / state.released * 100);
  $('#progress-value').textContent = `${Math.round(percentage)}%`;
  $('#progress-bar').style.width = `${percentage}%`;
  $('#status-orb').classList.toggle('running', state.continuous || moving > 0 && !state.paused);
  $('#status-orb').classList.toggle('paused', state.paused);
  $('#run-status-label').textContent = state.paused ? 'PAUSED' : state.continuous ? 'CONTINUOUS RUN' : moving ? 'BALLS IN MOTION' : 'READY TO RUN';
  $('#continuous-button').classList.toggle('active', state.continuous);
  $('#continuous-button').setAttribute('aria-pressed', String(state.continuous));
  $('#pause-button').disabled = !state.continuous && moving === 0;
  $('#pause-button').textContent = state.paused ? '▶ Resume' : 'Ⅱ Pause';
  $('#fast-toggle').classList.toggle('fast-on', state.fastMode);
  $('#fast-toggle').setAttribute('aria-pressed', String(state.fastMode));
  $('#simulation-mode').textContent = state.lastMode;
  $('#fast-toggle').textContent = state.fastMode ? '⚡ Fast run ON' : '⚡ Fast run';
  $('#canvas-hint').classList.toggle('hidden', state.released > 0);
  const rangeInputs = ['rows-input', 'rate-input', 'probability-input', 'speed-input', 'size-input', 'gravity-input', 'bounce-input', 'spread-input', 'max-input'];
  rangeInputs.forEach((id) => updateRangeFill($(`#${id}`)));
  drawMiniDistribution();
  renderBinText();
  drawBoard();
}

function drawMiniDistribution() {
  const root = $('#insight-chart');
  const probabilities = binomialDistribution(state.config.rows, pRight());
  const max = Math.max(...probabilities, 1e-12);
  const mode = Math.floor((state.config.rows + 1) * pRight());
  root.innerHTML = probabilities.map((probability, bin) => `<span class="mini-bar ${bin === mode ? 'mode' : ''}" style="--height:${Math.max(2, probability / max * 78)}%" title="Bin ${bin}: ${(probability * 100).toFixed(2)}%"></span>`).join('');
}
function renderBinText() {
  const total = state.landed;
  $('#bin-text-summary').textContent = state.counts.map((count, bin) => `${bin}: ${formatInteger(count)}${total ? ` (${(count / total * 100).toFixed(1)}%)` : ''}`).join('  ·  ');
}
function chartMetric(count, total) {
  if (state.unit === 'relative') return total ? count / total : 0;
  if (state.unit === 'percent') return total ? count / total * 100 : 0;
  return count;
}
function chartTheoretical(probability, total) {
  if (state.unit === 'relative') return probability;
  if (state.unit === 'percent') return probability * 100;
  return probability * (total || 100);
}
function drawDistribution() {
  const ctx = chartContext;
  const width = chartCanvas.clientWidth;
  const height = chartCanvas.clientHeight;
  if (!width || !height) return;
  sizeCanvas(chartCanvas, ctx);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const { rows } = state.config;
  const pad = { left: 37, right: 12, top: 10, bottom: 26 };
  const plot = { left: pad.left, top: pad.top, width: width - pad.left - pad.right, height: height - pad.top - pad.bottom };
  const probs = binomialDistribution(rows, pRight());
  const baseline = state.landed || 100;
  const empirical = state.counts.map((count) => chartMetric(count, state.landed));
  const expected = probs.map((p) => chartTheoretical(p, baseline));
  const highestCount = Math.max(0, ...state.counts);
  const empiricalMode = highestCount ? state.counts.indexOf(highestCount) : -1;
  const maxValue = Math.max(1, ...empirical, ...expected) * 1.17;
  const slot = plot.width / (rows + 1);
  const maxTicks = 4;
  const foreground = color('--text');
  const muted = color('--muted');
  const dim = color('--dim');
  const lime = color('--lime');
  const coral = color('--coral');
  ctx.clearRect(0, 0, width, height);
  ctx.font = '8px "DM Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = color('--line'); ctx.lineWidth = 1;
  for (let tick = 0; tick <= maxTicks; tick++) {
    const y = plot.top + plot.height - plot.height * tick / maxTicks;
    ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.left + plot.width, y); ctx.stroke();
    const value = maxValue * tick / maxTicks;
    let label = state.unit === 'count' ? formatInteger(Math.round(value)) : state.unit === 'percent' ? `${value.toFixed(0)}%` : value.toFixed(2);
    ctx.fillStyle = dim; ctx.fillText(label, plot.left - 6, y);
  }
  const barWidth = Math.min(21, slot * .58);
  for (let bin = 0; bin <= rows; bin++) {
    const cx = plot.left + (bin + .5) * slot;
    const value = empirical[bin];
    const barHeight = value / maxValue * plot.height;
    if (barHeight > 0) {
      ctx.fillStyle = bin === empiricalMode ? color('--mint') : lime; ctx.globalAlpha = .9;
      roundedRect(ctx, cx - barWidth / 2, plot.top + plot.height - barHeight, barWidth, barHeight, 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (rows <= 14 || bin % 2 === 0 || bin === rows) {
      ctx.fillStyle = bin === state.config.rows * pRight() ? foreground : muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(bin), cx, plot.top + plot.height + 7);
    }
  }
  // The theoretical binomial values use the same display units as the empirical bars.
  ctx.strokeStyle = coral; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath();
  expected.forEach((value, bin) => {
    const x = plot.left + (bin + .5) * slot;
    const y = plot.top + plot.height - (value / maxValue * plot.height);
    if (!bin) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke(); ctx.setLineDash([]);
  expected.forEach((value, bin) => {
    const x = plot.left + (bin + .5) * slot;
    const y = plot.top + plot.height - (value / maxValue * plot.height);
    ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fillStyle = coral; ctx.fill();
  });
  currentChartLayout = { plot, slot, probs, expected, empirical, maxValue, width, height, ratio };
}
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}
function showChartTooltip(event) {
  if (!currentChartLayout) return;
  const rect = chartCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { plot, slot, probs } = currentChartLayout;
  const bin = Math.floor((x - plot.left) / slot);
  if (bin < 0 || bin >= state.counts.length) { $('#chart-tooltip').classList.remove('show'); return; }
  const count = state.counts[bin];
  const expectedCount = probs[bin] * (state.landed || 100);
  const percent = state.landed ? count / state.landed * 100 : 0;
  const tooltip = $('#chart-tooltip');
  tooltip.innerHTML = `<b>BIN ${bin}</b><br />Observed: ${formatInteger(count)} (${percent.toFixed(1)}%)<br />Expected: ${formatNumber(expectedCount, 1)}`;
  tooltip.style.left = `${Math.min(rect.width - 136, Math.max(5, x + 10))}px`;
  tooltip.style.top = `${Math.max(4, event.clientY - rect.top - 53)}px`;
  tooltip.classList.add('show');
  state.chartHover = bin;
}

function createRun(amount, title = 'Experiment') {
  return { id: `run-${Date.now()}-${state.nextBallId}`, label: title, rows: state.config.rows, pRight: pRight(), seed: state.seed,
    target: amount, released: 0, landed: 0, counts: Array(state.config.rows + 1).fill(0), saved: false };
}
function createAnimatedBall(run) {
  const id = state.nextBallId++;
  const ballRandom = createRandom(`${state.seed}:${id}`);
  state.balls.push({ id, runId: run.id, row: 0, rightTurns: 0, nextRight: null, collided: false, progress: 0, random: ballRandom });
  run.released++;
}
function sampleOne(rows, probability, random) {
  let right = 0;
  for (let i = 0; i < rows; i++) if (random() < probability) right++;
  return right;
}
function addDirectOutcomes(run, amount) {
  for (let i = 0; i < amount; i++) {
    const id = state.nextBallId++;
    const bin = sampleOne(run.rows, run.pRight, createRandom(`${run.seed}:${id}`));
    run.counts[bin]++;
    run.landed++;
    state.counts[bin]++;
    state.landed++;
    run.released++;
  }
}
function saveRun(run) {
  if (!run || run.saved || run.landed < run.target) return;
  run.saved = true;
  const stats = summarizeCounts(run.counts);
  const entry = {
    id: run.id, label: run.label, rows: run.rows, pRight: run.pRight, seed: run.seed,
    amount: run.target, counts: [...run.counts], stats, createdAt: new Date().toISOString(),
  };
  state.history.unshift(entry); state.history = state.history.slice(0, 8); persistHistory(); renderHistory();
  announce(`${run.label} complete: ${formatInteger(run.target)} balls, mean bin ${formatNumber(stats.mean)}.`);
}
function handleOutcome(ball, bin) {
  const run = state.runs?.get(ball.runId);
  state.counts[bin]++; state.landed++;
  if (run) {
    run.counts[bin]++; run.landed++;
    if (run.target !== Infinity) saveRun(run);
  }
}
function completeContinuousIfReady() {
  const run = state.continuousRecord;
  if (!run || !run.finishRequested || state.balls.some((ball) => ball.runId === run.id)) return;
  if (run.landed > 0) {
    const stats = summarizeCounts(run.counts);
    state.history.unshift({ id: run.id, label: 'Continuous run', rows: run.rows, pRight: run.pRight, seed: run.seed,
      amount: run.landed, counts: [...run.counts], stats, createdAt: new Date().toISOString() });
    state.history = state.history.slice(0, 8); persistHistory(); renderHistory();
  }
  state.runs?.delete(run.id); state.continuousRecord = null;
}
function runSample(amount, { fast = false, label = 'Experiment' } = {}) {
  const n = Math.max(0, Math.min(100000, Math.floor(amount)));
  if (!n) return;
  if (state.continuous) stopContinuous();
  const run = createRun(n, label);
  state.runs ??= new Map(); state.runs.set(run.id, run);
  const canAnimate = !fast && !state.fastMode && !state.config.reducedMotion;
  const animated = canAnimate ? Math.min(n, Math.max(0, state.config.maxAnimated - state.balls.length)) : 0;
  const direct = n - animated;
  state.released += n;
  for (let i = 0; i < animated; i++) createAnimatedBall(run);
  if (direct) addDirectOutcomes(run, direct);
  state.lastMode = fast || state.fastMode || !animated ? 'ACCELERATED MODE' : direct ? 'MIXED · FAST BATCH' : 'ANIMATED MODE';
  $('#canvas-hint').classList.add('hidden');
  $('#status-orb').classList.add('running');
  saveRun(run);
  renderAll();
  if (fast || direct) showToast(direct ? `${formatInteger(direct)} outcome${direct === 1 ? '' : 's'} calculated instantly.` : 'Fast statistical run complete.');
}
function releaseContinuousBall() {
  if (state.balls.length >= state.config.maxAnimated) return false;
  const run = state.continuousRecord;
  const id = state.nextBallId++;
  const ballRandom = createRandom(`${state.seed}:${id}`);
  state.balls.push({ id, runId: run.id, row: 0, rightTurns: 0, nextRight: null, collided: false, progress: 0, random: ballRandom });
  run.released++; state.released++;
  return true;
}
function startContinuous() {
  if (state.config.reducedMotion) {
    showToast('Turn off reduced motion to use continuous animation.'); return;
  }
  state.continuous = true; state.paused = false; state.spawnAccumulator = 0;
  const run = { id: `continuous-${Date.now()}-${state.nextBallId}`, label: 'Continuous run', rows: state.config.rows,
    pRight: pRight(), seed: state.seed, target: Infinity, released: 0, landed: 0, counts: Array(state.config.rows + 1).fill(0), finishRequested: false };
  state.runs ??= new Map(); state.runs.set(run.id, run); state.continuousRecord = run;
  state.lastMode = 'ANIMATED MODE'; $('#canvas-hint').classList.add('hidden');
  renderAll(); announce('Continuous simulation started.');
}
function stopContinuous() {
  state.continuous = false;
  if (state.continuousRecord) state.continuousRecord.finishRequested = true;
  completeContinuousIfReady();
  renderAll();
}
function clearSimulation({ keepConfig = true } = {}) {
  state.balls = []; state.counts = Array(state.config.rows + 1).fill(0); state.released = 0; state.landed = 0;
  state.continuous = false; state.paused = false; state.continuousRecord = null; state.runs = new Map(); state.spawnAccumulator = 0;
  state.nextBallId = 1;
  state.lastMode = 'ANIMATED MODE';
  if (!keepConfig) {
    state.config = { ...DEFAULTS };
    state.symmetric = true;
    state.fastMode = false;
    $('#rows-input').value = DEFAULTS.rows;
    $('#rate-input').value = DEFAULTS.rate;
    $('#probability-input').value = DEFAULTS.pLeft * 100;
    $('#speed-input').value = DEFAULTS.speed;
    $('#size-input').value = DEFAULTS.radius;
    $('#gravity-input').value = DEFAULTS.gravity * 10;
    $('#bounce-input').value = DEFAULTS.bounce * 10;
    $('#spread-input').value = DEFAULTS.spread * 10;
    $('#max-input').value = DEFAULTS.maxAnimated;
    $('#reduced-motion').checked = DEFAULTS.reducedMotion;
  }
  renderAll();
  if (keepConfig) showToast('Accumulated statistics cleared.');
}
function changeProbability(pLeft, isSymmetric = false) {
  const value = Math.min(1, Math.max(0, pLeft));
  if (Math.abs(state.config.pLeft - value) < 1e-9 && state.symmetric === isSymmetric) return;
  state.config.pLeft = value;
  state.symmetric = isSymmetric;
  clearSimulation();
  $('#probability-input').value = String(Math.round(value * 100));
  showToast('Probability changed; the current run was reset.');
}

function advance(time) {
  if (!state.lastFrame) state.lastFrame = time;
  const dt = Math.min(.05, Math.max(0, (time - state.lastFrame) / 1000));
  state.lastFrame = time;
  if (!state.paused) {
    if (state.continuous) {
      state.spawnAccumulator += dt * state.config.rate;
      while (state.spawnAccumulator >= 1 && state.balls.length < state.config.maxAnimated) {
        if (releaseContinuousBall()) state.spawnAccumulator -= 1;
        else break;
      }
      if (state.balls.length >= state.config.maxAnimated) state.spawnAccumulator = 0;
    }
    const speed = SPEEDS[state.config.speed] * Math.sqrt(state.config.gravity) * state.config.rows / 1.3;
    for (let index = state.balls.length - 1; index >= 0; index--) {
      const ball = state.balls[index];
      ball.progress += dt * speed;
      while (true) {
        // Make exactly one probability decision when this ball reaches the current peg row.
        if (ball.row < state.config.rows && !ball.collided && ball.progress >= .45) {
          ball.nextRight = ball.random() < pRight() ? 1 : 0;
          ball.collided = true;
        }
        if (ball.progress < 1) break;
        ball.progress -= 1;
        if (ball.row < state.config.rows) {
          ball.rightTurns += ball.nextRight ?? 0;
          ball.row++;
          ball.nextRight = null;
          ball.collided = false;
        } else {
          const bin = ball.rightTurns;
          handleOutcome(ball, bin);
          state.balls.splice(index, 1);
          break;
        }
      }
    }
    completeContinuousIfReady();
  }
  drawBoard();
  if (time - state.lastUiPaint > 110) { updateInterface(); state.lastUiPaint = time; }
  if (time - state.lastChartPaint > 260 && state.landed) { drawDistribution(); state.lastChartPaint = time; }
  requestAnimationFrame(advance);
}
function renderAll() {
  updateInterface(); drawDistribution(); renderHistory();
  state.lastUiPaint = performance.now(); state.lastChartPaint = performance.now();
}

function makeDownload(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  const probabilities = binomialDistribution(state.config.rows, pRight());
  const rows = [['bin', 'observed_count', 'observed_percent', 'expected_probability', 'expected_count']];
  state.counts.forEach((count, bin) => rows.push([bin, count, state.landed ? (count / state.landed * 100).toFixed(4) : '0', probabilities[bin].toFixed(8), (probabilities[bin] * state.landed).toFixed(4)]));
  makeDownload(`galton-lab-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => row.join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('Bin counts exported as CSV.');
}
function exportJson() {
  const stats = summarizeCounts(state.counts);
  const result = { application: 'Galton Lab', exportedAt: new Date().toISOString(), seed: state.seed,
    configuration: { rows: state.config.rows, pLeft: state.config.pLeft, pRight: pRight() }, released: state.released, landed: state.landed,
    airborne: state.balls.length, statistics: stats, binCounts: state.counts, history: state.history };
  makeDownload(`galton-lab-summary-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(result, null, 2), 'application/json');
  showToast('Summary exported as JSON.');
}
function exportChart() {
  drawDistribution();
  chartCanvas.toBlob((blob) => {
    if (!blob) { showToast('Chart image could not be created.'); return; }
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
    link.download = `galton-lab-distribution-${new Date().toISOString().slice(0, 10)}.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('Distribution chart exported as PNG.');
  });
}
function renderHistory() {
  const host = $('#history-list');
  if (!state.history.length) {
    host.innerHTML = '<div class="history-empty"><span>↳</span><p>Your completed experiments<br />will appear here.</p></div>';
  } else {
    host.innerHTML = state.history.slice(0, 4).map((entry, index) => {
      const date = new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `<div class="history-row"><strong>${safeLabel(entry.label || 'Experiment')}</strong><span>${entry.rows} rows · ${formatInteger(entry.amount)} balls · μ ${formatNumber(entry.stats?.mean)} · ${date}</span><button type="button" data-rerun="${index}">Re-run</button></div>`;
    }).join('');
  }
  const compare = $('#compare-content');
  if (state.history.length < 2) compare.textContent = 'Run two experiments to compare their means and spreads.';
  else {
    const [a, b] = state.history;
    const aStats = a.stats || summarizeCounts(a.counts);
    const bStats = b.stats || summarizeCounts(b.counts);
    compare.innerHTML = `${safeLabel(a.label)}: μ <b>${formatNumber(aStats.mean)}</b>, σ <b>${formatNumber(aStats.standardDeviation)}</b><br />${safeLabel(b.label)}: μ <b>${formatNumber(bStats.mean)}</b>, σ <b>${formatNumber(bStats.standardDeviation)}</b>`;
  }
}

const lessons = {
  randomness: { index: 'EXPERIMENT 01', title: 'Same rules. Different paths.', text: 'Every ball takes its own sequence of left and right turns. A small sample can look lopsided even when each turn is perfectly fair—that’s randomness doing its thing.', try: 'Drop 20 balls. How different do the two halves look?', button: 'Drop 20 balls', action: () => runSample(20, { label: 'Randomness · 20 balls' }) },
  'large-numbers': { index: 'EXPERIMENT 02', title: 'More trials, steadier proportions.', text: 'The law of large numbers says that as the number of independent observations grows, the observed proportions tend to settle near their probabilities. Individual turns remain random.', try: 'Run 1,000 balls and compare the bars to the coral reference.', button: 'Run 1,000 fast', action: () => runSample(1000, { fast: true, label: 'Law of large numbers' }) },
  binomial: { index: 'EXPERIMENT 03', title: 'A bin is a count of right turns.', text: 'With n independent rows and right-turn chance p, the number of right turns X follows Binomial(n, p). The binomial model predicts the chance of landing in every bin.', try: 'Set 10 rows, then watch the empirical bars follow the model.', button: 'Run 500 outcomes', action: () => { configureForExperiment({ rows: 10, pLeft: .5 }); runSample(500, { fast: true, label: 'Binomial distribution' }); } },
  normal: { index: 'EXPERIMENT 04', title: 'A bell curve emerges.', text: 'When n is large and neither outcome is very rare, a binomial distribution is well approximated by a normal curve centered at np, with spread √(np(1−p)).', try: 'Try 20 rows with fair odds; the theoretical bars trace a bell shape.', button: 'Run 10,000 fast', action: () => { configureForExperiment({ rows: 20, pLeft: .5 }); runSample(10000, { fast: true, label: 'Normal approximation' }); } },
  bias: { index: 'EXPERIMENT 05', title: 'Tip one side of the scale.', text: 'Changing the chance of a right turn shifts the expected bin, E[X] = np. The shape stays binomial, but it becomes skewed toward the more likely direction.', try: 'Give right turns a 70% chance and watch the peak move right.', button: 'Try 70% right', action: () => { configureForExperiment({ rows: 12, pLeft: .3 }); runSample(1000, { fast: true, label: 'Biased probability · 70% right' }); } },
  clt: { index: 'EXPERIMENT 06', title: 'Many small chances, one smooth shape.', text: 'The central limit theorem explains why sums of many independent, finite-variance random choices often look approximately normal. Here, the binomial count of turns approaches that bell shape as rows increase.', try: 'Use 20 rows and compare the large sample with its expected distribution.', button: 'Run 25,000 fast', action: () => { configureForExperiment({ rows: 20, pLeft: .5 }); runSample(25000, { fast: true, label: 'Central limit theorem' }); } },
};
function selectLesson(name) {
  document.querySelectorAll('.lesson-tab').forEach((tab) => {
    const active = tab.dataset.lesson === name;
    tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active));
  });
  const lesson = lessons[name];
  $('#lesson-content').innerHTML = `<div class="lesson-index">${lesson.index} <span>·</span> ${safeLabel(name.replace('-', ' ').toUpperCase())}</div><h3>${lesson.title}</h3><p>${lesson.text}</p><div class="lesson-action"><span>TRY THIS</span><b>${lesson.try}</b><button id="lesson-action-button">${lesson.button} <i>↗</i></button></div>`;
  $('#lesson-action-button').addEventListener('click', lesson.action);
}
function configureForExperiment(config) {
  state.config.rows = config.rows; state.config.pLeft = config.pLeft;
  state.symmetric = Math.abs(config.pLeft - .5) < 1e-9;
  $('#rows-input').value = config.rows; $('#probability-input').value = Math.round(config.pLeft * 100);
  clearSimulation();
}
function applyPreset(preset) {
  if (preset === 'beginner') { configureForExperiment({ rows: 5, pLeft: .5 }); runSample(50, { label: 'Small beginnings' }); }
  if (preset === 'small') { configureForExperiment({ rows: 8, pLeft: .5 }); runSample(100, { label: 'Small sample' }); }
  if (preset === 'medium') { configureForExperiment({ rows: 12, pLeft: .5 }); runSample(1000, { label: 'Medium sample' }); }
  if (preset === 'large-sample') { configureForExperiment({ rows: 15, pLeft: .5 }); runSample(10000, { fast: true, label: 'Large sample' }); }
  if (preset === 'precision') { configureForExperiment({ rows: 20, pLeft: .5 }); runSample(100000, { fast: true, label: 'High precision' }); }
  if (preset === 'biased') { configureForExperiment({ rows: 12, pLeft: .3 }); runSample(1000, { label: 'Biased distribution' }); }
}

// Control bindings.
$('#drop-one').addEventListener('click', () => runSample(1, { label: 'Single ball' }));
$('#drop-ten').addEventListener('click', () => runSample(10, { label: '10-ball sample' }));
$('#drop-hundred').addEventListener('click', () => runSample(100, { label: '100-ball sample' }));
$('#drop-thousand').addEventListener('click', () => runSample(1000, { label: '1,000-ball sample' }));
$('#continuous-button').addEventListener('click', () => state.continuous ? stopContinuous() : startContinuous());
$('#pause-button').addEventListener('click', () => {
  if (!state.continuous && state.balls.length === 0) return;
  state.paused = !state.paused; renderAll(); announce(state.paused ? 'Simulation paused.' : 'Simulation resumed.');
});
$('#fast-toggle').addEventListener('click', (event) => {
  state.fastMode = !state.fastMode;
  event.currentTarget.textContent = state.fastMode ? '⚡ Fast run ON' : '⚡ Fast run';
  renderAll(); showToast(state.fastMode ? 'New samples will skip individual animations.' : 'Individual ball animations enabled.');
});
$('#clear-stats').addEventListener('click', () => clearSimulation());
$('#reset-board').addEventListener('click', () => { clearSimulation({ keepConfig: false }); showToast('Board and controls restored to defaults.'); });
$('#rows-input').addEventListener('input', (event) => {
  state.config.rows = Number(event.target.value); clearSimulation(); showToast('Row count changed; the current run was reset.');
});
$('#rate-input').addEventListener('input', (event) => { state.config.rate = Number(event.target.value); renderAll(); });
$('#probability-input').addEventListener('input', (event) => {
  state.config.pLeft = Number(event.target.value) / 100; state.symmetric = false; clearSimulation(); showToast('Probability changed; the current run was reset.');
});
$('#symmetric-toggle').addEventListener('click', () => {
  if (state.symmetric) { state.symmetric = false; showToast('Choose a left-turn chance to bias the board.'); }
  else changeProbability(.5, true);
  renderAll();
});
$('#speed-input').addEventListener('input', (event) => { state.config.speed = Number(event.target.value); renderAll(); });
$('#size-input').addEventListener('input', (event) => { state.config.radius = Number(event.target.value); renderAll(); });
$('#gravity-input').addEventListener('input', (event) => { state.config.gravity = Number(event.target.value) / 10; renderAll(); });
$('#bounce-input').addEventListener('input', (event) => { state.config.bounce = Number(event.target.value) / 10; renderAll(); });
$('#spread-input').addEventListener('input', (event) => { state.config.spread = Number(event.target.value) / 10; renderAll(); });
$('#max-input').addEventListener('input', (event) => { state.config.maxAnimated = Number(event.target.value); renderAll(); });
$('#reduced-motion').addEventListener('change', (event) => {
  state.config.reducedMotion = event.target.checked;
  if (event.target.checked && state.continuous) stopContinuous();
  renderAll(); showToast(event.target.checked ? 'Reduced motion enabled. New outcomes calculate instantly.' : 'Reduced motion disabled.');
});
$('#seed-input').addEventListener('change', (event) => {
  const seed = event.target.value.trim() || 'galton-01'; event.target.value = seed;
  state.seed = seed; clearSimulation(); showToast(`Seed set to ${seed}.`);
});
$('#reseed-button').addEventListener('click', () => {
  const bytes = new Uint32Array(2); crypto.getRandomValues(bytes);
  const seed = `lab-${bytes[0].toString(16).slice(0, 6)}`; $('#seed-input').value = seed; state.seed = seed; clearSimulation();
  showToast('New random seed created.');
});
document.querySelectorAll('.segment').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.segment').forEach((segment) => segment.classList.toggle('active', segment === button));
  state.unit = button.dataset.unit; drawDistribution();
}));
document.querySelectorAll('.scenario-card, [data-preset="small"]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
$('#custom-experiment').addEventListener('click', () => {
  const raw = window.prompt('How many outcomes should this custom experiment run? (1–100,000)', '500');
  if (raw === null) return;
  const amount = Math.floor(Number(raw));
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) { showToast('Enter a whole number from 1 to 100,000.'); return; }
  runSample(amount, { fast: amount > state.config.maxAnimated * 2, label: 'Custom experiment' });
});
$('#lesson-action-button').addEventListener('click', lessons.randomness.action);
document.querySelectorAll('.lesson-tab').forEach((tab) => tab.addEventListener('click', () => selectLesson(tab.dataset.lesson)));
$('#export-csv').addEventListener('click', exportCsv);
$('#export-json').addEventListener('click', exportJson);
const exportPng = document.createElement('button'); exportPng.className = 'button-quiet'; exportPng.id = 'export-png'; exportPng.textContent = '↓ Chart PNG';
$('.history-actions').append(exportPng); exportPng.addEventListener('click', exportChart);
$('#clear-history').addEventListener('click', () => {
  if (!state.history.length) return;
  state.history = []; persistHistory(); renderHistory(); showToast('Notebook history cleared.');
});
$('#history-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-rerun]'); if (!button) return;
  const entry = state.history[Number(button.dataset.rerun)]; if (!entry) return;
  configureForExperiment({ rows: entry.rows, pLeft: 1 - entry.pRight });
  $('#seed-input').value = entry.seed; state.seed = entry.seed;
  runSample(entry.amount, { fast: entry.amount > 2000, label: `Re-run · ${entry.label}` });
});
$('#theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  const isLight = root.dataset.theme === 'light';
  root.dataset.theme = isLight ? 'dark' : 'light';
  $('#theme-toggle').setAttribute('aria-label', isLight ? 'Switch to light theme' : 'Switch to dark theme');
  $('#theme-toggle').querySelector('.theme-icon').textContent = isLight ? '☼' : '☾';
  try { localStorage.setItem('galton-lab-theme', root.dataset.theme); } catch { /* optional preference */ }
  renderAll();
});
try {
  const savedTheme = localStorage.getItem('galton-lab-theme');
  if (savedTheme === 'light') { document.documentElement.dataset.theme = 'light'; $('#theme-toggle .theme-icon').textContent = '☾'; $('#theme-toggle').setAttribute('aria-label', 'Switch to dark theme'); }
} catch { /* optional preference */ }
$('#help-button').addEventListener('click', () => $('#guide-dialog').showModal());
$('#close-guide').addEventListener('click', () => $('#guide-dialog').close());
$('#got-it').addEventListener('click', () => $('#guide-dialog').close());
$('#guide-dialog').addEventListener('click', (event) => { if (event.target === $('#guide-dialog')) $('#guide-dialog').close(); });
chartCanvas.addEventListener('pointermove', showChartTooltip);
chartCanvas.addEventListener('pointerleave', () => $('#chart-tooltip').classList.remove('show'));
chartCanvas.addEventListener('click', (event) => {
  showChartTooltip(event);
  if (state.chartHover !== null) announce(`Bin ${state.chartHover}: ${state.counts[state.chartHover]} observed, expected ${formatNumber(binomialDistribution(state.config.rows, pRight())[state.chartHover] * (state.landed || 100), 1)}.`);
});
window.addEventListener('resize', resizeCanvases);
if ('ResizeObserver' in window) new ResizeObserver(resizeCanvases).observe($('#board-stage'));

// Track the selected navigation section for a quiet, clear active state.
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  ['simulator', 'learn', 'experiments', 'about'].forEach((id) => observer.observe(document.getElementById(id)));
}

renderAll();
resizeCanvases();
requestAnimationFrame(advance);
