import test from 'node:test';
import assert from 'node:assert/strict';
import { binomialDistribution, createRandom, simulateOutcomes, theoreticalMoments } from '../src/probability.js';
import { summarizeCounts } from '../src/statistics.js';

test('symmetric binomial probabilities are normalized and mirrored', () => {
  const values = binomialDistribution(12, 0.5);
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  for (let k = 0; k < values.length; k++) assert.ok(Math.abs(values[k] - values[12 - k]) < 1e-12);
});

test('biased binomial distribution has the expected mean', () => {
  const probabilities = binomialDistribution(12, 0.7);
  const mean = probabilities.reduce((sum, probability, bin) => sum + probability * bin, 0);
  assert.ok(Math.abs(mean - 8.4) < 1e-10);
  assert.ok(probabilities[8] > probabilities[4]);
});

test('certain outcomes put every ball in the corresponding edge bin', () => {
  assert.deepEqual(binomialDistribution(5, 0), [1, 0, 0, 0, 0, 0]);
  assert.deepEqual(binomialDistribution(5, 1), [0, 0, 0, 0, 0, 1]);
});

test('seeded random samples are reproducible', () => {
  const first = simulateOutcomes(500, 10, 0.37, createRandom('same-seed'));
  const second = simulateOutcomes(500, 10, 0.37, createRandom('same-seed'));
  const other = simulateOutcomes(500, 10, 0.37, createRandom('different-seed'));
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
});

test('summary statistics use landed outcomes and handle empty samples', () => {
  assert.deepEqual(summarizeCounts([0, 0, 0]), {
    total: 0, mean: null, median: null, variance: null, standardDeviation: null, mode: null, min: null, max: null,
  });
  const summary = summarizeCounts([1, 2, 1]);
  assert.equal(summary.total, 4);
  assert.equal(summary.mean, 1);
  assert.equal(summary.median, 1);
  assert.equal(summary.variance, 0.5);
  assert.equal(summary.mode, 1);
  assert.equal(summary.min, 0);
  assert.equal(summary.max, 2);
});

test('theoretical moments match binomial formulas', () => {
  assert.deepEqual(theoreticalMoments(12, 0.5), { mean: 6, variance: 3, standardDeviation: Math.sqrt(3) });
});
