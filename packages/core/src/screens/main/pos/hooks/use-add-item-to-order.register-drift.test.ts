/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { NO_STORE } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { expectSettledWrites } from '../../../../../jest/cart-write';
import { resetOrderMutationQueues } from './order-mutation-queue';
import { resetActionHookStrikes } from '../../../../extensions/actions';
import { useAddItemToOrder } from './use-add-item-to-order';

const mockLocalPatch = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockBirthOrder = jest.fn();
const mockFindBirthState = jest.fn();
const mockReadCatalog = jest.fn();
let mockStockGuardEnabled = false;
let mockTaxRates: { id: number; rate: string; compound: boolean; order: number; class: string }[] =
	[];

/**
 * Every line the POS creates carries `_woocommerce_pos_data` — `convertProductToLineItem`
 * writes it — and that is where the AUTHORITATIVE per-unit price lives. Without it the
 * engine falls back to deriving price from the line's own totals, which is wrong the
 * moment a merge has already bumped the quantity (5/2 rather than 5). The retired hook
 * behaved identically; the stub that used to mock it read a top-level `price` field
 * instead, so these fixtures were passing against maths the app never ran.
 */
const posPrice = (price: number) => ({
	key: '_woocommerce_pos_data',
	value: { price, regular_price: price, tax_status: 'taxable' },
});

function completeEngineRecord(record: Record<string, any> | null) {
	if (!record) return null;
	if (record.payload) record.payload.status ??= 'pos-open';
	if (!record.getLatest) record.getLatest = () => record;
	return record;
}

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => 'billing',
}));

let mockStoreId = 11;
jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		wpCredentials: { id: 7 },
		site: { uuid: 'site' },
		store: { id: mockStoreId, tax_based_on$: {} },
	});
	return { useAppState, useStoreSession: useAppState };
});

const mockActionLog = jest.fn();
jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: mockReadCatalog, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: mockStockGuardEnabled, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

// Only the store settings are stubbed; the merge recalculation runs the real engine.
// The fixtures below therefore carry real `total`/`subtotal` values: per-unit price is
// DERIVED from the line's totals (or from its pos_data), never read off a top-level
// `price` field — the stub this replaced read `lineItem.price`, which the shipped code
// has never done.
jest.mock('./use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	const config = createCartConfig({
		rates: [],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
		calcDiscountsSequentially: false,
	});
	return {
		useCartConfig: () => createCartConfig({ ...config, rates: mockTaxRates }),
		useCartConfigReader: () => (payload: { meta_data?: { key?: string; value?: unknown }[] }) =>
			createCartConfig({
				...config,
				rates: mockTaxRates,
				vatExempt: jest
					.requireActual('@wcpos/sync-core')
					.wooMetaCarrier.vatExempt(payload.meta_data),
			}),
	};
});

const order: Record<string, unknown> & {
	getLatest(): typeof order;
	payload: { uuid: string; id: number; line_items: Record<string, unknown>[] };
} = {
	uuid: 'order-uuid',
	payload: { uuid: 'order-uuid', id: 42, line_items: [] },
	getLatest: () => order,
	toJSON: () => ({ payload: { uuid: 'order-uuid', id: 42, line_items: [] } }),
	toMutableJSON: () => ({ payload: { uuid: 'order-uuid', id: 42, line_items: [] } }),
	remove: async () => undefined,
};

jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: jest.requireActual('@wcpos/query').OPEN_ORDER_STATUSES,
	inOpenOrdersScope: jest.requireActual('../../../../../../query/src/open-orders-scope')
		.inOpenOrdersScope,
	isRecordClosed: jest.requireActual('../../../../../../query/src/records/engine-record')
		.isRecordClosed,
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useQueryRuntime: () => ({}),
}));

jest.mock('@wcpos/query/register-session', () => ({
	boundRegisterIdOf: jest.requireActual(
		'../../../../../../query/src/register-session/register-document'
	).boundRegisterIdOf,
	getCurrentBoundRegisterId: () => 'register',
}));

// The cart scope's register: by default the binding directory's value for this store.
const mockScopedRegisterId = jest.fn();
jest.mock('../../../../services/register/use-register-binding', () => ({
	scopedRegisterId: (...args: unknown[]) => mockScopedRegisterId(...args),
}));

