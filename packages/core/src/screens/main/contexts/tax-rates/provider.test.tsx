/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, map } from 'rxjs';

import type { EngineRecord } from '@wcpos/query';

import { TaxRatesProvider, useTaxLocation, useTaxSettings } from './provider';
import { useTaxRates } from './use-tax-rates';
import {
	CurrentOrderContext,
	type CurrentOrderContextProps,
} from '../../pos/contexts/current-order/context';

import type { QueryStateOf } from '../../../../query';

type TestOrderRecord = EngineRecord<'orders'> & {
	patchPayload: (patch: Record<string, unknown>) => void;
};

const allRates = [
	{ id: 1, class: 'standard', country: '', state: '', cities: [], postcodes: [] },
	{ id: 2, class: 'reduced-rate', country: '', state: '', cities: [], postcodes: [] },
];
const mockResult = { hits: allRates.map((payload) => ({ record: { payload } })) };

/**
 * Swappable so the address tests can supply country-specific rates; reset in `beforeEach`.
 */
let activeResult: { hits: { record: { payload: unknown }; document?: unknown }[] } = mockResult;

// The tax-rates query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
// Built on the first acquire, so it answers with the `activeResult` the test has set by then.
let mockHandle: FakeHandle | null = null;
const mockUseCollectionQueryHandle = jest.fn(
	(_collection: unknown, _state: unknown) =>
		(mockHandle ??= fakeQueryHandle({ result: activeResult }))
);

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('../../../../query', () => {
	const actual = jest.requireActual('../../../../query');
	return {
		...actual,
		useCollectionQueryHandle: (collection: unknown, state: unknown) =>
			mockUseCollectionQueryHandle(collection, state),
	};
});

