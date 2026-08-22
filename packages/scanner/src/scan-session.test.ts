import { describe, expect, it, vi } from 'vitest';

import { createScanSession, hasValidRetailCheckDigit, normalizeRetailCode } from './scan-session';

describe('normalizeRetailCode', () => {
	// The bottle from the bench report: UPC-A printed 7 33620 20995 8, which
	// zxing reports as the 13-digit GTIN form and labels EAN-13.
	const PRINTED = '733620209958';
	const DECODED = '0733620209958';

	it.each(['ean13', 'EAN13', 'upc_a', 'ean-13', 'upc-a'])(
		'drops the implied leading zero for a %s read',
		(symbology) => {
			expect(normalizeRetailCode(DECODED, symbology)).toBe(PRINTED);
		}
	);

	it('leaves a genuine EAN-13 alone', () => {
		// GS1 reserves leading 0 for GTIN-12, so a non-zero prefix is never padded.
		expect(normalizeRetailCode('4006381333931', 'ean13')).toBe('4006381333931');
	});

	it('leaves an already-12-digit UPC-A alone', () => {
		expect(normalizeRetailCode(PRINTED, 'upc_a')).toBe(PRINTED);
	});

	it('leaves codes from non-EAN/UPC symbologies alone', () => {
		// A numeric Code 128 SKU may legitimately start with 0 and mean it.
		expect(normalizeRetailCode(DECODED, 'code128')).toBe(DECODED);
		expect(normalizeRetailCode(DECODED, 'qr')).toBe(DECODED);
		// UPC-E prints 8 digits and decoders expand it to 12 — out of scope here.
		expect(normalizeRetailCode('0012345000065', 'upc_e')).toBe('0012345000065');
	});

	it('leaves an unlabelled read alone', () => {
		// A keyboard wedge reports no symbology; #740 lookup equivalence covers it.
		expect(normalizeRetailCode(DECODED)).toBe(DECODED);
	});

	it('leaves wrong-length numerics alone', () => {
		expect(normalizeRetailCode('012345678', 'ean13')).toBe('012345678');
		expect(normalizeRetailCode('00733620209958', 'ean13')).toBe('00733620209958');
	});
});

describe('hasValidRetailCheckDigit', () => {
	it.each([
		['4006381333931', true], // EAN-13
		['4006381333930', false], // EAN-13, wrong check
		['96385074', true], // EAN-8
		['96385073', false], // EAN-8, wrong check
		['036000291452', true], // UPC-A
		['036000291453', false], // UPC-A, wrong check
	])('validates %s as %s', (code, valid) => {
		expect(hasValidRetailCheckDigit(code)).toBe(valid);
	});

	it('passes through non-numeric and non-retail-length codes', () => {
		expect(hasValidRetailCheckDigit('ABC-123')).toBe(true);
		expect(hasValidRetailCheckDigit('12345')).toBe(true);
	});
});

