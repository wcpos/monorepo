/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import type { EngineRecord, QueryHandle } from '@wcpos/query';

import {
	enterCheckout,
	enterReceipt,
	finishReceipt,
	resetCheckoutMode,
	setTenderPlan,
} from '../../checkout/checkout-mode';
import {
	type CurrentOrderActions,
	CurrentOrderProvider,
	type OpenOrderHit,
	useCurrentOrder,
	useCurrentOrderActions,
} from './index';

jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: jest.fn() }) }));
jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order', payload: {} } }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(record: T, select: (value: T) => unknown) =>
		record ? select(record) : undefined,
}));
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial: Record<string, unknown>) => QueryHandle;
};
const handleFor = (hits: OpenOrderHit[]) => fakeQueryHandle({ ready: true, result: { hits } });
let actions: CurrentOrderActions;
let renders: number;
function Probe() {
	const { currentOrderRecord } = useCurrentOrder();
	const currentActions = useCurrentOrderActions();
	React.useEffect(() => {
		actions = currentActions;
	}, [currentActions]);
	renders++;
	return <span data-testid="displayed">{currentOrderRecord.uuid}</span>;
}
function App({ handle }: { handle: QueryHandle }) {
	return (
		<CurrentOrderProvider
			handle={handle}
			scope="7:2:r1"
			defaultCustomerResource={{} as never}
			currentOrderUUID="order-a"
		>
			<Probe />
		</CurrentOrderProvider>
	);
}
function mountOrder(checkout = true) {
	const payload = { status: 'pos-open', meta_data: [] };
	const record = { uuid: 'order-a', payload } as unknown as EngineRecord<'orders'>;
	const hit = { id: 'order-a', record };
	if (checkout) enterCheckout('order-a');
	const view = render(<App handle={handleFor([hit])} />);
	return {
		payload,
		hit,
		...view,
		leave(status = 'completed') {
			payload.status = status;
			view.rerender(<App handle={handleFor([])} />);
		},
	};
}
function expectOrders(displayed: string, writable: string) {
	expect(screen.getByTestId('displayed').textContent).toBe(displayed);
	expect(actions.getCurrentOrderRecord().uuid).toBe(writable);
}
beforeEach(() => {
	resetCheckoutMode();
	renders = 0;
});
it('keeps the paid order current when it leaves the open orders', () => {
	const view = mountOrder();
	view.leave();
	expectOrders('order-a', 'new-order');
	expect(actions.getCurrentOrderID()).toBe('order-a');
	act(() => enterReceipt('order-a', { select: false }));
	expectOrders('order-a', 'new-order');
});
it('releases the hold when the id changes', () => {
	const view = mountOrder();
	view.leave();
	expectOrders('order-a', 'new-order');
	act(() => actions.setCurrentOrderID(''));
	expectOrders('new-order', 'new-order');
});
it('a reopen hands back the live hit', () => {
	const view = mountOrder();
	view.leave();
	expectOrders('order-a', 'new-order');
	view.payload.status = 'pos-open';
	view.rerender(<App handle={handleFor([view.hit])} />);
	expectOrders('order-a', 'order-a');
});
it('a cancelled leaver falls to the draft', () => {
	const view = mountOrder();
	view.leave('cancelled');
	expectOrders('new-order', 'new-order');
});
it('an order never in checkout that leaves falls to the draft', () => {
	const view = mountOrder(false);
	view.leave();
	expectOrders('new-order', 'new-order');
});
it('finishing the receipt ends the hold', () => {
	const view = mountOrder();
	view.leave();
	expectOrders('order-a', 'new-order');
	act(() => finishReceipt('order-a'));
	expectOrders('new-order', 'new-order');
});
it('does not re-render on a tender-plan change', () => {
	mountOrder();
	const before = renders;
	act(() => setTenderPlan('order-a', { kind: 'even', ways: 2, from: 0 }));
	expect(renders).toBe(before);
});

it('keeps the latest paid record when the subscribed status still reads open', () => {
	const view = mountOrder();
	view.hit.record.getLatest = () =>
		({ payload: { status: 'completed' } }) as EngineRecord<'orders'>;
	view.rerender(<App handle={handleFor([])} />);
	expectOrders('order-a', 'new-order');
});
