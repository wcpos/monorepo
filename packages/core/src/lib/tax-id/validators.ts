/**
 * Format-only validators for tax IDs.
 *
 * These are *not* network-backed checks (no VIES / HMRC / GSTN calls). They
 * mirror the regex-only validation in PHP `Tax_Id_Reader` so the POS can give
 * users immediate feedback when they paste an obviously malformed ID. Network
 * verification is a separate, deferred concern (see Phase 5 in the design).
 */

import type { TaxIdType } from './types';

const PATTERNS: Record<TaxIdType, RegExp> = {
	// EU VAT: 2-letter country prefix + 8-12 alphanumerics. Country prefix
	// charset matches the formal ISO list rather than every member-state quirk;
	// this is intentionally permissive — server-side parsing is authoritative.
	eu_vat: /^[A-Z]{2}[A-Z0-9]{8,12}$/i,
	gb_vat: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/i,
	au_abn: /^\d{11}$/,
	br_cpf: /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/,
	br_cnpj: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/,
	in_gst: /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d]Z[A-Z\d]$/i,
	it_cf: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i,
	it_piva: /^\d{11}$/,
	es_nif: /^[A-Z0-9]\d{7}[A-Z0-9]$/i,
	ar_cuit: /^\d{2}-?\d{8}-?\d$/,
	sa_vat: /^\d{15}$/,
	ca_gst_hst: /^\d{9}(RT\d{4})?$/i,
	us_ein: /^\d{2}-?\d{7}$/,
	// "other" intentionally accepts any non-empty string.
	other: /^.+$/,
};

/**
 * Returns true if `value` matches the format expected for the given `type`.
 *
 * Accepts spaces and common separators (the user is allowed to paste IDs in
 * formatted form). Always normalize via {@link normalizeTaxIdValue} before
 * persisting.
 */
export function isValidTaxIdFormat(type: TaxIdType, value: string): boolean {
	if (typeof value !== 'string') return false;
	const normalized = normalizeTaxIdValue(value);
	if (normalized.length === 0) return false;
	return PATTERNS[type].test(normalized);
}

/**
 * Strips whitespace and uppercases alpha characters. Mirrors
 * `Tax_Id_Reader::normalize_value` for client-side parity.
 */
export function normalizeTaxIdValue(value: string): string {
	return value.replace(/\s+/g, '').toUpperCase();
}