describe('createScanSession', () => {
	function session(overrides: Partial<Parameters<typeof createScanSession>[0]> = {}) {
		const accepted: string[] = [];
		let clock = 0;
		const instance = createScanSession({
			onAccept: (code) => accepted.push(code),
			now: () => clock,
			...overrides,
		});
		return { accepted, instance, tick: (ms: number) => (clock += ms) };
	}

	it('accepts the first read and suppresses repeats within the cooldown', () => {
		const { accepted, instance, tick } = session({ cooldownMs: 1000 });
		expect(instance.offer('4006381333931').accepted).toBe(true);
		tick(500);
		expect(instance.offer('4006381333931')).toEqual({ accepted: false, reason: 'cooldown' });
		tick(600); // now 1100 > 1000
		expect(instance.offer('4006381333931').accepted).toBe(true);
		expect(accepted).toEqual(['4006381333931', '4006381333931']);
	});

	it('accepts a different code during another code cooldown', () => {
		const { accepted, instance } = session({ cooldownMs: 1000 });
		instance.offer('4006381333931');
		expect(instance.offer('96385074').accepted).toBe(true);
		expect(accepted).toEqual(['4006381333931', '96385074']);
	});

	it('rejects a code with a bad retail check digit', () => {
		const { accepted, instance } = session();
		expect(instance.offer('4006381333930')).toEqual({
			accepted: false,
			reason: 'bad-check-digit',
		});
		expect(accepted).toEqual([]);
	});

	it('accepts a non-retail code without check-digit gating', () => {
		const { accepted, instance } = session();
		expect(instance.offer('ABC-123', 'code128').accepted).toBe(true);
		expect(accepted).toEqual(['ABC-123']);
	});

	it('does not EAN-8-gate a UPC-E scan (different check-digit domain)', () => {
		const { accepted, instance } = session();
		// 01234505 is a valid UPC-E whose literal digits fail the EAN-8 algorithm.
		expect(instance.offer('01234505', 'upc_e').accepted).toBe(true);
		expect(accepted).toEqual(['01234505']);
	});

	it('honors an explicit non-retail symbology for a numeric payload', () => {
		const { accepted, instance } = session();
		// A numeric SKU encoded as Code 128 must not be rejected as a bad EAN/UPC.
		expect(instance.offer('12345678', 'code128').accepted).toBe(true);
		expect(accepted).toEqual(['12345678']);
	});

	it('still rejects a bad EAN-13 check digit when the symbology confirms it', () => {
		const { accepted, instance } = session();
		expect(instance.offer('4006381333930', 'ean13')).toEqual({
			accepted: false,
			reason: 'bad-check-digit',
		});
		expect(accepted).toEqual([]);
	});

	it('does not gate an ambiguous 8-digit code when no symbology is provided', () => {
		const { accepted, instance } = session();
		// Length 8 is EAN-8/UPC-E ambiguous without a symbology → pass through.
		expect(instance.offer('96385073').accepted).toBe(true);
		expect(accepted).toEqual(['96385073']);
	});

	it('requires two identical reads when requireDoubleRead is on', () => {
		const { accepted, instance, tick } = session({ requireDoubleRead: true });
		expect(instance.offer('4006381333931')).toEqual({
			accepted: false,
			reason: 'awaiting-confirmation',
		});
		tick(100);
		expect(instance.offer('4006381333931').accepted).toBe(true);
		expect(accepted).toEqual(['4006381333931']);
	});

	it('restarts confirmation when a different code interrupts a double-read', () => {
		const { accepted, instance } = session({ requireDoubleRead: true });
		instance.offer('4006381333931');
		instance.offer('96385074'); // interrupts, becomes the new pending
		expect(instance.offer('96385074').accepted).toBe(true);
		expect(accepted).toEqual(['96385074']);
	});

	it('reset clears cooldown state', () => {
		const { instance } = session({ cooldownMs: 1000 });
		instance.offer('4006381333931');
		instance.reset();
		expect(instance.offer('4006381333931').accepted).toBe(true);
	});

	it('emits the printed 12-digit form for a UPC-A the camera read as 13 digits', () => {
		const { accepted, instance } = session();
		expect(instance.offer('0733620209958', 'ean13').accepted).toBe(true);
		expect(accepted).toEqual(['733620209958']);
	});

	it('treats both forms of one UPC-A as the same code for dedup', () => {
		// A wedge sending 12 and a camera sending 13 must not double-add the item.
		const { accepted, instance, tick } = session({ cooldownMs: 1000 });
		expect(instance.offer('733620209958', 'upc_a').accepted).toBe(true);
		tick(100);
		expect(instance.offer('0733620209958', 'ean13')).toEqual({
			accepted: false,
			reason: 'cooldown',
		});
		expect(accepted).toEqual(['733620209958']);
	});

	it('still rejects a bad check digit after normalization', () => {
		const { accepted, instance } = session();
		expect(instance.offer('0733620209957', 'ean13')).toEqual({
			accepted: false,
			reason: 'bad-check-digit',
		});
		expect(accepted).toEqual([]);
	});
});
