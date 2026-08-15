/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { TaxRatesProvider, useTaxLocation, useTaxSettings } from './provider';
import { useTaxRates } from './use-tax-rates';

import type { QueryStateOf } from '../../../../query';

type OrderDocument = import('@wcpos/database').OrderDocument;

describe('tax context public API documentation', () => {
	it('documents every export added by the context split', () => {
		const source = readFileSync(join(__dirname, 'provider.tsx'), 'utf8');

		expect(source).toContain(
			'/** Address fields used to select the applicable tax rates. */\nexport interface TaxLocation'
		);
		expect(source).toContain(
			"/** Supported sources for resolving an order's tax location. */\nexport type TaxBasedOn"
		);
		expect(source).toContain(
			'/** Combined tax settings and location contract returned by `useTaxRates()`. */\nexport type TaxRatesContextProps'
		);
		expect(source).toContain(
			'/** Order-independent tax settings context. Prefer `useTaxSettings()` when consuming it. */\nexport const TaxSettingsContext'
		);
		expect(source).toContain(
			'/** Order-dependent tax location context. Prefer `useTaxLocation()` when consuming it. */\nexport const TaxLocationContext'
		);
	});
});

const allRates = [
	{ id: 1, class: 'standard', country: '', state: '', cities: [], postcodes: [] },
	{ id: 2, class: 'reduced-rate', country: '', state: '', cities: [], postcodes: [] },
];
const mockResource = { hits: allRates.map((document) => ({ document })) };

/**
 * Swappable so the address tests can supply country-specific rates; reset in `beforeEach`.
 */
let activeResource: { hits: { document: unknown }[] } = mockResource;

const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => ({
	resource: activeResource,
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
	activeResource = mockResource;
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

/**
 * The split must not cost the thing the order-dependent half exists for: when tax is based
 * on the customer's billing or shipping address, editing that address has to re-filter the
 * rates. These drive the real `filterTaxRates` against country-specific rates, so a rate
 * actually changes — not just an object identity.
 */
describe('tax follows the customer address', () => {
	const usRate = {
		id: 10,
		class: 'standard',
		country: 'US',
		state: '',
		cities: [],
		postcodes: [],
		rate: '10.0',
	};
	const gbRate = {
		id: 20,
		class: 'standard',
		country: 'GB',
		state: '',
		cities: [],
		postcodes: [],
		rate: '20.0',
	};

	function RatesProbe() {
		const { rates } = useTaxLocation();
		return <output data-testid="rate-ids">{rates.map((rate) => rate.id).join(',')}</output>;
	}

	function renderWithOrder(order: OrderDocument) {
		return render(
			<TaxRatesProvider order={order}>
				<RatesProbe />
			</TaxRatesProvider>
		);
	}

	beforeEach(() => {
		activeResource = { hits: [usRate, gbRate].map((document) => ({ document })) };
	});

	it('re-filters the rates when the billing address changes', () => {
		storeSubjects.tax_based_on$.next('billing');
		const billing$ = new BehaviorSubject<Record<string, string | undefined>>({ country: 'US' });
		const order = { ...makeOrder(), billing$ } as unknown as OrderDocument;

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			billing$.next({ country: 'GB' });
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('20');
	});

	it('re-filters the rates when the shipping address changes', () => {
		storeSubjects.tax_based_on$.next('shipping');
		const shipping$ = new BehaviorSubject<Record<string, string | undefined>>({ country: 'US' });
		const order = { ...makeOrder(), shipping$ } as unknown as OrderDocument;

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			shipping$.next({ country: 'GB' });
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('20');
	});

	it('ignores the customer address while tax is based on the shop base address', () => {
		// baseLocation is mocked to US, so the US rate must hold regardless of billing.
		const billing$ = new BehaviorSubject<Record<string, string | undefined>>({ country: 'GB' });
		const order = { ...makeOrder(), billing$ } as unknown as OrderDocument;

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			billing$.next({ country: 'GB', city: 'London' });
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('10');
	});

	/**
	 * Both fixes at once: the per-order meta override flips the basis from base to billing,
	 * and the rates must follow the customer address from that point on.
	 */
	it('switches to the billing address when the order meta override lands', () => {
		const meta$ = new BehaviorSubject<OrderMeta[]>([]);
		const billing$ = new BehaviorSubject<Record<string, string | undefined>>({ country: 'GB' });
		const order = { ...makeOrder(), meta_data$: meta$, billing$ } as unknown as OrderDocument;

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			meta$.next([{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }]);
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('20');
	});
});
