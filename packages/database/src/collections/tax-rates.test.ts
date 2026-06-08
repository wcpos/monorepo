import { storeCollections } from './index';
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

describe('taxes migration strategy', () => {
	it('bumps taxes to schema version 1', () => {
		expect(taxRatesLiteral.version).toBe(1);
	});

	it('carries v0 documents over to v1, preserving an empty country', () => {
		const migrated = storeCollections.taxes.migrationStrategies?.[1]?.({
			uuid: '1',
			id: 1,
			country: '',
			name: 'Impuesto',
			rate: '10.0000',
		} as any);

		expect(migrated).toMatchObject({ uuid: '1', id: 1, country: '', name: 'Impuesto' });
	});

	it('normalizes a missing country to an empty string', () => {
		const migrated = storeCollections.taxes.migrationStrategies?.[1]?.({
			uuid: '2',
			id: 2,
			name: 'No Country',
		} as any);

		expect(migrated).toMatchObject({ uuid: '2', country: '' });
	});
});
