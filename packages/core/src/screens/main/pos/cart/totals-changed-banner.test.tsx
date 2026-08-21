/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import {
	OrderMoneyDivergenceProvider,
	useOrderMoneyDivergence,
} from '../contexts/order-money-divergence';
import { CartTotalsChangedBanner, TotalsChangedBanner } from './totals-changed-banner';

type EngineEvent = Record<string, unknown> & { type: string };

const listeners = new Set<(event: EngineEvent) => void>();
let activeScopeId = 'scope-1';
let currentOrderUuid: string | undefined = 'order-a';

function emit(event: EngineEvent) {
	act(() => {
		for (const listener of [...listeners]) listener(event);
	});
}

/**
 * Move the ACTIVE SCOPE the way a same-site store switch does: the engine
 * INSTANCE is kept and the move is announced as a `scope-switched` event.
 */
function switchScope(next: string) {
	activeScopeId = next;
	emit({ type: 'scope-switched', scopeId: next, from: 'scope-1' });
}

const engine = {
	status: () => ({ activeScopeId }),
	events: (callback: (event: EngineEvent) => void) => {
		listeners.add(callback);
		return () => listeners.delete(callback);
	},
};

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine }),
}));

jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/vstack', () => {
	const { View } = jest.requireActual('react-native');
	return { VStack: View };
});
jest.mock('@wcpos/components/icon-button', () => {
	const { Pressable } = jest.requireActual('react-native');
	return {
		IconButton: (props: Record<string, unknown>) => <Pressable {...props} />,
	};
});

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: currentOrderUuid } }),
}));

jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

function divergence(
	recordId: string,
	fields: { field: string; expected: string; got: string }[],
	mutationId = 'm1'
) {
	return {
		type: 'order-money-divergence',
		collection: 'orders',
		recordId,
		mutationId,
		mode: 'server-precision',
		fields,
	};
}

function acknowledged(recordId: string, mutationId: string) {
	return { type: 'write-acknowledged', collection: 'orders', recordId, mutationId };
}

function renderBanner() {
	return render(
		<OrderMoneyDivergenceProvider>
			<CartTotalsChangedBanner />
		</OrderMoneyDivergenceProvider>
	);
}

beforeEach(() => {
	listeners.clear();
	activeScopeId = 'scope-1';
	currentOrderUuid = 'order-a';
});

