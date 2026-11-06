/**
 * @jest-environment jsdom
 */
/**
 * `unknown_tax_rate_id` is reported only once the tax rates have been read from a bound
 * database (#3186).
 *
 * On reload the POS mounts before the engine scope opens, and the tax-rates binding publishes
 * an empty, unbound placeholder in that window. When the saved order's read lands before the
 * rates read, the cart settles against that placeholder; every rate id on the order looks
 * unknown, and the sticky warning used to outlive the rates arriving one render later.
 *
 * Pinned here: a rate that is resident never warns, whatever the storage ordering; a rate the
 * store really dropped still warns once the rates are read, including when the store has no
 * rates at all.
 *
 * REAL: engine-schema RxDB (memory storage) holding the saved order AND its tax rates before
 * mount; `useOpenOrdersResource`; `TaxRatesProvider` (QueryStateProvider + useCollectionBinding +
 * observeEngineQuery); `useCartSettlement`; `useCartConfig`; `@wcpos/order-math`;
 * `OrderEngineWarningsProvider`.
 * FAKED: the engine handle (createFakeEngine) with `active()`/`db$`/`ready` gated to model the real
 * cold start, where `apps/main/app/(app)/_layout.tsx` mounts the POS before the scope opens; the
 * current-order context (the order the open-orders resource returns, else the temporary order);
 * local writes, coupon context, divergence, translations and store settings; storage latency.
 */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { act, cleanup, render } from '@testing-library/react';
import { useObservableSuspense } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { QueryProvider } from '@wcpos/query';
import { createEngineDatabase, createFakeEngine, engineOrder } from '@wcpos/query/testing';

import { useCartSettlement } from './use-cart-settlement';
import { createStoreDatabase } from '../../../../../../query/tests/helpers/db';
import { TaxRatesProvider, useTaxSettings } from '../../contexts/tax-rates';
import { useOpenOrdersResource } from '../contexts/current-order/use-open-orders-resource';
import {
	OrderEngineWarningsProvider,
	useOrderEngineWarnings,
} from '../contexts/order-engine-warnings';

import type { RxDatabase } from 'rxdb';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const mockStore = {
	calc_taxes$: new BehaviorSubject('yes'),
	prices_include_tax$: new BehaviorSubject('no'),
	tax_round_at_subtotal$: new BehaviorSubject('no'),
};

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: mockStore }),
	useAppState: () => ({ store: mockStore }),
}));
jest.mock('../../contexts/extra-data/use-extra-data', () => ({
	useExtraData: () => ({ extraData: undefined }),
}));
jest.mock('../../hooks/use-base-tax-location', () => ({
	useBaseTaxLocation: () => ({ country: 'GB', state: '', city: '', postcode: '' }),
}));
jest.mock('../contexts/current-order/context', () => ({
	...jest.requireActual('../contexts/current-order/context'),
	useCurrentOrderOptional: () => undefined,
}));
jest.mock('../contexts/current-order', () => {
	const ReactActual = jest.requireActual('react');
	const ctx = ReactActual.createContext(null);
	return { useCurrentOrder: () => ReactActual.useContext(ctx), __ctx: ctx };
});
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('./use-coupon-context', () => ({
	useCouponContext: () => ({ getCouponContext: async () => [] }),
}));
jest.mock('../contexts/order-money-divergence', () => ({
	useOrderMoneyDivergence: () => ({ serverOwnsMoney: false }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../query', () => ({
	...jest.requireActual('../../../../query'),
	useAppliedCouponReferenceDemand: () => ({
		whenSettled: async () => true,
		whenSettledInBackground: async () => true,
		generation: 0,
	}),
}));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: () => undefined,
}));

const mockLocalPatch = jest.fn(async () => undefined);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __ctx: OrderCtx } = require('../contexts/current-order') as {
	__ctx: React.Context<unknown>;
};

const ORDER_UUID = 'order-3186';

/** The saved order's money in the exact form settle writes it when rate 1 is not known. */
const SETTLED_WITHOUT_RATES = {
	discount_total: '0',
	discount_tax: '0',
	shipping_total: '0',
	shipping_tax: '0',
	cart_tax: '2',
	total_tax: '2',
	total: '12',
	tax_lines: [
		{
			rate_id: 1,
			label: '',
			compound: false,
			tax_total: '2',
			shipping_tax_total: '0',
			rate_percent: 0,
			meta_data: [],
		},
	],
};

const timeline: string[] = [];

function Cart({ orderId }: { orderId: string }) {
	useCartSettlement();
	const { allRates } = useTaxSettings();
	const warnings = useOrderEngineWarnings(orderId);
	timeline.push(
		`cart render: allRates=[${allRates.map((r) => r.id).join(',')}] banner=[${warnings.join(',')}]`
	);
	return null;
}

/**
 * Mirrors CurrentOrderProvider: the route's saved order if the open-orders resource holds it,
 * otherwise the temporary new order (`selectedOrder?.record ?? newOrder`). TaxRatesProvider and
 * the cart are mounted either way, as POSStack mounts them.
 */
