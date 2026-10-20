/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';

import { getLogger, isErrorReported, log } from '@wcpos/utils/logger';

import { useLocalMutation } from './use-local-mutation';
import { useCartWrite } from '../../pos/commands/use-cart-write';
import { config } from '../../../../../jest/cart-write';

let cartConfig = config;
let moneyOwned = false;
let divergenceListener: (event: { type: string; recordId?: string }) => void;
jest.mock('../../pos/hooks/use-cart-config', () => ({
	useCartConfigReader: () => () => cartConfig,
}));
jest.mock('../../pos/contexts/order-money-divergence', () => ({
	...jest.requireActual('../../pos/contexts/order-money-divergence'),
	useServerOwnsMoneyReader: () => () => moneyOwned,
}));

const mockUseT = jest.fn();
const mockConvertLocalDateToUTCString = jest.fn((_date: Date) => '2026-03-02T00:00:00');
const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
const mockGetTemporaryOrder = jest.fn();
const mockPatchTemporaryOrderPayload = jest.fn();
const mockStatus = jest.fn();
type ScopeSelectors = { products: readonly string[]; variations: readonly string[] };

const EMPTY_SCOPE_SELECTORS: ScopeSelectors = {
	products: [],
	variations: [],
};
let scopeSelectorsByScopeId = new Map<string, ScopeSelectors>();

/** The id `engine.active()` reports. `status().activeScopeId` is mocked
 * separately so a test can drive the two apart the way the engine's fallback
 * paths can. */
let activeScopeId: string | null = 'scope-1';
/** Set to make `engine.active()` answer null once — the window where the scope
 * id is set but its database/identity entry is not yet resolvable. */
let activeReturnsNullOnce = false;

const scopeDatabase = {
	collections: {
		orders: { findOne: () => ({ exec: mockFindOneExec }) },
		products: { findOne: () => ({ exec: mockFindOneExec }) },
	},
};

const engineScope = (scopeId: string | null) => ({
	scopeId,
	barcodeSelectors:
		scopeId === null
			? EMPTY_SCOPE_SELECTORS
			: (scopeSelectorsByScopeId.get(scopeId) ?? EMPTY_SCOPE_SELECTORS),
	database: scopeDatabase,
});

/** The single source both `active()` and `whenActive()` read, as in the real
 * engine — a mock that let them disagree would model a state it cannot be in. */
const readActive = () => {
	if (activeReturnsNullOnce) {
		activeReturnsNullOnce = false;
		return null;
	}
	return engineScope(activeScopeId);
};

jest.mock('../../contexts/extra-data/use-extra-data', () => ({
	useExtraData: () => ({ extraData: undefined }),
}));

jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: jest.requireActual('@wcpos/query').OPEN_ORDER_STATUSES,
	readResidentMoneyEpoch: () => 0,
	readStorePaymentsContract: jest.requireActual('@wcpos/query').readStorePaymentsContract,
	// The write-direction projections are the code under test here (parity with the
	// old hand-written promotion switch) — pull the real implementations, mock the rest.
	...(() => {
		const { COLLECTION_VOCABULARY, promotedColumnsFor, adapterDerivedFieldsFor } =
			jest.requireActual('@wcpos/query');
		return { COLLECTION_VOCABULARY, promotedColumnsFor, adapterDerivedFieldsFor };
	})(),
	engineCollection: (database: { collections?: Record<string, unknown> } | null, name: string) =>
		database?.collections?.[name] ?? null,
	useQueryRuntime: () => ({
		engine: {
			events: (callback: typeof divergenceListener) => {
				divergenceListener = callback;
				return () => {};
			},
			active: readActive,
			ready: Promise.resolve(),
			/**
			 * Mirrors the real engine (#1559): boot has long settled here, so with
			 * nothing active there is no scope to hand back and it REJECTS. It must
			 * never fall back to the initial open's scope — that fallback is the bug
			 * this seam exists to make unexpressible.
			 */
			whenActive: async () => {
				const scope = readActive();
				if (scope === null) throw new Error('No active store scope');
				return scope;
			},
			write: mockWrite,
			status: mockStatus,
		},
	}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({}),
	useAppState: () => ({ site: { uuid: 'site' } }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => mockUseT(),
}));

