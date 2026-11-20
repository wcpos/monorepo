/** @jest-environment jsdom */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { act, cleanup, render, screen } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';

import { acquireOpenOrdersQueryHandle, queryHandleAnswers$, useRecordField } from '@wcpos/query';
import type { EngineRecord } from '@wcpos/query';
import { createEngineDatabase, createFakeEngine, engineOrder } from '@wcpos/query/testing';

import { resetCheckoutMode } from '../../checkout/checkout-mode';
import { useCartLines } from '../../hooks/use-cart-lines';
import { CurrentOrderProvider, useCurrentOrder } from './index';

import type { RxDatabase } from 'rxdb';

jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: jest.fn() }) }));
jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order', payload: {} } }),
}));
Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

let database: RxDatabase;
let doc: EngineRecord<'orders'>;
let release: () => void;
const renders = { context: 0, lines: 0 };
function ContextProbe() {
	const { currentOrderRecord } = useCurrentOrder();
	renders.context++;
	return <span data-testid="current">{currentOrderRecord.uuid}</span>;
}
function LinesProbe() {
	const { line_items } = useCartLines();
	renders.lines++;
	return <span data-testid="quantity">{line_items[0].quantity}</span>;
}
function LocalProbe() {
	const { currentOrderRecord } = useCurrentOrder();
	const pending = useRecordField(
		currentOrderRecord as EngineRecord<'orders'>,
		(o) => o.local?.pendingMutationIds?.length ?? 0
	);
	return <span data-testid="local">{pending}</span>;
}
beforeEach(async () => {
	resetCheckoutMode();
	renders.context = 0;
	renders.lines = 0;
	database = await createEngineDatabase(['orders']);
	doc = await database.orders.insert({
		...engineOrder({
			uuid: 'order-a',
			status: 'pos-open',
			line_items: [{ id: 1, product_id: 1, quantity: 1 }],
			meta_data: [
				{ key: '_pos_user', value: '7' },
				{ key: '_pos_store', value: '2' },
			],
		}),
		local: { dirty: true, pendingMutationIds: ['mark-before'] },
	});
	const handle = acquireOpenOrdersQueryHandle(createFakeEngine(database), 'dirty-mark', {
		cashierId: 7,
		storeId: 2,
	});
	release = handle.retain();
	await firstValueFrom(queryHandleAnswers$(handle));
	render(
		<CurrentOrderProvider
			handle={handle}
			scope="7:2"
			defaultCustomerResource={{} as never}
			currentOrderUUID="order-a"
		>
			<ContextProbe />
			<LinesProbe />
			<LocalProbe />
		</CurrentOrderProvider>
	);
	expect(screen.getByTestId('current').textContent).toBe('order-a');
	expect(screen.getByTestId('quantity').textContent).toBe('1');
	expect(screen.getByTestId('local').textContent).toBe('1');
});
afterEach(async () => {
	cleanup();
	release();
	await Promise.resolve();
	await database.close();
});
async function change(modifier: Parameters<EngineRecord<'orders'>['incrementalModify']>[0]) {
	await act(async () => {
		await doc.incrementalModify(modifier);
		await database.requestIdlePromise();
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}
it('a dirty mark does not re-render context consumers', async () => {
	const before = { ...renders };
	const mutation = { mutationId: 'mark-1' };
	const prior = { mutationId: 'superseded' };
	await change((data) => {
		const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
		const pending = (
			Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []
		).filter((id) => id !== prior?.mutationId);
		return {
			...data,
			local: { ...local, dirty: true, pendingMutationIds: [...pending, mutation.mutationId] },
		};
	});
	expect(renders).toEqual(before);
	expect(screen.getByTestId('local').textContent).toBe('2');
});
it('a bookkeeping-only ack does not re-render context consumers', async () => {
	const before = { ...renders };
	await change((data) => ({
		...data,
		local: { ...data.local, pendingMutationIds: [], dirty: false },
	}));
	expect(renders).toEqual(before);
	expect(screen.getByTestId('local').textContent).toBe('0');
});
it('a quantity change still re-renders and shows the new quantity', async () => {
	const before = renders.context;
	await change((data) => {
		data.payload.line_items![0].quantity = 2;
		return data;
	});
	expect(renders.context).toBeGreaterThan(before);
	expect(screen.getByTestId('quantity').textContent).toBe('2');
});