jest.mock('uuid', () => ({ v4: () => 'line-item-uuid' }));

jest.mock('@wcpos/query/mutations', () => ({
	documentRecordId: (document: { uuid?: string }) => document.uuid ?? null,
	birthOrder: async (_manager: unknown, input: unknown) =>
		completeEngineRecord(await mockBirthOrder(input)),
	findBirthState: async (...args: unknown[]) => {
		const state = await mockFindBirthState(...args);
		if (state === 'none') return state;
		return state.born
			? { born: completeEngineRecord(state.born) }
			: { orphan: completeEngineRecord(state.orphan) };
	},
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-07-14T00:00:00',
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({
		localPatch: jest
			.requireActual('../../../../../jest/cart-write')
			.resolveCartWrite(mockLocalPatch),
	}),
}));

jest.mock('../contexts/current-order', () => ({
	// The hook resolves the order at event time now, rather than subscribing during render.
	useCurrentOrderActions: () => ({
		getCurrentOrderRecord: () => order,
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
	useCurrentOrder: () => ({
		currentOrder: { getLatest: () => order },
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
}));

// Register-drift repro (#3358). The till's local `register` doc is built by the REAL register-document writers in a memory
// rxdb, and `useRegister()` hands the hook exactly what `observeRegister$` would emit.
let mockRegisterDoc: unknown = null;
jest.mock('../../../../services/register/use-register', () => ({
	useRegister: () => mockRegisterDoc,
}));

jest.mock('../commands/use-boundary-commit', () => ({ useBoundaryCommit: () => jest.fn() }));

afterEach(() => expectSettledWrites(mockLocalPatch));

// Real modules, by path, so the '@wcpos/query/register-session' mock above does not hide them.
const registerDocument = jest.requireActual(
	'../../../../../../query/src/register-session/register-document'
);
const { openOrdersSelector } = jest.requireActual('../../../../../../query/src/open-orders-scope');
const { engineSyncCollectionCreators } = jest.requireActual('@wcpos/sync-engine/testing');
const { identityColumns, wooMetaCarrier } = jest.requireActual('@wcpos/sync-core');
const rxdb = jest.requireActual('rxdb');
const { RxDBLocalDocumentsPlugin } = jest.requireActual('rxdb/plugins/local-documents');
const { getRxStorageMemory } = jest.requireActual('rxdb/plugins/storage-memory');

rxdb.addRxPlugin(RxDBLocalDocumentsPlugin);
const ORDERS_SCHEMA = rxdb.fillWithDefaultSettings(engineSyncCollectionCreators().orders.schema);

const REGISTER_A = '0a0a0a0a-0000-4000-8000-00000000000a'; // store 11's register
const REGISTER_B = '0b0b0b0b-0000-4000-8000-00000000000b'; // store 12's register

/** The born order as the open-orders query sees it in storage: promoted columns + payload. */
function asEngineDocument(payload: { meta_data?: unknown[]; status?: string }) {
	const meta = payload.meta_data as Parameters<typeof wooMetaCarrier.readIdentity>[0];
	return {
		uuid: 'order-uuid',
		...identityColumns(wooMetaCarrier.readIdentity(meta)),
		status: payload.status ?? 'pos-open',
		dateCreatedGmt: '2026-07-14T00:00:00',
		payload,
	};
}

function selectorMatches(selector: unknown, document: unknown): boolean {
	const matches = rxdb.getQueryMatcher(
		ORDERS_SCHEMA,
		rxdb.normalizeMangoQuery(ORDERS_SCHEMA, { selector })
	);
	return matches(document);
}

function registerOf(meta: { key?: string; value?: unknown }[]) {
	return meta.find((entry) => entry.key === '_wcpos_register')?.value;
}

describe('register drift: pointer != binding for the current store (#3358 shape)', () => {
	let db: any;

	beforeEach(async () => {
		resetOrderMutationQueues();
		resetActionHookStrikes();
		jest.clearAllMocks();
		mockFindBirthState.mockResolvedValue('none');
		order.payload.line_items = [];
		delete (order.payload as { meta_data?: unknown }).meta_data;
		Object.assign(order.payload, { status: 'pos-open' });
		order.isNew = true;
		order.toJSON = () => ({ payload: { ...order.payload } });
		order.toMutableJSON = () => ({ payload: { ...order.payload } });
		mockBirthOrder.mockImplementation(
			async ({ payload }: { payload: Record<string, unknown> }) => ({
				toMutableJSON: () => ({ payload }),
			})
		);

		db = await rxdb.createRxDatabase({
			name: 'drift' + Math.random().toString(36).slice(2),
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		});
		await registerDocument.remintRegister(db);
		// Store 11 (the session's store) auto-binds its sole register A ...
		await registerDocument.bindRegister(db, 'site', { id: REGISTER_A, name: 'A' }, 11);
		// ... the cashier visits store 12, which auto-binds B and moves the site pointer ...
		await registerDocument.bindRegister(db, 'site', { id: REGISTER_B, name: 'B' }, 12);
		// ... and comes back to 11: syncBinding finds A in the list and returns early, no write.
		mockRegisterDoc = await registerDocument.readRegister(db);
		mockStoreId = 11;
		mockScopedRegisterId.mockImplementation((siteUuid: string, storeId: number | undefined) =>
			registerDocument.boundRegisterIdOf(mockRegisterDoc, siteUuid, storeId)
		);
	});

	afterEach(async () => {
		await db.remove();
	});

	it('stamps the born order with the register the open-orders scope reads', async () => {
		const boundRegisterId = registerDocument.boundRegisterIdOf(mockRegisterDoc, 'site', 11);
		// Preconditions: the layout scopes the tabs to A; the legacy pointer says B.
		expect(boundRegisterId).toBe(REGISTER_A);
		expect((mockRegisterDoc as any).sites.site.register_id).toBe(REGISTER_B);

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', { product_id: 1, meta_data: [] } as never);
		});

		const born = mockBirthOrder.mock.calls[0][0].payload;
		expect(registerOf(born.meta_data)).toBe(boundRegisterId);
		expect(
			selectorMatches(openOrdersSelector(7, 11, boundRegisterId), asEngineDocument(born))
		).toBe(true);
	});

	it('workaround: re-binding the same register (the picker path) realigns the pointer', async () => {
		// register-picker.tsx -> useRegisterBinding().bind(id) -> bindRegister(userDB, site, row, storeId)
		await registerDocument.bindRegister(db, 'site', { id: REGISTER_A, name: 'A' }, 11);
		mockRegisterDoc = await registerDocument.readRegister(db);
		const boundRegisterId = registerDocument.boundRegisterIdOf(mockRegisterDoc, 'site', 11);

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', { product_id: 1, meta_data: [] } as never);
		});

		const born = mockBirthOrder.mock.calls[0][0].payload;
		expect(registerOf(born.meta_data)).toBe(REGISTER_A);
		expect(
			selectorMatches(openOrdersSelector(7, 11, boundRegisterId), asEngineDocument(born))
		).toBe(true);
	});

	it('refuses a birth the cart scope cannot show: nothing written, logged, null to the caller', async () => {
		// The scope reads B while the stamp yields the binding, A.
		mockScopedRegisterId.mockReturnValue(REGISTER_B);

		const { result } = renderHook(() => useAddItemToOrder());
		let added: unknown;
		await act(async () => {
			added = await result.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
		});

		expect(added).toBeNull();
		expect(mockBirthOrder).not.toHaveBeenCalled();
		expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
		expect(getLogger(['wcpos', 'pos', 'cart']).error).toHaveBeenCalledTimes(1);
		expect(getLogger(['wcpos', 'pos', 'cart']).error).toHaveBeenCalledWith(
			"Cart add refused: the order would fall outside this till's open orders",
			{
				code: 'CHECKOUT111',
				context: {
					orderId: 'order-uuid',
					stampedCashierId: '7',
					stampedStoreId: '11',
					stampedRegisterId: REGISTER_A,
					scopeCashierId: 7,
					scopeStoreId: 11,
					scopeRegisterId: REGISTER_B,
				},
			}
		);
	});

	it('restarts an emptied cart with the bound register, inside the cart scope', async () => {
		order.isNew = false;
		Object.assign(order.payload, {
			status: 'pos-open',
			date_created_gmt: '2026-07-01T00:00:00',
			line_items: [{ id: 7, product_id: null, quantity: 1 }],
			meta_data: [
				{ key: '_pos_user', value: '7' },
				{ key: '_pos_store', value: '11' },
				{ key: '_wcpos_register', value: REGISTER_B },
			],
		});
		mockLocalPatch.mockResolvedValue({ document: order });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				total: '5',
				subtotal: '5',
				meta_data: [posPrice(5)],
			} as never);
		});

		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		const written = mockLocalPatch.mock.calls[0][0].data;
		expect(registerOf(written.meta_data)).toBe(REGISTER_A);
		expect(
			selectorMatches(
				openOrdersSelector(7, 11, REGISTER_A),
				asEngineDocument({ ...order.payload, ...written })
			)
		).toBe(true);
		expect(getLogger(['wcpos', 'pos', 'cart']).error).not.toHaveBeenCalled();
	});

	it('refuses a restart the cart scope cannot show: nothing written, logged, null', async () => {
		// The restart stamps the binding, A, while the scope reads B.
		mockScopedRegisterId.mockReturnValue(REGISTER_B);
		order.isNew = false;
		Object.assign(order.payload, {
			status: 'pos-open',
			date_created_gmt: '2026-07-01T00:00:00',
			line_items: [{ id: 7, product_id: null, quantity: 1 }],
			meta_data: [
				{ key: '_pos_user', value: '7' },
				{ key: '_pos_store', value: '11' },
				{ key: '_wcpos_register', value: REGISTER_B },
			],
		});
		mockLocalPatch.mockResolvedValue({ document: order });

		const { result } = renderHook(() => useAddItemToOrder());
		let added: unknown;
		await act(async () => {
			added = await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				total: '5',
				subtotal: '5',
				meta_data: [posPrice(5)],
			} as never);
		});

		expect(added).toBeNull();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockBirthOrder).not.toHaveBeenCalled();
		expect(getLogger(['wcpos', 'pos', 'cart']).error).toHaveBeenCalledTimes(1);
		expect(getLogger(['wcpos', 'pos', 'cart']).error).toHaveBeenCalledWith(
			"Cart add refused: the order would fall outside this till's open orders",
			expect.objectContaining({
				code: 'CHECKOUT111',
				context: expect.objectContaining({
					stampedRegisterId: REGISTER_A,
					scopeRegisterId: REGISTER_B,
				}),
			})
		);
	});

	describe('no false refusal', () => {
		async function add() {
			const { result } = renderHook(() => useAddItemToOrder());
			let added: unknown;
			await act(async () => {
				added = await result.current.addItemToOrder('line_items', {
					product_id: 1,
					meta_data: [],
				} as never);
			});
			expect(added).toBeTruthy();
			expect(mockBirthOrder).toHaveBeenCalledTimes(1);
			expect(getLogger(['wcpos', 'pos', 'cart']).error).not.toHaveBeenCalled();
			return mockBirthOrder.mock.calls[0][0].payload;
		}

		it('writes when the scope has no register', async () => {
			mockScopedRegisterId.mockReturnValue(null);
			const born = await add();
			expect(selectorMatches(openOrdersSelector(7, 11, null), asEngineDocument(born))).toBe(true);
		});

		it('writes when the cashier, store and register all equal the scope', async () => {
			mockScopedRegisterId.mockReturnValue(REGISTER_A);
			const born = await add();
			expect(registerOf(born.meta_data)).toBe(REGISTER_A);
			expect(selectorMatches(openOrdersSelector(7, 11, REGISTER_A), asEngineDocument(born))).toBe(
				true
			);
		});

		it('writes for a NO_STORE till, whose order carries no store entry', async () => {
			await registerDocument.bindRegister(db, 'site', { id: REGISTER_A, name: 'A' }, NO_STORE);
			mockRegisterDoc = await registerDocument.readRegister(db);
			mockStoreId = NO_STORE;
			const born = await add();
			expect(born.meta_data.some((entry: { key?: string }) => entry.key === '_pos_store')).toBe(
				false
			);
			expect(registerOf(born.meta_data)).toBe(REGISTER_A);
			expect(
				selectorMatches(openOrdersSelector(7, NO_STORE, REGISTER_A), asEngineDocument(born))
			).toBe(true);
		});
	});
});
