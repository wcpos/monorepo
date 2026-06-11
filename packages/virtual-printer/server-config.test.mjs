import test from 'node:test';
import assert from 'node:assert/strict';

import { getServerConfig } from './server-config.mjs';

test('defaults to a generic virtual printer on Epson ePOS port 8008', () => {
  assert.deepEqual(
    getServerConfig({}),
    {
      name: 'Virtual WCPOS Printer',
      vendor: 'both',
      rawPort: 9100,
      httpPort: 8008,
    }
  );
});

test('Star mode defaults the HTTP server to port 80', () => {
  assert.deepEqual(
    getServerConfig({ VP_VENDOR: 'star', VP_NAME: 'Virtual Star Printer' }),
    {
      name: 'Virtual Star Printer',
      vendor: 'star',
      rawPort: 9100,
      httpPort: 80,
    }
  );
});

test('explicit HTTP port overrides the Star port 80 default', () => {
  assert.equal(getServerConfig({ VP_VENDOR: 'star', VP_HTTP_PORT: '8080' }).httpPort, 8080);
});

test('Epson mode defaults the HTTP server to ePOS port 8008', () => {
  assert.equal(getServerConfig({ VP_VENDOR: 'epson' }).httpPort, 8008);
});

test('vendor mode is case-insensitive and trims whitespace', () => {
  assert.equal(getServerConfig({ VP_VENDOR: ' STAR ' }).vendor, 'star');
  assert.equal(getServerConfig({ VP_VENDOR: 'Epson' }).vendor, 'epson');
  assert.equal(getServerConfig({ VP_VENDOR: 'BOTH' }).vendor, 'both');
});
