import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from './math.js';

test('add adds two numbers correctly', () => {
  assert.strictEqual(add(2, 2), 4);
});
