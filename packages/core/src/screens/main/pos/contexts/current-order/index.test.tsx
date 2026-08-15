/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { CurrentOrderProvider, useCurrentOrder, useOpenOrders } from './index';

type OrderDocument = import('@wcpos/database').OrderDocument;
type OpenOrderHit = { id: string; document: OrderDocument };

const openOrders$ = new BehaviorSubject<OpenOrderHit[]>([]);

jest.mock('observable-hooks', () => ({
	ObservableResource: class {},
	useObservableSuspense: () => openOrders$.getValue(),
}));

// Stable identity: the real `useRouter` returns a stable object, and a fresh one per call
// would churn `setCurrentOrderID` and mask what these tests measure.
const router = { setParams: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => router }));

jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order' } }),
}));

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false } }));

/**
 * Documents are compared by identity, exactly as the app does. `makeOrder` stands in for
 * RxDB handing back the SAME instance for an unchanged document and a NEW one for a changed
 * document — the property `wrapEngineDocument`'s cache now preserves.
 */
function makeOrder(uuid: string, revision = 1): OrderDocument {
	return { uuid, revision } as unknown as OrderDocument;
}

const orderA = makeOrder('a');
const orderB = makeOrder('b');

function emit(hits: OpenOrderHit[]) {
	openOrders$.next(hits);
}

describe('CurrentOrderProvider', () => {
	const onCurrentOrderRender = jest.fn();
	const onOpenOrdersRender = jest.fn();

	const CurrentOrderConsumer = React.memo(function CurrentOrderConsumer() {
		const { currentOrder } = useCurrentOrder();
		onCurrentOrderRender();
		return <output data-testid="current">{currentOrder.uuid}</output>;
	});

	const OpenOrdersConsumer = React.memo(function OpenOrdersConsumer() {
		const openOrders = useOpenOrders();
		onOpenOrdersRender();
		return <output data-testid="open">{openOrders.map((hit) => hit.id).join(',')}</output>;
	});

	function Tree() {
		return (
			<CurrentOrderProvider resource={{} as never} currentOrderUUID="a">
				<CurrentOrderConsumer />
				<OpenOrdersConsumer />
			</CurrentOrderProvider>
		);
	}

	beforeEach(() => {
		onCurrentOrderRender.mockClear();
		onOpenOrdersRender.mockClear();
		emit([
			{ id: 'a', document: orderA },
			{ id: 'b', document: orderB },
		]);
	});

	it('resolves the current order from the open-orders list', () => {
		render(<Tree />);

		expect(screen.getByTestId('current').textContent).toBe('a');
		expect(screen.getByTestId('open').textContent).toBe('a,b');
	});

	/**
	 * The payoff for preserving document identity. A write to order `b` re-emits the list with
	 * a NEW array and a new hit object for `b`, but `a` is the very same document instance —
	 * so the current-order half of the context must not tick.
	 */
	it('does not re-render current-order consumers when a background order is written', () => {
		const { rerender } = render(<Tree />);
		const rendersBefore = onCurrentOrderRender.mock.calls.length;

		act(() => {
			emit([
				{ id: 'a', document: orderA },
				{ id: 'b', document: makeOrder('b', 2) },
			]);
		});
		rerender(<Tree />);

		expect(onCurrentOrderRender).toHaveBeenCalledTimes(rendersBefore);
		expect(screen.getByTestId('current').textContent).toBe('a');
	});

	it('still re-renders current-order consumers when the current order itself is written', () => {
		const { rerender } = render(<Tree />);
		const rendersBefore = onCurrentOrderRender.mock.calls.length;

		act(() => {
			emit([
				{ id: 'a', document: makeOrder('a', 2) },
				{ id: 'b', document: orderB },
			]);
		});
		rerender(<Tree />);

		expect(onCurrentOrderRender.mock.calls.length).toBeGreaterThan(rendersBefore);
	});

	it('re-renders the open-orders consumer when a background order is written', () => {
		const { rerender } = render(<Tree />);
		const rendersBefore = onOpenOrdersRender.mock.calls.length;

		act(() => {
			emit([
				{ id: 'a', document: orderA },
				{ id: 'b', document: makeOrder('b', 2) },
			]);
		});
		rerender(<Tree />);

		expect(onOpenOrdersRender.mock.calls.length).toBeGreaterThan(rendersBefore);
	});
});
