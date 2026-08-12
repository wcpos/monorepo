/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { TaxRatesContext, TaxRatesProvider } from './provider';

import type { QueryStateOf } from '../../../../query';

const allRates = [
	{ id: 1, class: 'standard', country: '', state: '', cities: [], postcodes: [] },
	{ id: 2, class: 'reduced-rate', country: '', state: '', cities: [], postcodes: [] },
];
const mockResource = { hits: allRates.map((document) => ({ document })) };
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => ({
	resource: mockResource,
}));
const mockUseObservableSuspense = jest.fn((resource: unknown) => resource);

jest.mock('../../../../query', () => {
	const actual = jest.requireActual('../../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: unknown, state: unknown) =>
			mockUseCollectionBinding(collection, state),
	};
});
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: unknown) => mockUseObservableSuspense(resource),
	useObservableEagerState: (input: { value?: unknown; testValue?: unknown }) =>
		input?.testValue ?? input?.value,
	useObservable: () => ({
		testValue: { country: 'US', state: 'CA', city: 'Los Angeles', postcode: '90210' },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			shipping_tax_class$: new BehaviorSubject(''),
			calc_taxes$: new BehaviorSubject('yes'),
			prices_include_tax$: new BehaviorSubject('no'),
			tax_round_at_subtotal$: new BehaviorSubject('no'),
			wc_price_decimals$: new BehaviorSubject(2),
			tax_based_on$: new BehaviorSubject('base'),
		},
	}),
}));
jest.mock('../../hooks/use-base-tax-location', () => ({
	useBaseTaxLocation: () => ({ country: 'US', state: 'CA', city: '', postcode: '' }),
}));

function ContextProbe() {
	const value = React.useContext(TaxRatesContext);
	return <output data-testid="context">{JSON.stringify(value)}</output>;
}

function latestState(): QueryStateOf<'tax-rates'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('provider tax-rates binding was not called');
	return call[1] as QueryStateOf<'tax-rates'>;
}

describe('TaxRatesProvider query-state consumption', () => {
	beforeEach(() => jest.clearAllMocks());

	it('owns an all-rates binding and does not republish its query object', () => {
		render(
			<TaxRatesProvider>
				<ContextProbe />
			</TaxRatesProvider>
		);

		expect(latestState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		});
		expect(mockUseObservableSuspense).toHaveBeenCalledWith(mockResource);
		const context = JSON.parse(screen.getByTestId('context').textContent ?? '') as Record<
			string,
			unknown
		>;
		expect(context.allRates).toHaveLength(2);
		expect(context.taxClasses).toEqual(['standard', 'reduced-rate']);
		expect(context).not.toHaveProperty('taxQuery');
	});
});
