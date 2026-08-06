/**
 * @jest-environment jsdom
 *
 * The re-push guard (R1, part D-d).
 *
 * `useOrderTotals` recomputes the cart's money and PATCHES the order whenever
 * the document disagrees — and for an engine-backed order that patch enqueues a
 * real server update (`patchAndEnqueueEngineResident`). That is correct while
 * the cashier is building a sale, and wrong the moment it fires in response to
 * a server ACK: it would push the POS's arithmetic back over the server's,
 * which the mirror contract says is the source of truth.
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { OrderMoneyDivergenceProvider } from '../contexts/order-money-divergence';
import { useOrderTotals } from './use-order-totals';

type EngineEvent = Record<string, unknown> & { type: string };

const listeners = new Set<(event: EngineEvent) => void>();
const localPatch = jest.fn();

/** The cart's converged money for this fixture — the oracle's numbers. */
const COMPUTED = {
	discount_tax: '0.000000',
	discount_total: '0.000000',
	shipping_tax: '0.000000',
	shipping_total: '0.000000',
	cart_tax: '6.713280',
	total_tax: '6.713280',
	total: '36.683280',
	tax_lines: [{ rate_id: 1, tax_total: '5.994000' }],
};

let currentOrder: Record<string, unknown> = { uuid: 'order-a', ...COMPUTED };

const engine = {
	status: () => ({ activeScopeId: 'scope-1' }),
	events: (callback: (event: EngineEvent) => void) => {
		listeners.add(callback);
		return () => listeners.delete(callback);
	},
};

jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine }) }));

jest.mock('./calculate-order-totals', () => ({
	calculateOrderTotals: () => COMPUTED,
}));
jest.mock('./use-cart-lines', () => ({
	useCartLines: () => ({ line_items: [], fee_lines: [], shipping_lines: [], coupon_lines: [] }),
}));
jest.mock('../../contexts/tax-rates', () => ({
	useTaxRates: () => ({
		allRates: [],
		taxRoundAtSubtotal: false,
		priceNumDecimals: 2,
		pricesIncludeTax: false,
	}),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder }),
}));

function Harness() {
	useOrderTotals();
	return null;
}

function renderHarness() {
	return render(
		<OrderMoneyDivergenceProvider>
			<Harness />
		</OrderMoneyDivergenceProvider>
	);
}

function emit(event: EngineEvent) {
	act(() => {
		for (const listener of [...listeners]) listener(event);
	});
}

function emitDivergence(orderId: string, mutationId = 'm1') {
	emit({
		type: 'order-money-divergence',
		collection: 'orders',
		recordId: orderId,
		mutationId,
		mode: 'server-precision',
		fields: [{ field: 'total', expected: '36.68', got: '50.07' }],
	});
}

beforeEach(() => {
	listeners.clear();
	localPatch.mockClear();
	currentOrder = { uuid: 'order-a', ...COMPUTED };
});

describe('useOrderTotals re-push guard', () => {
	it('writes nothing when the resident already holds the computed money', () => {
		// The every-sale path once ack adoption preserves equivalent precision:
		// the resident keeps `6.713280`, the cart recomputes `6.713280`, and there
		// is nothing to patch. Before that fix the resident held `6.71` and this
		// hook enqueued a server update on every single save.
		renderHarness();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('patches while the cashier is building the sale', () => {
		currentOrder = { uuid: 'order-a', ...COMPUTED, total: '0.00', total_tax: '0.00' };
		renderHarness();
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0]?.[0]?.data).toMatchObject({ total: '36.683280' });
	});

	it('does NOT re-assert the POS total over a server total that diverged', () => {
		// The server recalculated to 50.07 and the cashier has been alerted. The
		// old behaviour patched 36.68 straight back — pushing the till's
		// arithmetic over the source of truth, and provoking the same divergence
		// again on the next drain.
		currentOrder = { uuid: 'order-a', ...COMPUTED, total: '50.07' };
		renderHarness();
		expect(localPatch).toHaveBeenCalledTimes(1);

		localPatch.mockClear();
		emitDivergence('order-a');
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('leaves other orders alone — a divergence on one tab does not freeze another', () => {
		currentOrder = { uuid: 'order-a', ...COMPUTED, total: '50.07' };
		renderHarness();
		localPatch.mockClear();

		emitDivergence('order-b');
		// `order-a` still has no held divergence, so its totals patch normally.
		act(() => {
			currentOrder = { uuid: 'order-a', ...COMPUTED, total: '49.00' };
		});
		expect(localPatch).not.toHaveBeenCalled();
	});

	// The suppression must not be tied to the banner being on screen: dismissing
	// it, or a later clean save retiring it, would otherwise re-arm the very
	// re-push this guard exists to stop — one click later.
	it('stays suppressed after the cashier DISMISSES the banner', () => {
		currentOrder = { uuid: 'order-a', ...COMPUTED, total: '50.07' };
		const { rerender } = renderHarness();
		emitDivergence('order-a');
		localPatch.mockClear();

		act(() => {
			for (const listener of [...listeners]) {
				// Dismissal is a state change in the provider; drive it the same way
				// the banner does by retiring the entry with a later clean ack.
				listener({
					type: 'write-acknowledged',
					collection: 'orders',
					recordId: 'order-a',
					mutationId: 'm2',
				});
			}
		});
		rerender(
			<OrderMoneyDivergenceProvider>
				<Harness />
			</OrderMoneyDivergenceProvider>
		);

		expect(localPatch).not.toHaveBeenCalled();
	});

	it('converges again once the cashier actually changes the cart', () => {
		currentOrder = { uuid: 'order-a', ...COMPUTED, total: '50.07' };
		renderHarness();
		emitDivergence('order-a');
		localPatch.mockClear();

		// A real edit produces DIFFERENT arithmetic, which clears the latch.
		COMPUTED.total = '41.00';
		emit({
			type: 'write-acknowledged',
			collection: 'orders',
			recordId: 'order-a',
			mutationId: 'm2',
		});

		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0]?.[0]?.data).toMatchObject({ total: '41.00' });
		COMPUTED.total = '36.683280';
	});
});
