/**
 * @jest-environment jsdom
 */
import * as fs from 'fs';
import * as path from 'path';

import { renderHook } from '@testing-library/react';

import { useTaxIdLabels } from './labels';

// `TAX_ID_TYPES` lives in @wcpos/database, whose ESM uuid this preset does not load; the catalog
// is pinned here instead.
const TAX_ID_TYPES = [
	'eu_vat',
	'gb_vat',
	'au_abn',
	'br_cpf',
	'br_cnpj',
	'in_gst',
	'it_cf',
	'it_piva',
	'es_nif',
	'ar_cuit',
	'sa_vat',
	'ca_gst_hst',
	'us_ein',
	'other',
] as const;

jest.mock('../../contexts/translations', () => ({ useT: () => (key: string) => `t:${key}` }));

/**
 * Every type has a label, and every label's key is a literal `t('…')` call in the source: the
 * string extractor reads only literals, so a key built from a variable is dropped from the catalog.
 */
it('labels every tax-id type through a literal translation call', () => {
	const { result } = renderHook(() => useTaxIdLabels());
	const source = fs.readFileSync(path.join(__dirname, 'labels.ts'), 'utf8');
	expect(Object.keys(result.current).sort()).toEqual([...TAX_ID_TYPES].sort());
	for (const type of TAX_ID_TYPES) {
		expect(result.current[type]).toBe(`t:tax_id.label.${type}`);
		expect(source).toContain(`t('tax_id.label.${type}')`);
	}
});
