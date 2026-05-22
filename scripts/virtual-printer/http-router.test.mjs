import test from 'node:test';
import assert from 'node:assert/strict';

import {
  routeHttpRequest,
  EPSON_EPOS_PATH,
  STAR_WEBPRNT_PATH,
} from './http-router.mjs';

test('GET on the Epson ePOS path returns 405 (endpoint present)', () => {
  assert.equal(routeHttpRequest('GET', EPSON_EPOS_PATH).status, 405);
});

test('GET on the Star WebPRNT path returns 405 (endpoint present)', () => {
  assert.equal(routeHttpRequest('GET', STAR_WEBPRNT_PATH).status, 405);
});

test('GET on an unknown path returns 404 (endpoint absent)', () => {
  assert.equal(routeHttpRequest('GET', '/').status, 404);
  assert.equal(routeHttpRequest('GET', '/favicon.ico').status, 404);
});

test('POST on a printer path is accepted as a print (200)', () => {
  assert.equal(routeHttpRequest('POST', EPSON_EPOS_PATH).status, 200);
});

test('POST to the Epson path returns a namespaced ePOS response the real adapter can parse', () => {
  const { body } = routeHttpRequest('POST', EPSON_EPOS_PATH);
  // EpsonEposAdapter reads getElementsByTagNameNS(EPOS_PRINT_NS, 'response') and checks success.
  assert.match(body, /http:\/\/www\.epson-pos\.com\/schemas\/2011\/03\/epos-print/);
  assert.match(body, /<response[^>]*success="true"/);
});

test('POST to the Star path returns a WebPRNT response with Normal status', () => {
  // StarWebPrntAdapter throws unless <Status> is "Normal".
  assert.match(routeHttpRequest('POST', STAR_WEBPRNT_PATH).body, /<Status>Normal<\/Status>/);
});

test('OPTIONS preflight returns 204', () => {
  assert.equal(routeHttpRequest('OPTIONS', EPSON_EPOS_PATH).status, 204);
});

test('a query string does not change routing', () => {
  assert.equal(routeHttpRequest('GET', `${EPSON_EPOS_PATH}?x=1`).status, 405);
});
