/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import {
	OrderMoneyDivergenceProvider,
	useOrderMoneyDivergence,
} from '../contexts/order-money-divergence';
import { TotalsChangedBanner } from './totals-changed-banner';

type EngineEvent = Record<string, unknown> & { type: string };

const listeners = new Set<(event: EngineEvent) => void>();
let engineGeneration = 0;
let currentOrderUuid: string | undefined = 'order-a';

function emit(event: EngineEvent) {
	act(() => {
		for (const listener of [...listeners]) listener(event);
	});
}

const mockEvents = (callback: (event: EngineEvent) => void) => {
	listeners.add(callback);
	return () => listeners.delete(callback);
};

// Mirrors QueryProvider: the runtime is memoized, so the engine reference is
// STABLE across renders and only changes when the scope does.
const engines = [
	{ id: 0, events: mockEvents },
	{ id: 1, events: mockEvents },
];

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: engines[engineGeneration] }),
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
	useCurrentOrder: () => ({ currentOrder: { uuid: currentOrderUuid } }),
}));

jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

function divergence(recordId: string, fields: { field: string; expected: string; got: string }[]) {
	return {
		type: 'order-money-divergence',
		collection: 'orders',
		recordId,
		mutationId: 'm1',
		mode: 'server-precision',
		fields,
	};
}

function renderBanner() {
	return render(
		<OrderMoneyDivergenceProvider>
			<TotalsChangedBanner />
		</OrderMoneyDivergenceProvider>
	);
}

beforeEach(() => {
	listeners.clear();
	engineGeneration = 0;
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
		expect(screen.getByTestId('order-totals-changed-total').textContent).toBe(
			'Total: 36.68 → 50.07'
		);
		expect(screen.queryByTestId('order-totals-changed-other')).toBeNull();
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

		expect(screen.getByTestId('order-totals-changed-other').textContent).toBe(
			'2 other amounts also changed'
		);
	});

	it('still alerts when the total held but a component moved', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total_tax', expected: '6.71', got: '11.10' }]));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
		expect(screen.queryByTestId('order-totals-changed-total')).toBeNull();
		expect(screen.getByTestId('order-totals-changed-other').textContent).toBe(
			'1 other amount also changed'
		);
	});

	it('dismisses for that order and stays dismissed', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		fireEvent.click(screen.getByTestId('order-totals-changed-dismiss'));
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
				<TotalsChangedBanner />
			</OrderMoneyDivergenceProvider>
		);

		expect(screen.getByTestId('order-totals-changed-total').textContent).toBe(
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
				<TotalsChangedBanner />
				<Probe />
			</OrderMoneyDivergenceProvider>
		);
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		emit(divergence('order-b', [{ field: 'total', expected: '3.00', got: '4.00' }]));

		fireEvent.click(screen.getByTestId('order-totals-changed-dismiss'));
		rerender(
			<OrderMoneyDivergenceProvider>
				<TotalsChangedBanner />
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

		expect(screen.getByTestId('order-totals-changed-total').textContent).toBe('Total: 2.00 → 3.00');
	});

	it('drops everything on a store switch — the orders belong to the previous till', () => {
		const { rerender } = renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();

		engineGeneration += 1;
		rerender(
			<OrderMoneyDivergenceProvider>
				<TotalsChangedBanner />
			</OrderMoneyDivergenceProvider>
		);

		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
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
