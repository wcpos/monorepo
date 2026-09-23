/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { TAX_ID_TYPES } from '@wcpos/database/collections/schemas/tax-id';

import { useEnabledTaxIdTypes } from './use-enabled-tax-id-types';

let storeValue: { customer_tax_id_types?: unknown } = {};
const store = { id: 'store-uuid' };

jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, selector: (value: unknown) => unknown) => selector(storeValue),
}));

jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store }),
}));

// `lib/tax-id` re-exports the whole of `@wcpos/database`, whose index pulls in
// the RxDB plugins (and ESM-only `uuid`) that jest can't transform. Serve the
// real catalogue from the schema module directly instead.
jest.mock('../../../lib/tax-id', () => ({
	TAX_ID_TYPES: jest.requireActual('@wcpos/database/collections/schemas/tax-id').TAX_ID_TYPES,
}));

describe('useEnabledTaxIdTypes', () => {
	beforeEach(() => {
		storeValue = {};
	});

	it('offers the full catalogue when the allow-list is empty', () => {
		storeValue = { customer_tax_id_types: [] };
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(TAX_ID_TYPES);
	});

	it('offers the full catalogue when the field is absent (older plugin)', () => {
		storeValue = {};
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(TAX_ID_TYPES);
	});

	it('narrows to the allowed types', () => {
		storeValue = { customer_tax_id_types: ['es_nif'] };
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(['es_nif']);
	});

	it('returns allowed types in canonical order, not the order given', () => {
		storeValue = { customer_tax_id_types: ['other', 'es_nif', 'eu_vat'] };
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(['eu_vat', 'es_nif', 'other']);
	});

	it('drops types this build does not know about', () => {
		storeValue = { customer_tax_id_types: ['es_nif', 'de_ust_id', 'nope'] };
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(['es_nif']);
	});

	it('falls back to the full catalogue when nothing in the allow-list is recognised', () => {
		storeValue = { customer_tax_id_types: ['nl_kvk', 'fr_siret'] };
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(TAX_ID_TYPES);
	});

	it('ignores a non-array value', () => {
		storeValue = { customer_tax_id_types: 'es_nif' };
		const { result } = renderHook(() => useEnabledTaxIdTypes());
		expect(result.current).toEqual(TAX_ID_TYPES);
	});
});