function Till({
	resource,
	tempOrder,
}: {
	resource: ReturnType<typeof useOpenOrdersResource>;
	tempOrder: unknown;
}) {
	const openOrders = useObservableSuspense(resource);
	const hit = openOrders.find((order) => order.id === ORDER_UUID);
	timeline.push(`till: openOrders=${openOrders.length} current=${hit ? 'saved' : 'temporary'}`);
	return (
		<OrderCtx.Provider value={{ currentOrderRecord: hit?.record ?? tempOrder }}>
			<TaxRatesProvider>
				<Cart orderId={ORDER_UUID} />
			</TaxRatesProvider>
		</OrderCtx.Provider>
	);
}

function Layout({ tempOrder }: { tempOrder: unknown }) {
	const resource = useOpenOrdersResource(1, undefined);
	return (
		<React.Suspense fallback={null}>
			<Till resource={resource} tempOrder={tempOrder} />
		</React.Suspense>
	);
}

/** createFakeEngine with the real engine's cold start: no scope until `open()`, then db$ fires. */
function gatedEngine(database: RxDatabase, openAtMount: boolean) {
	const engine = createFakeEngine(database) as any;
	const scope = engine.active();
	let opened = openAtMount;
	let resolveReady!: () => void;
	const ready = new Promise<void>((resolve) => (resolveReady = resolve));
	if (openAtMount) resolveReady();
	const subscribers = new Set<(db: RxDatabase | null) => void>();
	engine.ready = ready;
	engine.active = () => (opened ? scope : null);
	engine.whenActive = async () => {
		await ready;
		return scope;
	};
	engine.db$ = (cb: (db: RxDatabase | null) => void) => {
		subscribers.add(cb);
		cb(opened ? database : null);
		return () => subscribers.delete(cb);
	};
	return {
		engine,
		open() {
			opened = true;
			for (const cb of [...subscribers]) cb(database);
			resolveReady();
		},
	};
}

/**
 * ONE FIFO for every storage call of every collection, each costing `ms` — the shape of
 * SQLite-wasm behind a single worker connection on the web: calls are answered one at a
 * time, in the order they were issued. Nothing here favours one collection over another.
 */
function addSerialStorageQueue(database: RxDatabase, ms: number) {
	let tail: Promise<unknown> = Promise.resolve();
	for (const collection of Object.values(database.collections)) {
		const instance = (collection as any).storageInstance;
		for (const method of ['query', 'count', 'findDocumentsById'] as const) {
			const original = instance[method].bind(instance);
			instance[method] = (...args: unknown[]) => {
				const run = tail.then(async () => {
					await new Promise((resolve) => setTimeout(resolve, ms));
					return original(...args);
				});
				tail = run.catch(() => undefined);
				return run;
			};
		}
	}
}

/**
 * The same latency on EVERY storage call of every collection — a stand-in for a storage whose
 * calls each cost a round trip, which memory storage does not model. Nothing here favours one
 * query over another.
 */
function addUniformStorageLatency(database: RxDatabase, ms: number) {
	for (const collection of Object.values(database.collections)) {
		const instance = (collection as any).storageInstance;
		for (const method of ['query', 'count', 'findDocumentsById'] as const) {
			const original = instance[method].bind(instance);
			instance[method] = async (...args: unknown[]) => {
				await new Promise((resolve) => setTimeout(resolve, ms));
				return original(...args);
			};
		}
	}
}

async function flush(rounds = 40) {
	for (let i = 0; i < rounds; i++) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
	}
}