jest.mock('@wcpos/query/temporary-order', () => ({
	getTemporaryOrder: (uuid: string) => mockGetTemporaryOrder(uuid),
	patchTemporaryOrderPayload: (uuid: string, changes: Record<string, unknown>) =>
		mockPatchTemporaryOrderPayload(uuid, changes),
}));

jest.mock('../../../../../../query/src/mutations/date', () => ({
	convertLocalDateToUTCString: (date: Date) => mockConvertLocalDateToUTCString(date),
}));

describe('useLocalMutation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		scopeSelectorsByScopeId = new Map();
		activeScopeId = 'scope-1';
		activeReturnsNullOnce = false;
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
		mockStatus.mockReturnValue({ activeScopeId: 'scope-1' });
		mockUseT.mockReturnValue((_key: string, options?: Record<string, unknown>) =>
			String(options?.message || '')
		);
	});

	it('restores the resident snapshot when the write intent cannot be enqueued', async () => {
		const stored: Record<string, unknown> = {
			uuid: 'order-uuid',
			remoteId: '42',
			remoteKey: '42',
			status: 'pending',
			payload: { id: 42, status: 'pending' },
			sync: { revision: 'rev-1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		mockFindOneExec.mockResolvedValue({
			incrementalModify,
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockWrite.mockRejectedValue(new Error('queue unavailable'));
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		);

		expect(stored).toMatchObject({
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		});
		// SYNC101's own summary and hint are the toast; "There was an error: queue
		// unavailable" said neither what happened nor what to do.
		expect(getLogger([]).error).toHaveBeenCalledWith('Local mutation failed', {
			code: 'SYNC101',
			showToast: true,
			context: expect.objectContaining({ error: 'queue unavailable' }),
		});
	});

	/**
	 * The bug this replaces (#1559): `engine.active()` can answer null while
	 * `status()` still names a scope, and the old `active() ?? (await ready)`
	 * handed back the scope the engine BOOTED on — so the resident, the barcode
	 * carriers and the write all came from scope-1 while the cashier stood in
	 * scope-2. The guard caught it after the fact; `whenActive()` refuses up
	 * front, before anything has been applied. No write, no resident change, and
	 * the cashier is told.
	 */
	it('REFUSES the patch when no scope is active — never falls back to the boot scope', async () => {
		activeScopeId = 'scope-2';
		activeReturnsNullOnce = true;
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const stored: Record<string, unknown> = {
			uuid: 'order-uuid',
			remoteId: '42',
			remoteKey: '42',
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		};
		mockFindOneExec.mockResolvedValue({
			incrementalModify: jest.fn(),
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		);

		expect(mockWrite).not.toHaveBeenCalled();
		expect(stored).toMatchObject({ status: 'pending' });
	});

	describe('a settlement that writes only the order aggregate', () => {
		const AGGREGATE = {
			discount_total: '5.00',
			discount_tax: '0.00',
			shipping_total: '0.00',
			shipping_tax: '0.00',
			cart_tax: '6.71328',
			total_tax: '6.71',
			total: '36.68',
			tax_lines: [{ rate_id: 1, tax_total: '6.71328' }],
		};

		function residentOrder() {
			const stored: Record<string, unknown> = {
				uuid: 'order-uuid',
				remoteId: '42',
				remoteKey: '42',
				status: 'pos-open',
				payload: { id: 42, status: 'pos-open', total: '0.00' },
				sync: { revision: 'rev-1' },
				local: { dirty: false, pendingMutationIds: [] },
			};
			mockFindOneExec.mockResolvedValue({
				incrementalModify: jest.fn(
					async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
						Object.assign(stored, modifier(stored));
						return stored;
					}
				),
				toJSON: () => JSON.parse(JSON.stringify(stored)),
			});
			const document = {
				uuid: 'order-uuid',
				id: 42,
				collection: { name: 'orders' },
				getLatest: () => document,
			};
			return { stored, document };
		}

		it('lands on the local record — the cart and the offline till read it there', async () => {
			const { stored, document } = residentOrder();

			const { result } = renderHook(() => useLocalMutation());
			const patchResult = await act(() =>
				result.current.localPatch({ document: document as never, data: AGGREGATE as never })
			);

			expect(stored.payload).toMatchObject({
				...AGGREGATE,
				date_modified_gmt: '2026-03-02T00:00:00',
			});
			// The promoted columns the orders grid sorts and renders on follow it.
			expect(stored).toMatchObject({ total: '36.68' });
			expect(patchResult?.changes).toMatchObject(AGGREGATE);
		});

		it('is not enqueued — the server discards the aggregate unread', async () => {
			const { document } = residentOrder();

			const { result } = renderHook(() => useLocalMutation());
			await act(() =>
				result.current.localPatch({ document: document as never, data: AGGREGATE as never })
			);

			expect(mockWrite).not.toHaveBeenCalled();
		});

		it('still enqueues once the same patch carries real intent', async () => {
			const { document } = residentOrder();

			const { result } = renderHook(() => useLocalMutation());
			await act(() =>
				result.current.localPatch({
					document: document as never,
					// The settlement's own percent-fee output: `fee_lines[].total` is
					// writable and the server keeps it.
					data: { ...AGGREGATE, fee_lines: [{ id: 5, total: '3.00' }] } as never,
				})
			);

			// The aggregate rides along in the intent; the outbound seam
			// (sanitizeOutboundOrderPayload) is what takes it off the wire.
			expect(mockWrite).toHaveBeenCalledWith(
				expect.objectContaining({
					collection: 'orders',
					operation: 'update',
					recordId: 'order-uuid',
					payload: expect.objectContaining({ fee_lines: [{ id: 5, total: '3.00' }] }),
				})
			);
		});
	});

	it('compensates and throws when the active scope changes twice', async () => {
		let activeScopeId = 'scope-1';
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const firstStored: Record<string, unknown> = {
			uuid: 'order-uuid',
			remoteId: '42',
			remoteKey: '42',
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		};
		const secondStored = JSON.parse(JSON.stringify(firstStored)) as Record<string, unknown>;
		const resident = (stored: Record<string, unknown>) => ({
			incrementalModify: jest.fn(
				async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
					Object.assign(stored, modifier(stored));
					return stored;
				}
			),
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockFindOneExec
			.mockResolvedValueOnce(resident(firstStored))
			.mockResolvedValueOnce(resident(secondStored));
		mockWrite
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-2';
				return { mutationId: 'mutation-1', recordId: 'order-uuid' };
			})
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-3';
				return { mutationId: 'mutation-2', recordId: 'order-uuid' };
			});
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		const rethrown = await result.current
			.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
			.then(
				() => undefined,
				(error: unknown) => error
			);
		expect(rethrown).toEqual(
			expect.objectContaining({
				message: 'Active engine scope changed twice during orders mutation',
			})
		);
		// Logged and toasted here, so a caller catching the rethrow must not report it again.
		expect(getLogger([]).error).toHaveBeenCalledTimes(1);
		expect(isErrorReported(rethrown)).toBe(true);

		expect(firstStored).toMatchObject({ status: 'pending', payload: { status: 'pending' } });
		expect(secondStored).toMatchObject({ status: 'pending', payload: { status: 'pending' } });
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});
});

