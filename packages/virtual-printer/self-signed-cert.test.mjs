import test from 'node:test';
import assert from 'node:assert/strict';
import crypto, { createPrivateKey, X509Certificate } from 'node:crypto';

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

test('a serial whose random bytes start with a zero byte still encodes as a valid certificate', () => {
	// randomBytes is only used for the serial; force the shape that produced DER "illegal padding".
	const real = crypto.randomBytes;
	crypto.randomBytes = (n) => Buffer.from([0x00, 0x00, 0x7f, 0x01, 0x02, 0x03, 0x04, 0x05].slice(0, n));
	try {
		const { cert } = generateSelfSignedCert('zero-led serial');
		const x509 = new X509Certificate(cert);
		assert.equal(x509.serialNumber, '7F0102030405');
	} finally {
		crypto.randomBytes = real;
	}
});

test('a serial whose first byte has the high bit set stays positive', () => {
	const real = crypto.randomBytes;
	crypto.randomBytes = (n) => Buffer.from([0x80, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07].slice(0, n));
	try {
		const x509 = new X509Certificate(generateSelfSignedCert('high-bit serial').cert);
		assert.equal(x509.serialNumber, '8001020304050607');
	} finally {
		crypto.randomBytes = real;
	}
});
