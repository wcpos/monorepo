/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import { config } from '../../../../../jest/cart-write';
import { SettlementCoordinatorProvider } from './settlement-coordinator-provider';

const events = new Subject<{ type: string; collection?: string }>();
const coverage = new BehaviorSubject({ complete: true });
const statuses = new BehaviorSubject({ collections: { taxRates: { coverageGeneration: 0 } } });
const orders = new BehaviorSubject({ ready: true, hits: [] as { record: any }[] });
const handle = { observe: () => orders };
const subscribe = (source: Subject<any>) => (fn: any) => {
	const sub = source.subscribe(fn);
	return () => sub.unsubscribe();
};
const engine = {
	events: subscribe(events),
	status: () => statuses.value,
	statusChanges: subscribe(statuses),
};
const manager = { engine };
const writes: Record<string, unknown>[] = [];
const report = jest.fn();
const readConfig = () => config;
const ownsMoney = () => false;
const mockInputs = { settings: { priceNumDecimals: 2 }, rates: [], baseLocation: {} };
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => manager,
	observeCoverage: () => coverage,
	useDocField: (doc: any, read: any) => read(doc),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7 }, store: { id: 8 } }),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'register' }),
}));
jest.mock('../contexts/current-order/use-open-orders-handle', () => ({
	useOpenOrdersHandle: (...args: unknown[]) => {
		expect(args).toEqual([7, 8, 'register']);
		return handle;
	},
}));
jest.mock('../hooks/use-cart-config', () => ({
	useCartConfigInputs: () => mockInputs,
	useCartConfigReader: () => readConfig,
}));
jest.mock('../contexts/order-money-divergence', () => ({
	useServerOwnsMoneyReader: () => ownsMoney,
}));
jest.mock('../contexts/order-engine-warnings', () => ({ useReportEngineWarnings: () => report }));
jest.mock('./plain-patch', () => ({
	plainPatch: async (_manager: unknown, collection: string, input: any) => {
		expect(collection).toBe('orders');
		const changes = input.changes(input.document.payload);
		if (Object.keys(changes).length) writes.push(changes);
		return { changes, document: input.document };
	},
}));
const record = (payload = {}) => ({
	uuid: 'a',
	payload: {
		status: 'pos-open',
		total: '20',
		line_items: [{ total: '10', subtotal: '10' }],
		...payload,
	},
	getLatest() {
		return this;
	},
});
const flush = async () => {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
};
beforeEach(() => {
	writes.length = 0;
	jest.clearAllMocks();
	coverage.next({ complete: true });
	orders.next({ ready: true, hits: [{ record: record() }] });
});

it('binds, rebinds on scope/reset, waits for rates, reports once and tears down', async () => {
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toHaveLength(1);
	expect(writes[0].total).toBe('10');
	expect(report).toHaveBeenCalledTimes(1);
	act(() => {
		events.next({ type: 'scope-switched' });
		statuses.next({ collections: { taxRates: { coverageGeneration: 1 } } });
		orders.next({ ready: true, hits: [{ record: record() }] });
	});
	await flush();
	expect(writes).toHaveLength(2);
	act(() => {
		events.next({ type: 'collection-reset', collection: 'taxRates' });
		coverage.next({ complete: false });
		orders.next({ ready: true, hits: [{ record: record() }] });
	});
	await flush();
	expect(writes).toHaveLength(2);
	act(() => {
		statuses.next({ collections: { taxRates: { coverageGeneration: 2 } } });
		coverage.next({ complete: true });
	});
	await flush();
	expect(writes).toHaveLength(3);
	view.unmount();
	expect(events.observed).toBe(false);
	expect(coverage.observed).toBe(false);
	expect(statuses.observed).toBe(false);
	expect(orders.observed).toBe(false);
});

it.each(['0.30', '0.40'])(
	'defers a partial order crossing net paid %s, without writing money',
	async (amount) => {
		// prettier-ignore
		const meta_data = [{ key: '_wcpos_payments', value: { schema: 1, payments: [
			{ id: 'leg', status: 'captured', amount, refunded_amount: '0.10' },
		] } }];
		orders.next({
			ready: true,
			hits: [
				{ record: record({ status: 'pos-partial', meta_data, line_items: [{ total: '0.20' }] }) },
			],
		});
		const view = render(<SettlementCoordinatorProvider />);
		await flush();
		expect(writes).toEqual([]);
		expect(getLogger(['test']).warn).toHaveBeenCalledWith(
			'settlement.boundary-deferred',
			expect.anything()
		);
		view.unmount();
	}
);
