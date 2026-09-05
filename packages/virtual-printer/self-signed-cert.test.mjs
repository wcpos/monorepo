import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, X509Certificate } from 'node:crypto';

import { generateSelfSignedCert } from './self-signed-cert.mjs';

test('generates a parseable self-signed certificate and its key', () => {
	const { key, cert } = generateSelfSignedCert('EPSON TM-m30III');
	const x509 = new X509Certificate(cert);
	assert.equal(x509.subject, 'CN=EPSON TM-m30III');
	assert.equal(x509.issuer, x509.subject, 'self-signed: issuer is the subject');
	assert.ok(x509.checkPrivateKey(createPrivateKey(key)));
	assert.ok(new Date(x509.validTo) > new Date());
});

test('never emits the same key twice', () => {
	assert.notEqual(generateSelfSignedCert().key, generateSelfSignedCert().key);
});
