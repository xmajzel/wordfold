import test from 'node:test';
import assert from 'node:assert/strict';

import { attentionMarker } from './combine-spanish-owner-review.mjs';

test('classifies deterministic owner-review attention markers in precedence order', () => {
  assert.equal(attentionMarker('casa / hogar', 'casa: dom | hogar: domov'), 'shared');
  assert.equal(attentionMarker('solo', 'solo: sám | sólo: iba'), 'shared');
  assert.equal(attentionMarker('café', 'café: cafe'), 'cognate');
  assert.equal(attentionMarker('además', 'además: okrem toho navyše'), 'phrase');
  assert.equal(attentionMarker('casa', 'casa: dom'), '');
});
