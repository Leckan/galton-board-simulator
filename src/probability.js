/** Small deterministic PRNG. The same seed produces the same sequence in every browser. */
export function createRandom(seed = '') {
  let state = hashSeed(String(seed));
  return function random() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function binomialDistribution(rows, pRight) {
  const n = Math.max(0, Math.floor(rows));
  const p = Math.min(1, Math.max(0, pRight));
  if (n === 0) return [1];
  if (p === 0) return [1, ...Array(n).fill(0)];
  if (p === 1) return [...Array(n).fill(0), 1];
  const probabilities = Array(n + 1);
  // Start at the mode, where the probability is largest, then recur in both directions.
  const mode = Math.min(n, Math.floor((n + 1) * p));
  let value = Math.exp(logChoose(n, mode) + mode * Math.log(p) + (n - mode) * Math.log1p(-p));
  probabilities[mode] = value;
  for (let k = mode; k < n; k++) {
    value *= ((n - k) / (k + 1)) * (p / (1 - p));
    probabilities[k + 1] = value;
  }
  value = probabilities[mode];
  for (let k = mode; k > 0; k--) {
    value *= (k / (n - k + 1)) * ((1 - p) / p);
    probabilities[k - 1] = value;
  }
  const sum = probabilities.reduce((acc, entry) => acc + entry, 0);
  return probabilities.map((entry) => entry / sum);
}

function logChoose(n, k) {
  let result = 0;
  for (let i = 1; i <= k; i++) result += Math.log(n - k + i) - Math.log(i);
  return result;
}

export function simulateOutcomes(amount, rows, pRight, random) {
  const total = Math.max(0, Math.floor(amount));
  const n = Math.max(0, Math.floor(rows));
  const counts = Array(n + 1).fill(0);
  for (let ball = 0; ball < total; ball++) {
    let rightTurns = 0;
    for (let row = 0; row < n; row++) if (random() < pRight) rightTurns++;
    counts[rightTurns]++;
  }
  return counts;
}

export function theoreticalMoments(rows, pRight) {
  const n = Math.max(0, Math.floor(rows));
  const p = Math.min(1, Math.max(0, pRight));
  const mean = n * p;
  const variance = n * p * (1 - p);
  return { mean, variance, standardDeviation: Math.sqrt(variance) };
}