describe('useCartSettlement reports unknown_tax_rate_id only once the rates are read (#3186)', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let warnSpy: jest.SpyInstance;
	const tempDBs: RxDatabase[] = [];

	/**
	 * The store's resident tax rates, and a saved open order with one line taxed at
	 * `lineRateId`. The default is the healthy case: rate 1 resident, the line on rate 1.
	 */
	async function seed({
		residentRateIds = [1],
		lineRateId = 1,
		money,
	}: {
		residentRateIds?: number[];
		lineRateId?: number;
		money?: Record<string, unknown>;
	} = {}) {
		for (const id of residentRateIds) {
			await engineDB.collections.taxRates.insert({
				uuid: `woo-tax-rate:${id}`,
				remoteId: String(id),
				payload: { id, name: 'VAT', class: '', rate: '20.0000', compound: false, shipping: true },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
			});
		}
		await engineDB.collections.orders.insert(
			engineOrder({
				uuid: ORDER_UUID,
				id: 3186,
				status: 'pos-open',
				meta_data: [{ key: '_pos_user', value: '1' }],
				line_items: [
					{
						id: 11,
						product_id: 5,
						name: 'Taxable',
						quantity: 1,
						subtotal: '10.00',
						subtotal_tax: '2.00',
						total: '10.00',
						total_tax: '2.00',
						tax_class: '',
						taxes: [{ id: lineRateId, subtotal: '2.00', total: '2.00' }],
					},
				],
				fee_lines: [],
				shipping_lines: [],
				coupon_lines: [],
				tax_lines: [
					{
						rate_id: lineRateId,
						label: 'VAT',
						compound: false,
						tax_total: '2.00',
						rate_percent: 20,
					},
				],
				total: '12.00',
				total_tax: '2.00',
				cart_tax: '2.00',
				discount_total: '0.00',
				discount_tax: '0.00',
				shipping_total: '0.00',
				shipping_tax: '0.00',
				...money,
			}) as never
		);
	}

	beforeEach(async () => {
		timeline.length = 0;
		mockLocalPatch.mockClear();
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase(['orders', 'taxRates']);
		warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(async () => {
		cleanup();
		warnSpy.mockRestore();
		for (const db of tempDBs.splice(0)) if (!db.destroyed) await db.remove();
		if (localDB && !localDB.destroyed) await localDB.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
	});

	async function mount(engine: unknown) {
		// The temporary order: an engine-shaped empty cart in its own database, as temporaryDB is.
		const tempDB = await createEngineDatabase(['orders']);
		tempDBs.push(tempDB);
		const tempOrder = await tempDB.collections.orders.insert(
			engineOrder({
				uuid: 'temporary-order',
				status: 'pos-open',
				line_items: [],
				fee_lines: [],
				shipping_lines: [],
				coupon_lines: [],
				tax_lines: [],
			}) as never
		);
		return render(
			<QueryProvider localDB={localDB} engine={engine as never} locale="en">
				<OrderEngineWarningsProvider>
					<Layout tempOrder={tempOrder} />
				</OrderEngineWarningsProvider>
			</QueryProvider>
		);
	}

	/** Mount before the scope opens, as a reload does, then open it and let every read land. */
	async function reload() {
		const gated = gatedEngine(engineDB, false);
		await mount(gated.engine);
		await flush(5);
		timeline.push('--- engine scope opens ---');
		await act(async () => gated.open());
		await flush();
	}

	it('control: scope already open at mount (no reload race) - no warning', async () => {
		await seed();
		const { engine } = gatedEngine(engineDB, true);
		await mount(engine);
		await flush();
		expect(timeline.at(-1)).toContain('banner=[]');
	});

	it('reload: scope opens after the POS mounted - false unknown_tax_rate_id', async () => {
		await seed();
		await reload();
		// The rate is resident the whole time, so the banner must stay empty.
		expect(timeline.at(-1)).toContain('allRates=[1]');
		expect(timeline.at(-1)).toContain('banner=[]');
	});

	it.each([
		['uniform', 1],
		['uniform', 5],
		['serial', 1],
		['serial', 5],
	] as const)(
		'reload with %s storage latency %ims - false unknown_tax_rate_id',
		async (shape, ms) => {
			await seed();
			if (shape === 'serial') addSerialStorageQueue(engineDB, ms);
			else addUniformStorageLatency(engineDB, ms);
			await reload();
			// The rate is resident the whole time, so the banner must stay empty.
			expect(timeline.at(-1)).toContain('allRates=[1]');
			expect(timeline.at(-1)).toContain('banner=[]');
		}
	);

	it('a saved order on a rate the store dropped still warns after a reload', async () => {
		// Rate 1 is gone; rate 2 is resident, so the rate set is not empty.
		await seed({ residentRateIds: [2], lineRateId: 1 });
		addSerialStorageQueue(engineDB, 5);
		await reload();
		expect(timeline.at(-1)).toContain('allRates=[2]');
		expect(timeline.at(-1)).toContain('banner=[unknown_tax_rate_id]');
	});

	it('a saved order still warns when the store has no rates at all', async () => {
		// Every rate deleted: an empty rate set that WAS read is evidence, unlike the unbound one.
		await seed({ residentRateIds: [], lineRateId: 1 });
		addSerialStorageQueue(engineDB, 5);
		await reload();
		expect(timeline.at(-1)).toContain('allRates=[]');
		expect(timeline.at(-1)).toContain('banner=[unknown_tax_rate_id]');
	});

	it('the pass the rates read triggers writes nothing when the money is already settled', async () => {
		// The money exactly as settle writes it when no rate is known, so every pass over
		// these lines finds nothing changed. The read of an empty rate set adds a pass (it
		// is what reports the warning below); that pass must not reach the document.
		await seed({ residentRateIds: [], lineRateId: 1, money: SETTLED_WITHOUT_RATES });
		addSerialStorageQueue(engineDB, 5);
		await reload();
		expect(timeline.at(-1)).toContain('banner=[unknown_tax_rate_id]');
		const savedOrderWrites = (
			mockLocalPatch.mock.calls as unknown as [{ document: { uuid?: string } }][]
		).filter(([args]) => args.document.uuid === ORDER_UUID);
		expect(savedOrderWrites).toHaveLength(0);
	});
});
