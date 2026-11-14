import { EU_MEMBER_COUNTRY_CODES, splitTaxIdTypesForCountry, suggestTaxIdTypes } from './suggest';
import { TAX_ID_TYPES } from './types';

jest.mock('@wcpos/database', () =>
	jest.requireActual('@wcpos/database/collections/schemas/tax-id')
);

describe('suggestTaxIdTypes', () => {
	it.each([
		['ES', ['es_nif', 'eu_vat']],
		['IT', ['it_piva', 'it_cf', 'eu_vat']],
		['DE', ['eu_vat']],
		['GR', ['eu_vat']],
		['GB', ['gb_vat']],
		['AU', ['au_abn']],
		['BR', ['br_cpf', 'br_cnpj']],
		['IN', ['in_gst']],
		['AR', ['ar_cuit']],
		['SA', ['sa_vat']],
		['CA', ['ca_gst_hst']],
		['US', ['us_ein']],
		['es', ['es_nif', 'eu_vat']],
		[' ES ', ['es_nif', 'eu_vat']],
	] as const)('suggests types for %s in priority order', (country, expected) => {
		expect(suggestTaxIdTypes(country)).toEqual(expected);
	});

	it.each(['', null, undefined, 'MX', 'CH'])('has no suggestions for %s', (country) => {
		expect(suggestTaxIdTypes(country)).toEqual([]);
	});

	it('uses the 27 EU ISO country codes, not VAT prefixes or non-members', () => {
		expect(EU_MEMBER_COUNTRY_CODES).toHaveLength(27);
		expect(new Set(EU_MEMBER_COUNTRY_CODES).size).toBe(27);
		expect(EU_MEMBER_COUNTRY_CODES).toEqual(expect.arrayContaining(['GR', 'ES']));
		for (const country of ['GB', 'CH', 'EL']) {
			expect(EU_MEMBER_COUNTRY_CODES).not.toContain(country);
		}
	});
});

describe('splitTaxIdTypesForCountry', () => {
	it('puts Italian types first without duplicating or reordering the rest', () => {
		const { suggested, rest } = splitTaxIdTypesForCountry('IT');
		expect(suggested).toEqual(['it_piva', 'it_cf', 'eu_vat']);
		const all = suggested.concat(rest);
		expect(all).toHaveLength(TAX_ID_TYPES.length);
		expect(new Set(all)).toEqual(new Set(TAX_ID_TYPES));
		expect(rest).toEqual(
			TAX_ID_TYPES.filter((type) => !['it_piva', 'it_cf', 'eu_vat'].includes(type))
		);
	});

	it('keeps the canonical catalogue for a blank country', () => {
		expect(splitTaxIdTypesForCountry('')).toEqual({ suggested: [], rest: TAX_ID_TYPES });
	});
});
