import { describe, expect, it } from 'vitest';

import { sanitizeOutboundOrderPayload } from './sanitize-outbound-order-payload';

describe('sanitizeOutboundOrderPayload', () => {
	it('drops an EMPTY billing email — the guest-checkout 400 that stranded orders (#786/#832)', () => {
		const output = sanitizeOutboundOrderPayload({
			status: 'pos-paid',
			billing: { first_name: 'Guest', email: '' },
		});

		expect(output.billing).toEqual({ first_name: 'Guest' });
	});

	it('keeps a real billing email, and an absent one, untouched', () => {
		expect(sanitizeOutboundOrderPayload({ billing: { email: 'a@b.test' } }).billing).toEqual({
			email: 'a@b.test',
		});
		expect(sanitizeOutboundOrderPayload({ billing: { city: 'Berlin' } }).billing).toEqual({
			city: 'Berlin',
		});
	});

	it('still strips non-string meta display fields (composed, not replaced)', () => {
		const output = sanitizeOutboundOrderPayload({
			meta_data: [{ key: '_x', value: '1', display_value: { amount: 1 } }],
			billing: { email: '' },
		});

		expect(output.meta_data).toEqual([{ key: '_x', value: '1' }]);
		expect(output.billing).toEqual({});
	});

	it('returns the input untouched when nothing needs sanitizing', () => {
		const input = { status: 'pos-open', meta_data: [{ key: '_x', value: '1' }] };

		expect(sanitizeOutboundOrderPayload(input)).toBe(input);
	});

	it('ignores a billing value that is not an object', () => {
		const input = { billing: 'nonsense' } as Record<string, unknown>;

		expect(sanitizeOutboundOrderPayload(input)).toBe(input);
	});
});
