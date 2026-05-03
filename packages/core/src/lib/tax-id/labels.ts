/**
 * Translation-key + placeholder helpers for the tax-id type catalogue.
 *
 * Centralised here so every form, list, and receipt-side renderer references
 * the same canonical labels. Translation strings live under
 * `tax_id.label.<type>` and `tax_id.placeholder.<type>` in the locale JSON.
 */

import type { TaxIdType } from './types';

/**
 * Mapping of tax-id type → translation key. Resolved by the caller via the
 * `useT` hook so the labels respect the user's selected locale.
 */
export const TAX_ID_LABEL_KEYS: Record<TaxIdType, string> = {
	eu_vat: 'tax_id.label.eu_vat',
	gb_vat: 'tax_id.label.gb_vat',
	au_abn: 'tax_id.label.au_abn',
	br_cpf: 'tax_id.label.br_cpf',
	br_cnpj: 'tax_id.label.br_cnpj',
	in_gst: 'tax_id.label.in_gst',
	it_cf: 'tax_id.label.it_cf',
	it_piva: 'tax_id.label.it_piva',
	es_nif: 'tax_id.label.es_nif',
	ar_cuit: 'tax_id.label.ar_cuit',
	sa_vat: 'tax_id.label.sa_vat',
	ca_gst_hst: 'tax_id.label.ca_gst_hst',
	us_ein: 'tax_id.label.us_ein',
	other: 'tax_id.label.other',
};

/**
 * Example value strings shown as input placeholders. Not translated — these
 * are example IDs that should look the same in every locale.
 */
export const TAX_ID_PLACEHOLDERS: Record<TaxIdType, string> = {
	eu_vat: 'DE123456789',
	gb_vat: 'GB123456789',
	au_abn: '12345678901',
	br_cpf: '123.456.789-00',
	br_cnpj: '12.345.678/0001-99',
	in_gst: '22AAAAA0000A1Z5',
	it_cf: 'RSSMRA80A01H501U',
	it_piva: '12345678901',
	es_nif: 'A12345678',
	ar_cuit: '20-12345678-9',
	sa_vat: '300000000000003',
	ca_gst_hst: '123456789RT0001',
	us_ein: '12-3456789',
	other: '',
};

/**
 * Suggested ISO 3166-1 alpha-2 country code per tax-id type. Used to
 * pre-populate the `country` field when a user picks a type whose value is
 * country-locked (e.g. picking `gb_vat` should default `country` to `GB`).
 */
export const TAX_ID_DEFAULT_COUNTRIES: Record<TaxIdType, string | null> = {
	eu_vat: null, // EU VAT carries its own 2-letter prefix; let the user pick.
	gb_vat: 'GB',
	au_abn: 'AU',
	br_cpf: 'BR',
	br_cnpj: 'BR',
	in_gst: 'IN',
	it_cf: 'IT',
	it_piva: 'IT',
	es_nif: 'ES',
	ar_cuit: 'AR',
	sa_vat: 'SA',
	ca_gst_hst: 'CA',
	us_ein: 'US',
	other: null,
};
