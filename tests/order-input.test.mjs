import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { parseTicketQuantity } = await loadTs('../lib/order-input.ts');

test('fractional, coerced and nonfinite quantities cannot reach reservations or payment', () => {
  for (const value of [0, -1, 7, 1.5, NaN, Infinity, '2', true, null, undefined, {}, []]) {
    assert.equal(parseTicketQuantity(value), null);
  }
  assert.equal(parseTicketQuantity(1), 1);
  assert.equal(parseTicketQuantity(6), 6);
});