jest.mock('../../../../services/register/use-register', () => ({ useRegister: () => null }));

describe('cart changes at the resident modifier', () => {
	it.each(['meta', 'memory', 'config', 'retry', 'money-only', 'lines-and-money'])(
		'resolves %s against the row and config at write time',
		async (scenario) => {
			cartConfig = config;
			moneyOwned = false;
			mockWrite.mockClear();
			mockStatus.mockReturnValue({ activeScopeId: 'scope-1' });
			activeScopeId = 'scope-1';
			const stored = {
				uuid: 'order-uuid',
				payload: {
					status: 'pos-open',
					line_items: [{ subtotal: '10', total: '10' }],
					total: '99',
					meta_data: [],
				} as Record<string, unknown>,
			};
			let execute!: () => void;
			const resident = {
				getLatest: () => resident,
				toJSON: () => JSON.parse(JSON.stringify(stored)),
				incrementalModify: (modify: (old: typeof stored) => typeof stored) =>
					new Promise((resolve) => {
						execute = () => {
							if (scenario === 'retry') {
								modify(stored);
								stored.payload.line_items = [{ subtotal: '20', total: '20' }];
							}
							Object.assign(stored, modify(stored));
							resolve(resident);
						};
					}),
			};
			mockFindOneExec.mockResolvedValue(resident);
			const document = { ...stored, collection: { name: 'orders' }, getLatest: () => document };
			const { result, rerender } = renderHook(() => ({
				...useLocalMutation(),
				cart: useCartWrite(),
			}));
			let pending: Promise<unknown>;
			await act(async () => {
				pending =
					scenario === 'money-only' || scenario === 'lines-and-money'
						? result.current.localPatch({
								document: document as never,
								changes: () => ({
									total: '10',
									...(scenario === 'lines-and-money' ? { line_items: [] } : {}),
								}),
							} as never)
						: result.current.cart.localPatch({
								queue: {
									dispatchToken: {},
								} as import('../../pos/hooks/order-mutation-queue').OrderMutationContext,
								document: document as never,
								data: { billing: { country: 'NZ' } },
							});
			});
			if (scenario === 'meta')
				stored.payload.meta_data = [{ key: '_wcpos_money_owner', value: 'server' }];
			if (scenario === 'memory') moneyOwned = true;
			if (scenario === 'config') {
				cartConfig = { ...config, dp: 3 };
				stored.payload.line_items = [{ subtotal: '10.123', total: '10.123' }];
				rerender();
			}
			await act(async () => {
				execute?.();
				await pending;
			});
			expect(stored.payload.total).toBe(
				['meta', 'memory'].includes(scenario)
					? '99'
					: scenario === 'config'
						? '10.123'
						: scenario === 'retry'
							? '20'
							: '10'
			);
			if (['meta', 'memory'].includes(scenario))
				expect(stored.payload.billing).toEqual({ country: 'NZ' });
			expect(mockWrite).toHaveBeenCalledTimes(scenario === 'money-only' ? 0 : 1);
		}
	);
});

