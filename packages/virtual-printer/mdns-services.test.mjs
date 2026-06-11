import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMdnsServices } from './mdns-services.mjs';

test('defaults to a single pdl-datastream service on port 9100', () => {
  const services = buildMdnsServices();
  assert.equal(services.length, 1);
  assert.equal(services[0].type, 'pdl-datastream');
  assert.equal(services[0].port, 9100);
});

test('carries the name into txt.product and txt.ty for vendor inference', () => {
  const services = buildMdnsServices({ name: 'Epson TM-T88 (virtual)' });
  assert.equal(services[0].name, 'Epson TM-T88 (virtual)');
  assert.equal(services[0].txt.product, 'Epson TM-T88 (virtual)');
  assert.equal(services[0].txt.ty, 'Epson TM-T88 (virtual)');
});

test('includes an ipp service only when requested', () => {
  const services = buildMdnsServices({ ipp: true });
  assert.equal(services.length, 2);
  assert.ok(services.some((s) => s.type === 'ipp'));
});
