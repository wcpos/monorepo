import { describe, expect, it, vi } from 'vitest';

import { createScanSession, hasValidRetailCheckDigit } from './scan-session';

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
});