// Exercise the app-session bridge (no POS provider) through the real plainPatch and outbound write contract.
describe('durable divergence ownership', () => {
	const { MoneyOwnerHintBridge } = jest.requireActual<
		typeof import('../../components/money-owner-hint-bridge')
	>('../../components/money-owner-hint-bridge');
	const query = jest.requireMock('@wcpos/query');
	const originalRuntime = query.useQueryRuntime;
	beforeEach(() => {
		activeScopeId = 'scope-1';
		mockStatus.mockReturnValue({ activeScopeId });
		const manager = originalRuntime();
		query.useQueryRuntime = () => manager;
	});
	afterEach(() => {
		query.useQueryRuntime = originalRuntime;
	});
	const hint = { key: '_wcpos_money_owner_hint', value: 'server' };
	const other = { id: 7, key: 'unrelated', value: 'keep' };
	it.each([null, 'foreign'])('replaces a non-server hint (%s) in place', async (value) => {
		mockWrite.mockClear().mockResolvedValue({});
		const stored = {
			uuid: 'hint-order',
			payload: { meta_data: [{ id: 8, ...hint, value }, other], total: '99' },
		};
		const resident = {
			...stored,
			getLatest: () => resident,
			toJSON: () => JSON.parse(JSON.stringify(stored)),
			incrementalModify: async (modify: (old: typeof stored) => typeof stored) => {
				Object.assign(stored, modify(stored));
				return resident;
			},
		};
		mockFindOneExec.mockResolvedValue(resident);
		renderHook(() => MoneyOwnerHintBridge());
		await act(async () => {
			divergenceListener({ type: 'order-money-divergence', recordId: 'hint-order' });
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(stored.payload.meta_data).toEqual([{ id: 8, ...hint }, other]);
		expect(mockWrite).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: {
					meta_data: [{ id: 8, ...hint }, other],
					date_modified_gmt: '2026-03-02T00:00:00',
				},
			})
		);
	});
	it.each(['new', 'existing', 'missing', 'failure', 'switched'])(
		'enqueues a money-free hint once: %s resident',
		async (scenario) => {
			jest.mocked(log.warn).mockClear();
			mockWrite.mockClear();
			mockWrite.mockResolvedValue({});
			if (scenario === 'failure')
				mockWrite.mockRejectedValueOnce(new Error('offline write failed'));
			const stored = {
				uuid: 'hint-order',
				payload: { total: '99', meta_data: scenario === 'existing' ? [other, hint] : [other] },
			};
			const resident = {
				...stored,
				getLatest: () => resident,
				toJSON: () => JSON.parse(JSON.stringify(stored)),
				incrementalModify: async (modify: (old: typeof stored) => typeof stored) => {
					Object.assign(stored, modify(stored));
					return resident;
				},
			};
			mockFindOneExec.mockResolvedValue(scenario === 'missing' ? null : resident);
			renderHook(() => MoneyOwnerHintBridge());
			await act(async () => {
				divergenceListener({ type: 'order-money-divergence', recordId: 'hint-order' });
				if (scenario !== 'failure')
					divergenceListener({ type: 'order-money-divergence', recordId: 'hint-order' });
				if (scenario === 'switched') divergenceListener({ type: 'scope-switched' });
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
			expect(log.warn).toHaveBeenCalledTimes(scenario === 'failure' ? 1 : 0);
			expect(mockWrite).toHaveBeenCalledTimes(scenario === 'new' || scenario === 'failure' ? 1 : 0);
			if (scenario === 'new' || scenario === 'failure') {
				expect(mockWrite).toHaveBeenLastCalledWith({
					collection: 'orders',
					operation: 'update',
					recordId: 'hint-order',
					payload: { meta_data: [other, hint], date_modified_gmt: '2026-03-02T00:00:00' },
				});
				expect(stored.payload.total).toBe('99');
			}
		}
	);
});

describe('protected order meta at the mutation boundary', () => {
	it.each([{ meta_data: [] }, { meta_data: [{ key: '_wcpos_money_owner_hint', value: null }] }])(
		'localPatch restores omitted or tombstoned protected meta: %j',
		async ({ meta_data }) => {
			activeScopeId = 'scope-1';
			mockStatus.mockReturnValue({ activeScopeId });
			mockWrite.mockResolvedValue({});
			const hint = { id: 8, key: '_wcpos_money_owner_hint', value: 'server' };
			const stored = { payload: { meta_data: [hint] } };
			const resident = {
				toJSON: () => stored,
				incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
					Object.assign(stored, modify(stored)),
			};
			mockFindOneExec.mockResolvedValue(resident);
			const { result } = renderHook(() => useLocalMutation());
			await result.current.localPatch({
				document: { uuid: 'order', collection: { name: 'orders' } } as never,
				data: { meta_data },
			});
			expect(stored.payload.meta_data).toEqual([hint]);
			expect(mockWrite).toHaveBeenLastCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({ meta_data: [hint] }),
				})
			);
		}
	);
});

