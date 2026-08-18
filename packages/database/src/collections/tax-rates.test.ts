import { taxRatesLiteral } from './schemas/tax-rates';

describe('tax rate schema', () => {
	it('keeps country as a plain string (no enum) so empty/general rates validate', () => {
		// WooCommerce returns an empty `country` for tax rates that apply to all
		// countries. An ISO-code enum rejected that value and blocked the whole
		// taxes collection from syncing. Guard against the enum coming back.
		expect(taxRatesLiteral.properties.country).toEqual({ type: 'string' });
		expect(taxRatesLiteral.properties.country).not.toHaveProperty('enum');
	});
});

describe('taxes schema', () => {
	it('bumps taxes to schema version 1', () => {
		expect(taxRatesLiteral.version).toBe(1);
	});
});
