import { createTestT } from '../../../jest/translate';

/**
 * The test `t()` is only worth anything if it resolves the same catalog entry
 * i18next would. Plural keys are where a naive lookup silently diverges: the
 * catalog holds `orders.refund_count_one` / `_other`, never a bare
 * `orders.refund_count`, so a test asserting on the singular could pass against
 * copy that never renders.
 */
describe('createTestT', () => {
	const t = createTestT();

	it('resolves a plain key from the shipped catalog', () => {
		expect(t('orders.refunds')).toBe('Refunds');
	});

	it('falls through to the key when nothing resolves', () => {
		expect(t('not.a.real.key')).toBe('not.a.real.key');
	});

	it('picks the plural form i18next would for a count', () => {
		expect(t('orders.refund_count', { count: 1 })).toBe('1 refund');
		expect(t('orders.refund_count', { count: 2 })).toBe('2 refunds');
		expect(t('orders.refund_count', { count: 0 })).toBe('0 refunds');
	});

	it('interpolates alongside the plural selection', () => {
		expect(t('common.variation_found_for_term', { count: 3, term: 'blue' })).toBe(
			'3 variations found for "blue"'
		);
	});

	it('returns a suffixed plural key verbatim when no count is given', () => {
		// Asking for the suffixed key directly is a lookup, not a plural
		// selection — the catalogue entry comes back untouched, placeholder and
		// all, because there is no count to interpolate.
		expect(t('health.database.attention_one')).toBe('{n} record needs attention');
	});
});
