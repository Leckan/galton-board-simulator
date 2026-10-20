export function summarizeCounts(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return { total: 0, mean: null, median: null, variance: null, standardDeviation: null, mode: null, min: null, max: null };
  }
  let weightedSum = 0;
  let mode = 0;
  let maxCount = -1;
  let min = null;
  let max = null;
  counts.forEach((count, bin) => {
    weightedSum += bin * count;
    if (count > maxCount) { maxCount = count; mode = bin; }
    if (count > 0) {
      if (min === null) min = bin;
      max = bin;
    }
  });
  const mean = weightedSum / total;
  let squaredSum = 0;
  counts.forEach((count, bin) => { squaredSum += count * (bin - mean) ** 2; });
  const valueAt = (position) => {
    let cumulative = 0;
    for (let bin = 0; bin < counts.length; bin++) {
      cumulative += counts[bin];
      if (position < cumulative) return bin;
    }
    return null;
  };
  const median = total % 2 ? valueAt(Math.floor(total / 2)) : (valueAt(total / 2 - 1) + valueAt(total / 2)) / 2;
  const variance = squaredSum / total;
  return { total, mean, median, variance, standardDeviation: Math.sqrt(variance), mode, min, max };
}
