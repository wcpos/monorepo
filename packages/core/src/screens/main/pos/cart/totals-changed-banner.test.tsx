/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import {
	OrderEngineWarningsProvider,
	useReportEngineWarnings,
} from '../contexts/order-engine-warnings';
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
// DocsLink reaches expo-linking through openExternalURL, which this suite's
// transform cannot parse. Rendered as an anchor so `href` stays assertable.
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ href, children, testID }: Record<string, unknown>) => (
		<a data-testid={testID as string} href={href as string}>
			{children as string}
		</a>
	),
}));

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

/** Diverge N DISTINCT orders — what the store-level escalation counts. */
function divergeOrders(count: number) {
	for (let i = 0; i < count; i++) {
		emit(divergence(`order-${i}`, [{ field: 'total', expected: '1.00', got: '2.00' }], `m${i}`));
	}
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
		expect(screen.getByTestId('order-totals-changed-banner-field-total').textContent).toBe(
			'Total36.68 → 50.07'
		);
		expect(screen.queryByTestId('order-totals-changed-banner-line-amounts')).toBeNull();
	});

	/**
	 * ADR 0032 §5: the record carries `expected` and `got` per field, and naming
	 * them is what lets support act without a screen share. Order-level slots are
	 * named; per-line paths are counted, because `line_items[<uuid>].total_tax`
	 * means nothing to the person at the counter.
	 */
	it('names every order-level amount that moved', () => {
		renderBanner();
		emit(
			divergence('order-a', [
				{ field: 'total', expected: '36.68', got: '50.07' },
				{ field: 'total_tax', expected: '6.71', got: '11.10' },
				{ field: 'discount_total', expected: '4.00', got: '0.00' },
			])
		);

		expect(screen.getByTestId('order-totals-changed-banner-field-total').textContent).toBe(
			'Total36.68 → 50.07'
		);
		expect(screen.getByTestId('order-totals-changed-banner-field-total_tax').textContent).toBe(
			'Tax6.71 → 11.10'
		);
		expect(screen.getByTestId('order-totals-changed-banner-field-discount_total').textContent).toBe(
			'Discount4.00 → 0.00'
		);
		expect(screen.queryByTestId('order-totals-changed-banner-line-amounts')).toBeNull();
	});

	/**
	 * Regression: `discount_tax` and `shipping_tax` are order-level in the
	 * producer's ORDER_MONEY_FIELDS but were missing from the banner's list, so a
	 * divergence in either fell through to the per-line count — the cashier saw
	 * "1 line amount also differs" and both figures vanished. The two lists have
	 * to agree, and this is the test that says so.
	 */
	it.each([
		['discount_tax', 'Discount tax'],
		['shipping_tax', 'Shipping tax'],
		['cart_tax', 'Item tax'],
		['discount_total', 'Discount'],
		['shipping_total', 'Shipping'],
		['total_tax', 'Tax'],
		['total', 'Total'],
	])('names %s as an order-level amount, not a line one', (field, label) => {
		renderBanner();
		emit(divergence('order-a', [{ field, expected: '1.00', got: '2.00' }]));

		expect(screen.getByTestId(`order-totals-changed-banner-field-${field}`).textContent).toBe(
			`${label}1.00 → 2.00`
		);
		expect(screen.queryByTestId('order-totals-changed-banner-line-amounts')).toBeNull();
	});

	it('counts the per-line amounts rather than listing payload paths at a cashier', () => {
		renderBanner();
		emit(
			divergence('order-a', [
				{ field: 'total', expected: '36.68', got: '50.07' },
				{ field: 'line_items[abc].total', expected: '29.97', got: '19.98' },
				{ field: 'tax_lines[1].tax_total', expected: '6.71', got: '11.10' },
			])
		);

		expect(screen.getByTestId('order-totals-changed-banner-line-amounts').textContent).toBe(
			'2 line amounts also differ'
		);
		expect(screen.getByTestId('order-totals-changed-banner').textContent).not.toContain(
			'line_items['
		);
	});

	it('still alerts when the total held but a component moved', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total_tax', expected: '6.71', got: '11.10' }]));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
		expect(screen.queryByTestId('order-totals-changed-banner-field-total')).toBeNull();
		expect(screen.getByTestId('order-totals-changed-banner-field-total_tax').textContent).toBe(
			'Tax6.71 → 11.10'
		);
	});

	/**
	 * The banner used to carry a dismiss button. ADR 0032 removed it: a divergence
	 * is a broken product invariant, and a dismissed notice is a broken invariant
	 * nobody reports.
	 */
	it('offers no way to dismiss it', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		expect(screen.queryByTestId('order-totals-changed-banner-dismiss')).toBeNull();
		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
	});

	it('does not block the sale — it renders inline, not as a modal or a gate', () => {
		// The banner is a sibling of the totals block; it never mounts a portal or
		// a dialog. Pinned structurally so a future redesign cannot quietly turn
		// this into something that stops a cashier mid-sale.
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	/**
	 * The "why totals disagree" link is shown on the FIRST divergence, not held
	 * back until store-level escalation. Encounter one is the most confusing
	 * moment for a cashier, and it used to be the one screen with nothing to
	 * click — the explanation only appeared once three sales had diverged.
	 */
	it('links to the docs on a single divergence, before any escalation', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));

		expect(screen.queryByTestId('order-totals-changed-banner-store-level')).toBeNull();
		expect(screen.getByTestId('order-totals-changed-banner-docs-link').getAttribute('href')).toBe(
			'https://docs.wcpos.com/support/troubleshooting/totals-disagree'
		);
	});
});