it('keeps the provider latch immediate without invoking the mutation path', async () => {
	const { OrderMoneyDivergenceProvider, useServerOwnsMoneyReader } = jest.requireActual<
		typeof import('../../pos/contexts/order-money-divergence')
	>('../../pos/contexts/order-money-divergence');
	mockFindOneExec.mockClear();
	const { result } = renderHook(() => useServerOwnsMoneyReader(), {
		wrapper: OrderMoneyDivergenceProvider,
	});
	await act(async () => {
		divergenceListener({ type: 'order-money-divergence', recordId: 'hint-order' });
		expect(result.current('hint-order')).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	expect(mockFindOneExec).not.toHaveBeenCalled();
});

jest.mock('../../pos/commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));

it.each(['ordinary', 'superseded', 'scope'] as const)(
	'preserves the %s adapter failure policy',
	async (kind) => {
		const { ActiveScopeChangedTwiceError } = await import('@wcpos/query/mutations');
		const error =
			kind === 'scope'
				? new ActiveScopeChangedTwiceError('orders')
				: Object.assign(
						new Error('write failed'),
						kind === 'superseded' ? { code: 'write-superseded-by-delete' } : {}
					);
		activeScopeId = 'scope-1';
		activeReturnsNullOnce = false;
		mockStatus.mockReturnValue({ activeScopeId });
		mockFindOneExec.mockResolvedValue({
			toJSON: () => ({ payload: {} }),
			incrementalModify: async () => {
				throw error;
			},
		});
		jest.mocked(log.error).mockClear();
		const { result } = renderHook(() => useLocalMutation());
		const pending = result.current.localPatch({
			document: { uuid: 'order-uuid', collection: { name: 'orders' } } as never,
			data: { status: 'processing' },
		});
		if (kind === 'ordinary') await expect(pending).resolves.toBeUndefined();
		else await expect(pending).rejects.toBe(error);
		if (kind === 'superseded') expect(log.error).not.toHaveBeenCalled();
		else
			expect(log.error).toHaveBeenCalledWith(
				'Local mutation failed',
				expect.objectContaining({
					code: 'SYNC101',
					showToast: true,
					context: expect.objectContaining({ collectionName: 'orders', documentId: 'order-uuid' }),
				})
			);
	}
);