// The real boundary with a reset control: the provider wires `onReset` to the handle's retry
// and `resetKeys` to the handle. (The app's fallback pulls in the styling runtime.)
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({
			children,
			onReset,
			resetKeys,
		}: {
			children: React.ReactNode;
			onReset?: () => void;
			resetKeys?: unknown[];
		}) => (
			<ErrorBoundary
				onReset={onReset}
				resetKeys={resetKeys}
				fallbackRender={({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
					<button data-testid="tax-settings-error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
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

jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({ store: storeSubjects });
	return { useAppState, useStoreSession: useAppState };
});
jest.mock('../../hooks/use-base-tax-location', () => ({
	useBaseTaxLocation: () => ({ country: 'US', state: 'CA', city: '', postcode: '' }),
}));

type OrderMeta = { key?: string; value?: unknown };

/**
 * A stand-in for an RxDocument. Every cart write hands React a NEW document instance, so
 * the tests below swap the object while leaving the underlying values alone — exactly the
 * shape of the bug this split fixes.
 */
function makeOrder(meta: OrderMeta[] = []): TestOrderRecord {
	const payload$ = new BehaviorSubject<Record<string, unknown>>({
		meta_data: meta,
		billing: {},
		shipping: {},
	});
	const record = {
		uuid: 'order-uuid',
		remoteId: null,
		get payload() {
			return payload$.value;
		},
		collection: { name: 'orders' },
		getLatest: () => record,
		toJSON: () => ({ uuid: 'order-uuid', remoteId: null, remoteKey: '', payload: payload$.value }),
		$: payload$.pipe(
			map((payload) => ({
				toJSON: () => ({ uuid: 'order-uuid', remoteId: null, remoteKey: '', payload }),
			}))
		),
		patchPayload: (patch: Record<string, unknown>) =>
			payload$.next({ ...payload$.value, ...patch }),
	};
	return record as unknown as TestOrderRecord;
}

function latestState(): QueryStateOf<'tax-rates'> {
	const call = mockUseCollectionQueryHandle.mock.calls.at(-1);
	if (!call) throw new Error('provider tax-rates handle was not acquired');
	return call[1] as QueryStateOf<'tax-rates'>;
}

beforeEach(() => {
	jest.clearAllMocks();
	storeSubjects.tax_based_on$.next('base');
	activeResult = mockResult;
	mockHandle = null;
});

describe('TaxRatesProvider query-state consumption', () => {
	function ContextProbe() {
		return <output data-testid="context">{JSON.stringify(useTaxRates())}</output>;
	}

	function RatesProbe() {
		const { rates } = useTaxLocation();
		return <output data-testid="rate-ids">{rates.map((rate) => rate.id).join(',')}</output>;
	}

	function AllRatesProbe() {
		const { allRates: published } = useTaxSettings();
		return <output data-testid="all-rate-ids">{published.map((rate) => rate.id).join(',')}</output>;
	}

	it('owns an all-rates handle and does not republish its query object', () => {
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
		expect(mockUseCollectionQueryHandle.mock.calls.at(-1)?.[0]).toBe('tax-rates');
		const context = JSON.parse(screen.getByTestId('context').textContent ?? '') as Record<
			string,
			unknown
		>;
		expect(context.allRates).toHaveLength(2);
		expect(context.taxClasses).toEqual(['standard', 'reduced-rate']);
		expect(context).not.toHaveProperty('taxQuery');
	});

	it('publishes the rates the acquired handle answers with', () => {
		render(
			<TaxRatesProvider>
				<AllRatesProbe />
			</TaxRatesProvider>
		);
		expect(screen.getByTestId('all-rate-ids').textContent).toBe('1,2');

		act(() => mockHandle?.set({ result: { hits: [{ record: { payload: allRates[1] } }] } }));
		expect(screen.getByTestId('all-rate-ids').textContent).toBe('2');
	});

	it('throws a failed read to its own boundary, whose reset asks the handle again', async () => {
		const failed = fakeQueryHandle({ ready: false, error: new Error('read failed') });
		const retry = jest.fn(() => failed.set({ error: null, ready: false }));
		failed.retry = retry;
		mockHandle = failed;
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			render(
				<TaxRatesProvider>
					<AllRatesProbe />
				</TaxRatesProvider>
			);
			expect(screen.getByTestId('tax-settings-error-reset')).toBeTruthy();
			expect(screen.queryByTestId('all-rate-ids')).toBeNull();

			// A remount over the same failed handle would throw again; the reset retries first.
			act(() => {
				fireEvent.click(screen.getByTestId('tax-settings-error-reset'));
			});
			expect(retry).toHaveBeenCalledTimes(1);
			expect(screen.queryByTestId('tax-settings-error-reset')).toBeNull();
			expect(screen.queryByTestId('all-rate-ids')).toBeNull();

			await act(async () => failed.set({ ready: true, result: mockResult }));
			expect(screen.getByTestId('all-rate-ids').textContent).toBe('1,2');
		} finally {
			consoleError.mockRestore();
		}
	});

	/**
	 * A coverage-generation bump (the tax-rates modal's clear-and-sync) moves the scope key, so
	 * the provider is handed a fresh, unanswered handle. The POS body must keep the current
	 * rates until it answers: suspending would swap it for the provider's `null` fallback.
	 */
	it('keeps the current rates published while a changed handle answers', async () => {
		const tree = () => (
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<TaxRatesProvider>
					<AllRatesProbe />
				</TaxRatesProvider>
			</React.Suspense>
		);
		const { rerender } = render(tree());
		expect(screen.getByTestId('all-rate-ids').textContent).toBe('1,2');

		const next = fakeQueryHandle({ ready: false });
		mockHandle = next;
		await act(async () => rerender(tree()));
		expect(mockUseCollectionQueryHandle).toHaveReturnedWith(next);
		// A suspended update HIDES revealed content (`display: none`) rather than unmounting
		// it, so the text alone would survive a blanked body: visibility is the instrument.
		const probe = screen.getByTestId('all-rate-ids');
		expect(probe.style.display).not.toBe('none');
		expect(probe.textContent).toBe('1,2');
		expect(screen.queryByTestId('route-fallback')).toBeNull();

		await act(async () =>
			next.set({ ready: true, result: { hits: [{ record: { payload: allRates[0] } }] } })
		);
		expect(screen.getByTestId('all-rate-ids').textContent).toBe('1');
	});

	it('uses the plain payload id as the equal-priority tax-rate tiebreak', () => {
		const higherPayloadId = { ...allRates[0], id: 9, country: 'US', priority: 1 };
		const lowerPayloadId = { ...allRates[0], id: 4, country: 'US', priority: 1 };
		activeResult = {
			hits: [
				{ record: { payload: higherPayloadId }, document: { ...higherPayloadId, id: 1 } },
				{ record: { payload: lowerPayloadId }, document: { ...lowerPayloadId, id: 2 } },
			],
		};

		render(
			<TaxRatesProvider>
				<RatesProbe />
			</TaxRatesProvider>
		);

		expect(screen.getByTestId('rate-ids').textContent).toBe('4');
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

	function Tree({ order }: { order?: TestOrderRecord }) {
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
		const order = makeOrder();

		render(<Tree order={order} />);
		expect(screen.getByTestId('based-on').textContent).toBe('base');

		act(() => {
			order.patchPayload({
				meta_data: [{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }],
			});
		});

		expect(screen.getByTestId('based-on').textContent).toBe('billing');
	});

	it('ignores a meta override that is not a valid tax basis', () => {
		const order = makeOrder();

		render(<Tree order={order} />);

		act(() => {
			order.patchPayload({
				meta_data: [{ key: '_woocommerce_pos_tax_based_on', value: 'nonsense' }],
			});
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

	function renderWithOrder(order: TestOrderRecord) {
		return render(
			<TaxRatesProvider order={order}>
				<RatesProbe />
			</TaxRatesProvider>
		);
	}

	beforeEach(() => {
		activeResult = { hits: [usRate, gbRate].map((payload) => ({ record: { payload } })) };
	});

	it('re-filters the rates when the billing address changes', () => {
		storeSubjects.tax_based_on$.next('billing');
		const order = makeOrder();
		order.patchPayload({ billing: { country: 'US' } });

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			order.patchPayload({ billing: { country: 'GB' } });
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('20');
	});

	it('re-filters the rates when the shipping address changes', () => {
		storeSubjects.tax_based_on$.next('shipping');
		const order = makeOrder();
		order.patchPayload({ shipping: { country: 'US' } });

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			order.patchPayload({ shipping: { country: 'GB' } });
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('20');
	});

	it('ignores the customer address while tax is based on the shop base address', () => {
		// baseLocation is mocked to US, so the US rate must hold regardless of billing.
		const order = makeOrder();
		order.patchPayload({ billing: { country: 'GB' } });

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			order.patchPayload({ billing: { country: 'GB', city: 'London' } });
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('10');
	});

	/**
	 * Both fixes at once: the per-order meta override flips the basis from base to billing,
	 * and the rates must follow the customer address from that point on.
	 */
	it('switches to the billing address when the order meta override lands', () => {
		const order = makeOrder();
		order.patchPayload({ billing: { country: 'GB' } });

		renderWithOrder(order);
		expect(screen.getByTestId('rate-ids').textContent).toBe('10');

		act(() => {
			order.patchPayload({
				meta_data: [{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }],
			});
		});

		expect(screen.getByTestId('rate-ids').textContent).toBe('20');
	});
});

/**
 * The provider subscribes to the current order ITSELF rather than being handed it by an
 * ancestor. That is the fix for the reported bug: `POSStack` used to call `useCurrentOrder()`
 * purely to pass the order down, which put a cart-write subscription above the POS navigator
 * and re-rendered the whole products panel on every add/remove.
 *
 * Measured before the fix: `POSProductsContent` ×4, `ProductGrid` ×4, `ProductTile` ×80 per
 * cart mutation.
 */
describe('current-order subscription', () => {
	function LocationProbe() {
		const { taxBasedOn } = useTaxLocation();
		return <output data-testid="based-on">{taxBasedOn}</output>;
	}

	function withOrder(order: TestOrderRecord, children: React.ReactNode) {
		return (
			<CurrentOrderContext.Provider
				value={{ currentOrderRecord: order } as unknown as CurrentOrderContextProps}
			>
				{children}
			</CurrentOrderContext.Provider>
		);
	}

	it('resolves the order from context when no order prop is given', () => {
		const order = makeOrder([{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }]);

		render(
			withOrder(
				order,
				<TaxRatesProvider>
					<LocationProbe />
				</TaxRatesProvider>
			)
		);

		expect(screen.getByTestId('based-on').textContent).toBe('billing');
	});

	it('follows a live write to the context order', () => {
		const order = makeOrder();

		render(
			withOrder(
				order,
				<TaxRatesProvider>
					<LocationProbe />
				</TaxRatesProvider>
			)
		);
		expect(screen.getByTestId('based-on').textContent).toBe('base');

		act(() => {
			order.patchPayload({
				meta_data: [{ key: '_woocommerce_pos_tax_based_on', value: 'shipping' }],
			});
		});

		expect(screen.getByTestId('based-on').textContent).toBe('shipping');
	});

	it('falls back to the shop base address with no current order at all', () => {
		render(
			<TaxRatesProvider>
				<LocationProbe />
			</TaxRatesProvider>
		);

		expect(screen.getByTestId('based-on').textContent).toBe('base');
	});

	it('still honours an explicit order prop, which overrides context', () => {
		const contextOrder = makeOrder();
		const propOrder = makeOrder([{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }]);

		render(
			withOrder(
				contextOrder,
				<TaxRatesProvider order={propOrder}>
					<LocationProbe />
				</TaxRatesProvider>
			)
		);

		expect(screen.getByTestId('based-on').textContent).toBe('billing');
	});
});
