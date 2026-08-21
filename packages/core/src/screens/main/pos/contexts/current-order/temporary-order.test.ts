import { firstValueFrom } from 'rxjs';

import {
	getTemporaryOrder,
	patchTemporaryOrderPayload,
	removeTemporaryOrder,
	temporaryDB$,
} from './temporary-order';

type StoredOrder = Record<string, unknown> & { uuid: string; payload: Record<string, unknown> };

const stored: StoredOrder[] = [];

function fakeDocument(data: StoredOrder) {
	const document = {
		...data,
		get uuid() {
			return data.uuid;
		},
		get payload() {
			return data.payload;
		},
		incrementalModify: async (modifier: (old: StoredOrder) => StoredOrder) => {
			const next = modifier({ uuid: data.uuid, payload: data.payload });
			data.payload = next.payload;
			return fakeDocument(data);
		},
		remove: async () => {
			const index = stored.indexOf(data);
			if (index >= 0) stored.splice(index, 1);
		},
		// satisfies rxdb isRxDocument's duck check used by the ensure-exists stream
		isInstanceOfRxDocument: true,
		collection: { name: 'orders' },
		getLatest: () => fakeDocument(data),
	};
	return document;
}

jest.mock('@wcpos/database', () => ({
	createTemporaryDB: async () => ({
		orders: {
			findOne: (uuid?: string) => ({
				$: {
					subscribe: () => ({ unsubscribe: () => {} }),
				},
				exec: async () => {
					const match = uuid ? stored.find((entry) => entry.uuid === uuid) : stored[0];
					return match ? fakeDocument(match) : null;
				},
			}),
			insert: async (data: { uuid?: string; payload: Record<string, unknown> }) => {
				const entry: StoredOrder = {
					uuid: data.uuid ?? 'generated-uuid',
					payload: data.payload,
				};
				stored.push(entry);
				return fakeDocument(entry);
			},
		},
	}),
}));

describe('temporary-order repository (engine-shaped template, ADR 0028 stage I)', () => {
	beforeEach(() => {
		stored.length = 0;
	});

	it('stores the template ENGINE-SHAPED: order fields live under payload', async () => {
		const db = await firstValueFrom(temporaryDB$);
		await db!.orders.insert({
			payload: { status: 'pos-open', created_via: 'woocommerce-pos', billing: {}, shipping: {} },
		} as never);

		expect(stored[0].payload).toMatchObject({ status: 'pos-open' });
		expect((stored[0] as Record<string, unknown>).status).toBeUndefined();
	});

	it('patchTemporaryOrderPayload merges top-level payload keys and preserves the rest', async () => {
		stored.push({ uuid: 'tmp-1', payload: { status: 'pos-open', billing: { city: 'A' } } });

		await patchTemporaryOrderPayload('tmp-1', { customer_id: 9, billing: { city: 'B' } });

		expect(stored[0].payload).toEqual({
			status: 'pos-open',
			customer_id: 9,
			billing: { city: 'B' },
		});
	});

	it('patchTemporaryOrderPayload resolves null for an unknown uuid instead of throwing', async () => {
		expect(await patchTemporaryOrderPayload('missing', { customer_id: 1 })).toBeNull();
	});

	it('removeTemporaryOrder removes by uuid; getTemporaryOrder resolves the raw doc', async () => {
		stored.push({ uuid: 'tmp-2', payload: { status: 'pos-open' } });

		expect((await getTemporaryOrder('tmp-2'))?.uuid).toBe('tmp-2');
		await removeTemporaryOrder('tmp-2');
		expect(stored).toHaveLength(0);
		expect(await getTemporaryOrder('tmp-2')).toBeNull();
	});
});
