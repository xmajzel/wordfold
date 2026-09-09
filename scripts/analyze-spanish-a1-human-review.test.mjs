import assert from 'node:assert/strict';
import test from 'node:test';
import { wilson95 } from './analyze-spanish-a1-human-review.mjs';

test('computes Wilson 95% intervals including zero observed errors', () => {
  const zero = wilson95(0, 200);
  assert.equal(zero.rate, 0);
  assert(zero.wilson95.lower < 1e-15);
  assert(Math.abs(zero.wilson95.upper - 0.018845326377266575) < 1e-12);

  const ten = wilson95(10, 200);
  assert.equal(ten.rate, 0.05);
  assert(ten.wilson95.lower < ten.rate);
  assert(ten.wilson95.upper > ten.rate);
});
