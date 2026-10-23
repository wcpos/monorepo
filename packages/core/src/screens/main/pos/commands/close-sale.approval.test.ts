/**
 * @jest-environment jsdom
 */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import {
	createEngineDatabase,
	createFakeEngine,
	engineOrder,
	readOrderCommands,
} from '@wcpos/query/testing';
import type { EngineRecord } from '@wcpos/query';
import type { StoreLocalDatabase } from '@wcpos/query/store-local';

import { closeSale } from './close-sale';

import type { RxDatabase } from 'rxdb';

/**
 * The close's approval through the REAL money command envelope (query's poster and journal over
 * an engine-shaped orders collection): a covered total that changed since the cashier's press is
 * refused as order_changed and never closed; the sale closes once it is approved as it stands.
 */
Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
// The hook's dependencies; closeSale itself takes everything it needs as arguments.
jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: () => ({}) }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({}) }));
jest.mock('../checkout/hooks/use-sale-context', () => ({ useSaleContext: () => ({}) }));
addRxPlugin(RxDBLocalDocumentsPlugin);

let database: RxDatabase;
let storeDB: StoreLocalDatabase;
let runtime: Parameters<typeof closeSale>[0];
/** The store's copy: revision r2 carries a total moved from 10.00 to 12.00 (still covered). */
const server = { revision: 'sha256:r2', document: { id: 42, total: '12.00', currency: 'EUR' } };
let completions: number;

const post = jest.fn(async (_url: string, body: unknown) => {
	const { revision } = body as { revision?: string };
	if (revision !== server.revision)
		throw Object.assign(new Error('wcpos_revision_stale'), {
			response: {
				status: 409,
				data: {
					code: 'wcpos_revision_stale',
					data: { current: server.document, currentRevision: server.revision },
				},
			},
		});
	completions += 1;
	return {
		data: {
			order: { status: 'completed', total: server.document.total, balance: '0.00' },
			completion: { n: 1, id: 'c1' },
			revision: 'sha256:r3',
		},
	};
});

beforeEach(async () => {
	completions = 0;
	post.mockClear();
	database = await createEngineDatabase(['orders']);
	storeDB = (await createRxDatabase({
		name: `close${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as StoreLocalDatabase;
	const engine = createFakeEngine(database);
	const adopt = async (payload: Record<string, unknown>, revision: unknown) => {
		const doc = await database.orders.findOne('order').exec();
		await doc!.incrementalModify((data: any) => ({
			...data,
			payload: { ...data.payload, ...payload },
			sync: { ...data.sync, revision, adopted: { revision, at: Date.now() } },
		}));
	};
	Object.assign(engine, {
		require: () => ({
			ready: adopt(server.document, server.revision).then(() => ({ action: 'fetched' })),
			release: () => undefined,
			queryKey: '',
		}),
		adoptOrderSnapshot: async ({ _rxdb_revision, ...current }: Record<string, unknown>) => {
			await adopt(current, _rxdb_revision);
			return 'applied';
		},
	});
	runtime = { engine } as unknown as Parameters<typeof closeSale>[0];
	// The till adopted r1, the 10.00 EUR sale the cashier saw.
	await database.orders.insert({
		...engineOrder({
			uuid: 'order',
			id: 42,
			status: 'pos-partial',
			total: '10.00',
			currency: 'EUR',
		}),
		sync: {
			revision: 'sha256:r1',
			partial: false,
			source: 'woo-rest',
			adopted: { revision: 'sha256:r1', at: Date.now() },
		},
	});
});
afterEach(async () => {
	await database.close();
	await (storeDB as unknown as RxDatabase).remove();
});

async function order(): Promise<EngineRecord<'orders'>> {
	const doc = await database.orders.findOne('order').exec();
	return { uuid: 'order', getLatest: () => doc!.getLatest().toJSON() } as never;
}

it('a zero-balance close is refused when the covered total changed, and closes once approved as it stands', async () => {
	const deps = { post, provenance: async () => null };

	expect(
		await closeSale(runtime, storeDB, await order(), {
			...deps,
			approval: { total: '10.00', currency: 'EUR' },
		})
	).toEqual({ kind: 'order_changed' });
	// Sent once under the till's revision, refused as stale; the adopted 12.00 is not what the
	// cashier approved, so nothing is re-sent, nothing closed, and nothing stays journaled.
	expect(post).toHaveBeenCalledTimes(1);
	expect(completions).toBe(0);
	expect((await readOrderCommands(storeDB, 'order')).entries).toEqual([]);

	expect(
		await closeSale(runtime, storeDB, await order(), {
			...deps,
			approval: { total: '12.00', currency: 'EUR' },
		})
	).toMatchObject({ kind: 'answered', order: { status: 'completed' } });
	expect(completions).toBe(1);
});
