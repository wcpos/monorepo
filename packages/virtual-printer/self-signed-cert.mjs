// A self-signed TLS certificate generated at runtime with node:crypto — no openssl, no key in git.
// Real Epson printers with Secure Printing on present exactly this: an untrusted cert the client
// has to accept, which is why the app's HTTPS ePOS path must not depend on a valid chain.
import crypto from 'node:crypto';

const len = (n) => {
	if (n < 0x80) return Buffer.from([n]);
	const bytes = [];
	for (let value = n; value > 0; value >>= 8) bytes.unshift(value & 0xff);
	return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const der = {
	int: (buf) => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf),
	oid: (bytes) => tlv(0x06, Buffer.from(bytes)),
	nul: () => tlv(0x05, Buffer.alloc(0)),
	bits: (buf) => tlv(0x03, Buffer.concat([Buffer.from([0]), buf])),
	utf8: (text) => tlv(0x0c, Buffer.from(text, 'utf8')),
	// UTCTime is YYMMDDHHMMSSZ.
	time: (date) => {
		const iso = date
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d+Z$/, 'Z');
		return tlv(0x17, Buffer.from(iso.slice(2, 8) + iso.slice(9), 'ascii'));
	},
};
/** sha256WithRSAEncryption (1.2.840.113549.1.1.11). */
const SHA256_RSA = seq(der.oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]), der.nul());
/** A Name with a single commonName (2.5.4.3) RDN. */
const commonName = (value) => seq(tlv(0x31, seq(der.oid([0x55, 0x04, 0x03]), der.utf8(value))));
const pem = (label, body) =>
	`-----BEGIN ${label}-----\n${body
		.toString('base64')
		.replace(/(.{64})/g, '$1\n')
		.replace(/\n?$/, '\n')}-----END ${label}-----\n`;

/**
 * Generate an X.509 v1 self-signed certificate and its key, both PEM encoded.
 *
 * @param {string} [subject] Common name to put on the certificate.
 * @param {number} [days] Validity window in days.
 * @returns {{ key: string, cert: string }}
 */
export function generateSelfSignedCert(subject = 'Virtual WCPOS Printer', days = 365) {
	const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	const now = new Date();
	const tbs = seq(
		der.int(crypto.randomBytes(8)),
		SHA256_RSA,
		commonName(subject),
		seq(der.time(now), der.time(new Date(now.getTime() + days * 86_400_000))),
		commonName(subject),
		publicKey.export({ type: 'spki', format: 'der' })
	);
	const certificate = seq(tbs, SHA256_RSA, der.bits(crypto.sign('sha256', tbs, privateKey)));
	return {
		key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
		cert: pem('CERTIFICATE', certificate),
	};
}