describe('TotalsChangedBanner', () => {
	it('renders nothing on an ordinary sale — the common path must be silent', () => {
		const { container } = renderBanner();
		expect(container.firstChild).toBeNull();
	});

	it('shows the total the store changed it to, so the cashier can check before handing over goods', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		expect(screen.getByTestId('order-totals-changed-banner').textContent).toContain(
			"Your store changed this order's totals"
		);
		expect(screen.getByTestId('order-totals-changed-banner-total').textContent).toBe(
			'Total: 36.68 → 50.07'
		);
		expect(screen.queryByTestId('order-totals-changed-banner-other')).toBeNull();
	});

	it('counts the other amounts that moved without listing payload paths at a cashier', () => {
		renderBanner();
		emit(
			divergence('order-a', [
				{ field: 'total', expected: '36.68', got: '50.07' },
				{ field: 'total_tax', expected: '6.71', got: '11.10' },
				{ field: 'line_items[abc].total', expected: '29.97', got: '19.98' },
			])
		);

		expect(screen.getByTestId('order-totals-changed-banner-other').textContent).toBe(
			'2 other amounts also changed'
		);
	});

	it('still alerts when the total held but a component moved', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total_tax', expected: '6.71', got: '11.10' }]));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
		expect(screen.queryByTestId('order-totals-changed-banner-total')).toBeNull();
		expect(screen.getByTestId('order-totals-changed-banner-other').textContent).toBe(
			'1 other amount also changed'
		);
	});

	it('dismisses for that order and stays dismissed', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		fireEvent.click(screen.getByTestId('order-totals-changed-banner-dismiss'));
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	it('does not block the sale — it renders inline, not as a modal or a gate', () => {
		// The banner is a sibling of the totals block; it never mounts a portal or
		// a dialog. Pinned structurally so a future redesign cannot quietly turn
		// this into something that stops a cashier mid-sale.
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
});

describe('multi-tab scoping', () => {
	it('does not alert on the order the cashier is looking at when a DIFFERENT order diverged', () => {
		renderBanner();
		emit(divergence('order-b', [{ field: 'total', expected: '10.00', got: '12.00' }]));

		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	it('surfaces the held alert when the cashier switches to that order’s tab', () => {
		const { rerender } = renderBanner();
		emit(divergence('order-b', [{ field: 'total', expected: '10.00', got: '12.00' }]));
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();

		currentOrderUuid = 'order-b';
		rerender(
			<OrderMoneyDivergenceProvider>
				<CartTotalsChangedBanner />
			</OrderMoneyDivergenceProvider>
		);

		expect(screen.getByTestId('order-totals-changed-banner-total').textContent).toBe(
			'Total: 10.00 → 12.00'
		);
	});

	it('dismissing one order leaves another order’s alert standing', () => {
		function Probe() {
			const { divergence: held } = useOrderMoneyDivergence('order-b');
			return <span data-testid="probe">{held ? 'held' : 'none'}</span>;
		}
		const { rerender } = render(
			<OrderMoneyDivergenceProvider>
				<CartTotalsChangedBanner />
				<Probe />
			</OrderMoneyDivergenceProvider>
		);
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		emit(divergence('order-b', [{ field: 'total', expected: '3.00', got: '4.00' }]));

		fireEvent.click(screen.getByTestId('order-totals-changed-banner-dismiss'));
		rerender(
			<OrderMoneyDivergenceProvider>
				<CartTotalsChangedBanner />
				<Probe />
			</OrderMoneyDivergenceProvider>
		);

		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
		expect(screen.getByTestId('probe').textContent).toBe('held');
	});

	it('renders nothing for an unsaved order that has no uuid yet', () => {
		currentOrderUuid = undefined;
		const { container } = renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		expect(container.firstChild).toBeNull();
	});
});

describe('lifecycle', () => {
	it('re-states an order’s divergence when it is saved again', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		emit(divergence('order-a', [{ field: 'total', expected: '2.00', got: '3.00' }]));

		expect(screen.getByTestId('order-totals-changed-banner-total').textContent).toBe(
			'Total: 2.00 → 3.00'
		);
	});

	it('retires the alert when a LATER save of the same order comes back clean', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }], 'm1'));
		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();

		// The cashier corrected the sale and saved again; the server kept the money
		// this time. A banner still quoting the old amounts would be a lie.
		emit(acknowledged('order-a', 'm2'));
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	it('is NOT retired by its own acknowledgement — both ride the same drain flush', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }], 'm1'));
		emit(acknowledged('order-a', 'm1'));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
	});

	it('drops everything on a store switch — the orders belong to the previous till', () => {
		// A SAME-SITE store switch keeps the engine instance and only moves the
		// scope, so engine identity alone would carry one till's alerts into the
		// next. The engine announces the move; the store clears on it.
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();

		switchScope('scope-2');
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	it('does not resurrect them when the cashier switches BACK', () => {
		// Masking a foreign scope's entries behind a read-time check leaves them in
		// state: store A → B → A and the dead banner walks again. Clearing on the
		// switch throws them away for real.
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));

		switchScope('scope-2');
		switchScope('scope-1');

		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	it('keeps the POS mounted across a scope switch — the store is not a remount boundary', () => {
		// A `key` on this provider would tear down every child, including the cart
		// and an open checkout modal, the moment the engine's scope id resolves
		// from null. That broke a checkout E2E; the store must reset itself
		// WITHOUT taking the screen with it.
		let mounts = 0;
		function MountCounter() {
			React.useEffect(() => {
				mounts += 1;
			}, []);
			return null;
		}
		render(
			<OrderMoneyDivergenceProvider>
				<CartTotalsChangedBanner />
				<MountCounter />
			</OrderMoneyDivergenceProvider>
		);
		expect(mounts).toBe(1);

		switchScope('scope-2');
		switchScope('scope-1');

		expect(mounts).toBe(1);
	});

	it('unsubscribes on unmount so a drain tick cannot set state on a dead tree', () => {
		const { unmount } = renderBanner();
		expect(listeners.size).toBe(1);
		unmount();
		expect(listeners.size).toBe(0);
	});

	it('ignores every other engine event', () => {
		renderBanner();
		emit({
			type: 'write-acknowledged',
			collection: 'orders',
			recordId: 'order-a',
		});
		emit({ type: 'lane-finish', lane: 'write-drain' });
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});
});

describe('the checkout mount', () => {
	// The Pay button's own save is usually the write that diverges, and it opens
	// a full-height modal over the cart the instant the ack lands. Without a
	// mount inside that modal the cashier can take payment having never seen it —
	// the one moment the ruling names, "before goods change hands".
	function renderCheckout(orderId: string) {
		return render(
			<OrderMoneyDivergenceProvider>
				<CartTotalsChangedBanner />
				<TotalsChangedBanner orderId={orderId} testID="checkout-totals-changed-banner" />
			</OrderMoneyDivergenceProvider>
		);
	}

	it('shows the held divergence inside checkout, under its own testID', () => {
		renderCheckout('order-a');
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		expect(screen.getByTestId('checkout-totals-changed-banner')).toBeTruthy();
		expect(screen.getByTestId('checkout-totals-changed-banner-total').textContent).toBe(
			'Total: 36.68 → 50.07'
		);
		// Both mounts are live at once (the cart sits behind the modal), so their
		// selectors must not collide for E2E.
		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
	});

	it('is silent in checkout for an order that did not diverge', () => {
		renderCheckout('order-a');
		emit(divergence('order-b', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		expect(screen.queryByTestId('checkout-totals-changed-banner')).toBeNull();
	});

	it('dismisses from checkout without leaving the cart copy behind', () => {
		renderCheckout('order-a');
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		fireEvent.click(screen.getByTestId('checkout-totals-changed-banner-dismiss'));

		expect(screen.queryByTestId('checkout-totals-changed-banner')).toBeNull();
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});
});