describe('store-level escalation (ADR 0032 §5.3)', () => {
	it('stays silent about the store while only one sale has diverged', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
		expect(screen.queryByTestId('order-totals-changed-banner-store-level')).toBeNull();
	});

	it('escalates once enough DISTINCT orders have diverged, and links to the docs', () => {
		currentOrderUuid = 'order-2';
		renderBanner();
		divergeOrders(3);

		const escalation = screen.getByTestId('order-totals-changed-banner-store-level');
		expect(escalation.textContent).toContain('This has happened on 3 sales');
		expect(screen.getByTestId('order-totals-changed-banner-docs-link').getAttribute('href')).toBe(
			'https://docs.wcpos.com/support/troubleshooting/totals-disagree'
		);
	});

	it('counts orders, not saves — re-saving one bad order is still one bad order', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }], 'm1'));
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '3.00' }], 'm2'));
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '4.00' }], 'm3'));

		expect(screen.queryByTestId('order-totals-changed-banner-store-level')).toBeNull();
	});

	it('resets the count on a store switch — one install cannot escalate the next', () => {
		currentOrderUuid = 'order-2';
		renderBanner();
		divergeOrders(3);
		expect(screen.getByTestId('order-totals-changed-banner-store-level')).toBeTruthy();

		switchScope('scope-2');
		emit(divergence('order-2', [{ field: 'total', expected: '1.00', got: '2.00' }], 'again'));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
		expect(screen.queryByTestId('order-totals-changed-banner-store-level')).toBeNull();
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

		expect(screen.getByTestId('order-totals-changed-banner-field-total').textContent).toBe(
			'Total10.00 → 12.00'
		);
	});

	it('holds each order’s alert independently', () => {
		function Probe() {
			const { divergence: held } = useOrderMoneyDivergence('order-b');
			return <span data-testid="probe">{held ? held.fields[0].got : 'none'}</span>;
		}
		render(
			<OrderMoneyDivergenceProvider>
				<CartTotalsChangedBanner />
				<Probe />
			</OrderMoneyDivergenceProvider>
		);
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }]));
		emit(divergence('order-b', [{ field: 'total', expected: '3.00', got: '4.00' }]));

		expect(screen.getByTestId('order-totals-changed-banner-field-total').textContent).toBe(
			'Total1.00 → 2.00'
		);
		expect(screen.getByTestId('probe').textContent).toBe('4.00');
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

		expect(screen.getByTestId('order-totals-changed-banner-field-total').textContent).toBe(
			'Total2.00 → 3.00'
		);
	});

	/**
	 * This inverts the pre-ADR-0032 rule, which retired the alert on a later clean
	 * ack. Under ADR 0032 a held divergence also tells `useCartSettlement` that
	 * this order's money belongs to the server, so the POS stops asserting its
	 * own — which makes every subsequent ack clean BY CONSTRUCTION. Retiring on
	 * one would hand the money straight back to the POS, it would re-assert, the
	 * server would overrule it again, and the order would oscillate. The alert is
	 * sticky precisely so that cannot happen.
	 */
	it('is NOT retired by a later clean ack — the order stays server-owned', () => {
		renderBanner();
		emit(divergence('order-a', [{ field: 'total', expected: '1.00', got: '2.00' }], 'm1'));
		emit(acknowledged('order-a', 'm2'));

		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
	});

	/**
	 * The detail map is capped for memory. Server OWNERSHIP is not, and deriving
	 * one from the other meant the 51st divergence handed an earlier order's money
	 * back to the POS — it would settle again, against arithmetic the server had
	 * already rejected. The order need not even be open at the time: completed
	 * orders are never evicted, so fifty later sales are enough.
	 */
	it('keeps an order server-owned after its detail is evicted by the cap', () => {
		function Probe() {
			const { divergence: held, serverOwnsMoney } = useOrderMoneyDivergence('order-early');
			return (
				<span data-testid="probe">{`${held ? 'detail' : 'no-detail'}/${
					serverOwnsMoney ? 'owned' : 'not-owned'
				}`}</span>
			);
		}
		render(
			<OrderMoneyDivergenceProvider>
				<Probe />
			</OrderMoneyDivergenceProvider>
		);
		emit(divergence('order-early', [{ field: 'total', expected: '1.00', got: '2.00' }], 'm-early'));
		expect(screen.getByTestId('probe').textContent).toBe('detail/owned');

		// Fifty later sales, one after another, each diverging.
		for (let i = 0; i < 50; i++) {
			emit(divergence(`later-${i}`, [{ field: 'total', expected: '1.00', got: '2.00' }], `m${i}`));
		}

		// Its detail is gone — that is the memory bound doing its job — but the POS
		// must NOT start deriving that order's money again.
		expect(screen.getByTestId('probe').textContent).toBe('no-detail/owned');
	});

	it('counts a re-diverged order once even after its detail was evicted', () => {
		function Probe() {
			const { divergedOrderCount } = useOrderMoneyDivergence('order-early');
			return <span data-testid="count">{String(divergedOrderCount)}</span>;
		}
		render(
			<OrderMoneyDivergenceProvider>
				<Probe />
			</OrderMoneyDivergenceProvider>
		);
		emit(divergence('order-early', [{ field: 'total', expected: '1.00', got: '2.00' }], 'm-early'));
		for (let i = 0; i < 50; i++) {
			emit(divergence(`later-${i}`, [{ field: 'total', expected: '1.00', got: '2.00' }], `m${i}`));
		}
		expect(screen.getByTestId('count').textContent).toBe('51');

		// Saving the evicted order again re-states its detail. It is the SAME order,
		// so the store-level count must not move.
		emit(divergence('order-early', [{ field: 'total', expected: '1.00', got: '3.00' }], 'm-again'));
		expect(screen.getByTestId('count').textContent).toBe('51');
	});

	it('is NOT retired by its own acknowledgement either', () => {
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
		expect(screen.getByTestId('checkout-totals-changed-banner-field-total').textContent).toBe(
			'Total36.68 → 50.07'
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
});

/**
 * The banner's second half (#1560). The two findings are independent — the store
 * can overrule the arithmetic on an order whose inputs read fine, and vice versa
 * — but they answer the same cashier question, "is the money on this sale
 * right?", so they share the slot rather than stacking two banners.
 */
describe('the engine-warning half', () => {
	let report: ReturnType<typeof useReportEngineWarnings> = () => undefined;

	const captureReport = (next: ReturnType<typeof useReportEngineWarnings>) => {
		report = next;
	};

	function Reporter() {
		const reportEngineWarnings = useReportEngineWarnings();
		// From an effect, not render: react-compiler bans writing to an outer
		// binding during render, test components included.
		React.useEffect(() => captureReport(reportEngineWarnings), [reportEngineWarnings]);
		return null;
	}

	function renderBoth() {
		return render(
			<OrderMoneyDivergenceProvider>
				<OrderEngineWarningsProvider>
					<Reporter />
					<CartTotalsChangedBanner />
				</OrderEngineWarningsProvider>
			</OrderMoneyDivergenceProvider>
		);
	}

	const raiseWarning = () =>
		act(() =>
			report([{ code: 'unknown_tax_rate_id', rateId: 42 }], {
				orderId: 'order-a',
				site: 'test',
			})
		);

	it('raises the banner on an order the server has said nothing about', () => {
		renderBoth();
		raiseWarning();

		expect(screen.getByTestId('order-totals-changed-banner-engine-warnings')).toBeTruthy();
		// The divergence half is absent — its title would tell the cashier the store
		// changed totals it never touched.
		expect(screen.queryByTestId('order-totals-changed-banner-docs-link')).toBeNull();
		expect(screen.getByTestId('order-totals-changed-banner').textContent).not.toContain(
			"Your store changed this order's totals"
		);
	});

	it('shows both findings in one banner when both are true', () => {
		renderBoth();
		emit(divergence('order-a', [{ field: 'total', expected: '36.68', got: '50.07' }]));
		raiseWarning();

		expect(screen.getByTestId('order-totals-changed-banner-field-total').textContent).toBe(
			'Total36.68 → 50.07'
		);
		expect(screen.getByTestId('order-totals-changed-banner-engine-warnings')).toBeTruthy();
		// The "why totals disagree" page explains the SERVER disagreement and says
		// nothing about an unreadable price basis, so it belongs to that half.
		expect(screen.getByTestId('order-totals-changed-banner-docs-link')).toBeTruthy();
	});
});
