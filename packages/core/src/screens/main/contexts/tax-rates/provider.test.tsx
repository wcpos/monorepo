/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { TaxRatesProvider, useTaxLocation, useTaxSettings } from './provider';
import { useTaxRates } from './use-tax-rates';

import type { QueryStateOf } from '../../../../query';

type OrderDocument = import('@wcpos/database').OrderDocument;

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

/**
 * Only `useObservableSuspense` is stubbed — the rest of observable-hooks runs for real
 * against real subjects, because subscription identity is precisely what these tests are
 * about.
 */
jest.mock('observable-hooks', () => {
	const actual = jest.requireActual('observable-hooks');
	return {
		...actual,
		useObservableSuspense: (resource: unknown) => mockUseObservableSuspense(resource),
	};
});

const storeSubjects = {
	shipping_tax_class$: new BehaviorSubject(''),
	calc_taxes$: new BehaviorSubject('yes'),
	prices_include_tax$: new BehaviorSubject('no'),
	tax_round_at_subtotal$: new BehaviorSubject('no'),
	wc_price_decimals$: new BehaviorSubject(2),
	tax_based_on$: new BehaviorSubject('base'),
};

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: storeSubjects }),
}));
jest.mock('../../hooks/use-base-tax-location', () => ({
	useBaseTaxLocation: () => ({ country: 'US', state: 'CA', city: '', postcode: '' }),
}));

type OrderMeta = { key?: string; value?: unknown };

/**
 * A stand-in for an RxDocument. Every cart write hands React a NEW document instance, so
 * the tests below swap the object while leaving the underlying values alone — exactly the
 * shape of the bug this split fixes.
 */
function makeOrder(meta: OrderMeta[] = []): OrderDocument {
	return {
		meta_data$: new BehaviorSubject<OrderMeta[]>(meta),
		billing$: new BehaviorSubject<Record<string, string | undefined>>({}),
		shipping$: new BehaviorSubject<Record<string, string | undefined>>({}),
	} as unknown as OrderDocument;
}

function latestState(): QueryStateOf<'tax-rates'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('provider tax-rates binding was not called');
	return call[1] as QueryStateOf<'tax-rates'>;
}

beforeEach(() => {
	jest.clearAllMocks();
	storeSubjects.tax_based_on$.next('base');
});

describe('TaxRatesProvider query-state consumption', () => {
	function ContextProbe() {
		return <output data-testid="context">{JSON.stringify(useTaxRates())}</output>;
	}

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

/**
 * The regression this split exists for: a cart write swaps the order document identity, and
 * consumers that only read store settings must not be dragged into that render.
 *
 * Both consumers are memoised with no props, so a parent re-render alone cannot re-render
 * them — the only thing that can is the context they subscribe to actually changing.
 */
describe('order identity churn', () => {
	const onSettingsRender = jest.fn();
	const onLocationRender = jest.fn();

	const SettingsConsumer = React.memo(function SettingsConsumer() {
		useTaxSettings();
		onSettingsRender();
		return null;
	});

	const LocationConsumer = React.memo(function LocationConsumer() {
		const { taxBasedOn } = useTaxLocation();
		onLocationRender();
		return <output data-testid="based-on">{taxBasedOn}</output>;
	});

	function Tree({ order }: { order?: OrderDocument }) {
		return (
			<TaxRatesProvider order={order}>
				<SettingsConsumer />
				<LocationConsumer />
			</TaxRatesProvider>
		);
	}

	beforeEach(() => {
		onSettingsRender.mockClear();
		onLocationRender.mockClear();
	});

	it('does not re-render settings consumers when the order document identity changes', () => {
		const { rerender } = render(<Tree order={makeOrder()} />);
		expect(onSettingsRender).toHaveBeenCalledTimes(1);

		// Three cart writes: same values, three new document instances.
		rerender(<Tree order={makeOrder()} />);
		rerender(<Tree order={makeOrder()} />);
		rerender(<Tree order={makeOrder()} />);

		expect(onSettingsRender).toHaveBeenCalledTimes(1);
	});

	it('does not re-render location consumers when the tax basis is unchanged', () => {
		const { rerender } = render(<Tree order={makeOrder()} />);
		expect(onLocationRender).toHaveBeenCalledTimes(1);

		rerender(<Tree order={makeOrder()} />);
		rerender(<Tree order={makeOrder()} />);

		expect(onLocationRender).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('based-on').textContent).toBe('base');
	});

	it('keeps the settings context value referentially stable across order swaps', () => {
		const values: unknown[] = [];
		function Probe() {
			values.push(useTaxSettings());
			return null;
		}

		const { rerender } = render(
			<TaxRatesProvider order={makeOrder()}>
				<Probe />
			</TaxRatesProvider>
		);
		rerender(
			<TaxRatesProvider order={makeOrder()}>
				<Probe />
			</TaxRatesProvider>
		);

		expect(values).toHaveLength(2);
		expect(values[1]).toBe(values[0]);
	});

	/**
	 * The mirror defect: the per-order override used to be read straight off
	 * `order.meta_data` during render, so it only landed if something else happened to
	 * re-render the provider.
	 */
	it('reacts to a tax_based_on override written to the live order document', () => {
		const meta$ = new BehaviorSubject<OrderMeta[]>([]);
		const order = { ...makeOrder(), meta_data$: meta$ } as unknown as OrderDocument;

		render(<Tree order={order} />);
		expect(screen.getByTestId('based-on').textContent).toBe('base');

		act(() => {
			meta$.next([{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }]);
		});

		expect(screen.getByTestId('based-on').textContent).toBe('billing');
	});

	it('ignores a meta override that is not a valid tax basis', () => {
		const meta$ = new BehaviorSubject<OrderMeta[]>([]);
		const order = { ...makeOrder(), meta_data$: meta$ } as unknown as OrderDocument;

		render(<Tree order={order} />);

		act(() => {
			meta$.next([{ key: '_woocommerce_pos_tax_based_on', value: 'nonsense' }]);
		});

		expect(screen.getByTestId('based-on').textContent).toBe('base');
	});
});
