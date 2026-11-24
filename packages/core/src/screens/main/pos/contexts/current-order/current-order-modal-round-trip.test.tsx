/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import type { QueryHandle } from '@wcpos/query';

import { useTillEntry, useTillLocation, useTillOrderId } from '../../use-till-location';
import {
	type CurrentOrderActions,
	CurrentOrderProvider,
	type OpenOrderHit,
	useCurrentOrder,
	useCurrentOrderActions,
} from './index';

jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(record: T, select: (value: T) => unknown) =>
		record ? select(record) : undefined,
}));

let mockSegments: string[] = [];
let mockParams: { orderId?: string | string[] } = {};
jest.mock('expo-router', () => ({
	useRouter: () => ({ setParams: jest.fn() }),
	useSegments: () => mockSegments,
	useGlobalSearchParams: () => mockParams,
}));

jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order', isNew: true } }),
}));

const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => QueryHandle;
};

function orderRecord(uuid: string) {
	return { uuid, payload: {} } as unknown as import('@wcpos/query').EngineRecord<'orders'>;
}

const hits: OpenOrderHit[] = [{ id: 'order-a', record: orderRecord('order-a') }];
const routes = {
	cart: ['(app)', '(drawer)', '(pos)', '(columns)', 'cart', '[...orderId]'],
	settings: ['(app)', '(drawer)', 'settings'],
	settingsModal: ['(app)', '(modals)', 'settings'],
};

let actions: CurrentOrderActions | undefined;

function Probe() {
	const currentOrderActions = useCurrentOrderActions();
	const { currentOrderRecord } = useCurrentOrder();
	React.useEffect(() => {
		actions = currentOrderActions;
	}, [currentOrderActions]);
	return <span data-testid="rendered-uuid">{currentOrderRecord.uuid}</span>;
}

function renderedUUID(): string | null {
	return document.querySelector('[data-testid="rendered-uuid"]')?.textContent ?? null;
}

/** The provider wired to the router as `(pos)/_layout.tsx` wires it. */
function Till({ handle }: { handle: QueryHandle }) {
	const location = useTillLocation();
	const tillEntry = useTillEntry(location);
	const tillOrderId = useTillOrderId(location);
	return (
		<React.Suspense fallback={null}>
			<CurrentOrderProvider
				handle={handle}
				scope="7:2:r1"
				defaultCustomerResource={{} as never}
				currentOrderUUID={tillOrderId}
				tillEntry={tillEntry}
			>
				<Probe />
			</CurrentOrderProvider>
		</React.Suspense>
	);
}

/** Mounts the till on /cart/order-a and parks it behind a new cart, as the "+" tab does. */
function parkedTill() {
	const handle = fakeQueryHandle({ ready: true, result: { hits } });
	mockSegments = routes.cart;
	mockParams = { orderId: ['order-a'] };
	const view = render(<Till handle={handle} />);
	expect(renderedUUID()).toBe('order-a');
	act(() => {
		actions!.setCurrentOrderID('');
	});
	expect(renderedUUID()).toBe('new-order');
	return (segments: string[], orderId?: string[]) => {
		mockSegments = segments;
		mockParams = orderId === undefined ? {} : { orderId };
		view.rerender(<Till handle={handle} />);
	};
}

beforeEach(() => {
	actions = undefined;
});

describe('CurrentOrderProvider over a modal round trip (#3773)', () => {
	it('keeps the new cart, and A parked, after a modal over the till closes', () => {
		const go = parkedTill();
		go(routes.settingsModal);
		go(routes.cart, ['order-a']);
		expect(renderedUUID()).toBe('new-order');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('new-order');

		// The route re-delivering A is still an echo of the parked order.
		go(['(app)', '(drawer)', '(pos)', '(columns)']);
		go(routes.cart, ['order-a']);
		expect(renderedUUID()).toBe('new-order');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('new-order');
	});

	it('adopts A when the cashier leaves for a page and returns on /cart/A', () => {
		const go = parkedTill();
		go(routes.settings);
		go(routes.cart, ['order-a']);
		expect(renderedUUID()).toBe('order-a');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('order-a');
	});
});
