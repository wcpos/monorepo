/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import {
	type CurrentOrderActions,
	CurrentOrderProvider,
	type OpenOrderHit,
	useCurrentOrder,
	useCurrentOrderActions,
} from './index';

jest.mock('expo-router', () => ({
	useRouter: () => ({ setParams: jest.fn() }),
}));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: { isWeb: false },
}));

jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order', isNew: true } }),
}));

function orderRecord(uuid: string) {
	return { uuid, payload: {} } as unknown as import('@wcpos/query').EngineRecord<'orders'>;
}

let actions: CurrentOrderActions | undefined;

function Probe() {
	const currentOrderActions = useCurrentOrderActions();
	const { currentOrderRecord } = useCurrentOrder();
	React.useEffect(() => {
		actions = currentOrderActions;
	}, [currentOrderActions]);
	return <span data-testid="rendered-uuid">{currentOrderRecord.uuid}</span>;
}

/** What the cart RENDERS, read out of the tree rather than captured during render. */
function renderedUUID(): string | null {
	return document.querySelector('[data-testid="rendered-uuid"]')?.textContent ?? null;
}

function App({
	currentOrderUUID,
	resource,
}: {
	currentOrderUUID?: string;
	resource: ObservableResource<OpenOrderHit[]>;
}) {
	return (
		<React.Suspense fallback={null}>
			<CurrentOrderProvider
				resource={resource}
				defaultCustomerResource={resource as never}
				currentOrderUUID={currentOrderUUID}
			>
				<Probe />
			</CurrentOrderProvider>
		</React.Suspense>
	);
}

function makeResource() {
	return new ObservableResource(
		new BehaviorSubject([
			{ id: 'order-a', record: orderRecord('order-a') },
			{ id: 'order-b', record: orderRecord('order-b') },
		])
	);
}

beforeEach(() => {
	actions = undefined;
});

/**
 * The cart renders the "new order" while an add lands in a previously selected
 * order.
 *
 * `setCurrentOrderID('')` clears the internal state and calls
 * `router.setParams({ orderId: undefined })`, but that cannot empty the `[...orderId]`
 * catch-all segment: the route keeps `/cart/<previous uuid>`. On a phone the Products and
 * Cart tabs are two focused routes, so every Products -> Cart round trip re-delivers that
 * stale id to the provider. Re-adopting it puts the cart — and `getCurrentOrderRecord()`,
 * which every product tile writes through — back on the order the cashier just left, with
 * no visible tab change while the cashier is on the Products tab.
 *
 * Reproduced by hand on the iOS simulator 2026-09-02: pick the new-order tab, tap
 * Products, tap Cart, and the previous order is selected again with no add in between.
 */
describe('CurrentOrderProvider route-param echo', () => {
	it('keeps the new order when the route re-delivers the id the cashier just left', () => {
		const resource = makeResource();
		const { rerender } = render(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('order-a');

		// The cashier taps the "+" tab.
		act(() => {
			actions!.setCurrentOrderID('');
		});
		expect(renderedUUID()).toBe('new-order');

		// Products tab: its focused route carries no orderId.
		rerender(<App currentOrderUUID={undefined} resource={resource} />);
		expect(renderedUUID()).toBe('new-order');

		// Back to the Cart tab: the catch-all segment still holds the superseded id.
		rerender(<App currentOrderUUID="order-a" resource={resource} />);

		expect(renderedUUID()).toBe('new-order');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('new-order');
	});

	it('still adopts a genuine navigation to a different order', () => {
		const resource = makeResource();
		const { rerender } = render(<App currentOrderUUID="order-a" resource={resource} />);

		act(() => {
			actions!.setCurrentOrderID('');
		});
		expect(renderedUUID()).toBe('new-order');

		// e.g. "open in cart" from the Orders screen (orders/cells/actions.tsx).
		rerender(<App currentOrderUUID="order-b" resource={resource} />);

		expect(renderedUUID()).toBe('order-b');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('order-b');
	});

	/**
	 * P1-1: the parked id has to be released once the ROUTE moves to another order, or the
	 * cart is stuck on that other order for the rest of the session.
	 */
	it('releases the parked id once the route delivers a different order', () => {
		const resource = makeResource();
		const { rerender } = render(<App currentOrderUUID="order-a" resource={resource} />);

		act(() => {
			actions!.setCurrentOrderID('');
		});
		rerender(<App currentOrderUUID="order-b" resource={resource} />);
		expect(renderedUUID()).toBe('order-b');

		// order-a is no longer an echo — the route left it two navigations ago.
		rerender(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('order-a');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('order-a');
	});

	/**
	 * P1-2: the target phone flow. `saveNewOrder` calls `setCurrentOrderID(newUuid)` while
	 * the PRODUCTS route is focused, so `router.setParams` never touches the cart route —
	 * it still holds the parked id. Persisting must therefore not release the mark.
	 */
	it('survives Products -> add -> Cart, and a second round trip', () => {
		const resource = makeResource();
		const { rerender } = render(<App currentOrderUUID="order-a" resource={resource} />);

		act(() => {
			actions!.setCurrentOrderID('');
		});
		// Products tab: its focused route carries no orderId.
		rerender(<App currentOrderUUID={undefined} resource={resource} />);
		// The add persists the new order (stood in for by order-b) from the Products tab.
		act(() => {
			actions!.setCurrentOrderID('order-b');
		});
		expect(renderedUUID()).toBe('order-b');

		// Back to the Cart tab: its route still holds the parked order-a.
		rerender(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('order-b');

		// Second round trip.
		rerender(<App currentOrderUUID={undefined} resource={resource} />);
		rerender(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('order-b');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('order-b');
	});

	it('releases the parked id when the cashier selects that order again', () => {
		const resource = makeResource();
		const { rerender } = render(<App currentOrderUUID="order-a" resource={resource} />);

		act(() => {
			actions!.setCurrentOrderID('');
		});
		act(() => {
			actions!.setCurrentOrderID('order-a');
		});
		expect(renderedUUID()).toBe('order-a');

		// The route echo of order-a is now the truth, not an echo.
		rerender(<App currentOrderUUID={undefined} resource={resource} />);
		rerender(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('order-a');
	});

	it('re-adopts the same order after the cashier selects it again', () => {
		const resource = makeResource();
		const { rerender } = render(<App currentOrderUUID="order-a" resource={resource} />);

		act(() => {
			actions!.setCurrentOrderID('');
		});
		act(() => {
			actions!.setCurrentOrderID('order-a');
		});
		expect(renderedUUID()).toBe('order-a');

		// The route now genuinely carries order-a again.
		rerender(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('order-a');

		// And leaving it a second time must still hold.
		act(() => {
			actions!.setCurrentOrderID('');
		});
		rerender(<App currentOrderUUID="order-a" resource={resource} />);
		expect(renderedUUID()).toBe('new-order');
	});
});
