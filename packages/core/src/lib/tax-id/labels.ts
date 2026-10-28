/**
 * Translation-key + placeholder helpers for the tax-id type catalogue.
 *
 * Centralised here so every form, list, and receipt-side renderer references
 * the same canonical labels. Translation strings live under
 * `tax_id.label.<type>` and `tax_id.placeholder.<type>` in the locale JSON.
 */

import * as React from 'react';

import { useT } from '../../contexts/translations';

import type { TaxIdType } from './types';

/**
 * Each tax-id type's label in the cashier's language. Every key is a literal `t('…')` call: the
 * string extractor (`scripts/extract-js-strings.js`) reads no other form, and drops the rest.
 */
export function useTaxIdLabels(): Record<TaxIdType, string> {
	const t = useT();
	return React.useMemo(
		() => ({
			eu_vat: t('tax_id.label.eu_vat'),
			gb_vat: t('tax_id.label.gb_vat'),
			au_abn: t('tax_id.label.au_abn'),
			br_cpf: t('tax_id.label.br_cpf'),
			br_cnpj: t('tax_id.label.br_cnpj'),
			in_gst: t('tax_id.label.in_gst'),
			it_cf: t('tax_id.label.it_cf'),
			it_piva: t('tax_id.label.it_piva'),
			es_nif: t('tax_id.label.es_nif'),
			ar_cuit: t('tax_id.label.ar_cuit'),
			sa_vat: t('tax_id.label.sa_vat'),
			ca_gst_hst: t('tax_id.label.ca_gst_hst'),
			us_ein: t('tax_id.label.us_ein'),
			other: t('tax_id.label.other'),
		}),
		[t]
	);
}

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
