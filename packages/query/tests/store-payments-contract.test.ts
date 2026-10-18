import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { readResidentMoneyEpoch } from '../src/reads/order-money-epoch';
import {
	readStorePaymentsContract,
	useStorePaymentsContract,
} from '../src/store-payments-contract';

import type { RxState } from 'rxdb';

it.each([
	[{ schema: 1, contract: '1.3', methods: [] }, '1.3'],
	[undefined, null],
	[null, null],
	['1.3', null],
	[{ contract: '1.3' }, null],
	[{ schema: 1, contract: 'abc', methods: [] }, null],
] as const)('reads the contract from %j', (paymentMethods, expected) => {
	const state = new BehaviorSubject({ paymentMethods });
	const extraData = { get: (key?: string) => (key ? paymentMethods : state.value), $: state };
	expect(readStorePaymentsContract(extraData)).toBe(expected);
	const { result } = renderHook(() =>
		useStorePaymentsContract(extraData as unknown as RxState<Record<string, unknown>>)
	);
	expect(result.current).toBe(expected);
});

it('resident epoch reads see committed RxDB updates synchronously', async () => {
	const db = await createRxDatabase({
		name: 'moneyepochs',
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	try {
		// prettier-ignore
		await db.addCollections({ orders: { schema: { version: 0, primaryKey: 'uuid', type: 'object', properties: { uuid: { type: 'string', maxLength: 64 }, payload: { type: 'object', additionalProperties: true } }, required: ['uuid', 'payload'] } } });
		const engine = { active: () => ({ database: db }) } as unknown as RxdbSyncEngine;
		const doc = await db.collections.orders.insert({ uuid: 'order', payload: {} });
		expect(readResidentMoneyEpoch(engine, 'order')).toBe(0);
		await doc.incrementalPatch({
			payload: { meta_data: [{ key: '_wcpos_money_epoch', value: '2' }] },
		});
		expect(readResidentMoneyEpoch(engine, 'order')).toBe(2);
	} finally {
		await db.remove();
	}
});
