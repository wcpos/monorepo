/**
 * Country-based suggestions for the structured tax-ID catalogue.
 */

import { TAX_ID_TYPES, type TaxIdType } from './types';

/** ISO 3166-1 alpha-2 codes of the 27 EU members (GR, not the EL VAT prefix). */
export const EU_MEMBER_COUNTRY_CODES: readonly string[] = [
	'AT',
	'BE',
	'BG',
	'CY',
	'CZ',
	'DE',
	'DK',
	'EE',
	'ES',
	'FI',
	'FR',
	'GR',
	'HR',
	'HU',
	'IE',
	'IT',
	'LT',
	'LU',
	'LV',
	'MT',
	'NL',
	'PL',
	'PT',
	'RO',
	'SE',
	'SI',
	'SK',
];

const COUNTRY_TYPES: Record<string, TaxIdType[]> = {
	ES: ['es_nif', 'eu_vat'],
	IT: ['it_piva', 'it_cf', 'eu_vat'],
	GB: ['gb_vat'],
	AU: ['au_abn'],
	BR: ['br_cpf', 'br_cnpj'],
	IN: ['in_gst'],
	AR: ['ar_cuit'],
	SA: ['sa_vat'],
	CA: ['ca_gst_hst'],
	US: ['us_ein'],
};

/** Most likely types first; empty for a blank country or one without a catalogue entry. */
export function suggestTaxIdTypes(country: string | null | undefined): TaxIdType[] {
	const code = country?.trim().toUpperCase() ?? '';
	return COUNTRY_TYPES[code] ?? (EU_MEMBER_COUNTRY_CODES.includes(code) ? ['eu_vat'] : []);
}

/** Suggested types first, then every other catalogue entry in canonical order. */
export function splitTaxIdTypesForCountry(country: string | null | undefined): {
	suggested: TaxIdType[];
	rest: TaxIdType[];
} {
	const suggested = suggestTaxIdTypes(country);
	return { suggested, rest: TAX_ID_TYPES.filter((type) => !suggested.includes(type)) };
}
