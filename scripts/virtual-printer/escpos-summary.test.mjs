import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeEscPos } from './escpos-summary.mjs';

test('reports byte count for an empty buffer', () => {
  assert.equal(summarizeEscPos([]), '0 bytes');
});

test('detects the init command (ESC @)', () => {
  assert.equal(summarizeEscPos([0x1b, 0x40]), '2 bytes — init (ESC @)');
});

test('detects a cut command (GS V) anywhere in the buffer', () => {
  const summary = summarizeEscPos([0x1b, 0x40, 0x41, 0x1d, 0x56, 0x00]);
  assert.ok(summary.includes('cut (GS V)'), summary);
});

test('detects a drawer kick (ESC p)', () => {
  const summary = summarizeEscPos([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  assert.ok(summary.includes('drawer kick (ESC p)'), summary);
});
