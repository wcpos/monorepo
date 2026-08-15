/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useLocalMutation } from './use-local-mutation';

const mockUseT = jest.fn();
const mockConvertLocalDateToUTCString = jest.fn((_date: Date) => '2026-03-02T00:00:00');
const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
const mockStatus = jest.fn();
type ScopeSelectors = { products: readonly string[]; variations: readonly string[] };

const EMPTY_SCOPE_SELECTORS: ScopeSelectors = {
	products: [],
	variations: [],
};
let scopeSelectorsByScopeId = new Map<string, ScopeSelectors>();

function setSelectors(
	scopeId: string,
	collection: 'products' | 'variations',
	list: readonly string[]
): void {
	const current = scopeSelectorsByScopeId.get(scopeId) ?? EMPTY_SCOPE_SELECTORS;
	scopeSelectorsByScopeId.set(scopeId, { ...current, [collection]: list });
}

/** The id `engine.active()` reports. `status().activeScopeId` is mocked
 * separately so a test can drive the two apart the way the engine's fallback
 * paths can. */
let activeScopeId: string | null = 'scope-1';
/** Set to make `engine.active()` answer null once, forcing `?? await ready`. */
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

jest.mock('@wcpos/query', () => ({
	// The write-direction projections are the code under test here (parity with the
	// old hand-written promotion switch) — pull the real implementations, mock the rest.
	...(() => {
		const { COLLECTION_VOCABULARY, promotedColumnsFor, adapterDerivedFieldsFor } =
			jest.requireActual('@wcpos/query');
		return { COLLECTION_VOCABULARY, promotedColumnsFor, adapterDerivedFieldsFor };
	})(),
	useQueryRuntime: () => ({
		engine: {
			active: () => {
				if (activeReturnsNullOnce) {
					activeReturnsNullOnce = false;
					return null;
				}
				return engineScope(activeScopeId);
			},
			// The initial open's scope — what `?? await ready` resolves to.
			ready: Promise.resolve(engineScope('scope-1')),
			write: mockWrite,
			status: mockStatus,
		},
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => mockUseT(),
}));

jest.mock('../../../../hooks/use-local-date', () => ({
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

	it.each([
		['sku', { sku: 'EDITED' }],
		['global_unique_id', { global_unique_id: 'EDITED' }],
		['meta_data:_barcode', { meta_data: [{ key: '_barcode', value: 'EDITED' }] }],
	] as const)(
		'keeps a barcode edit and its %s carrier consistent locally',
		async (selector, carrier) => {
			setSelectors('scope-1', 'products', [selector]);
			const stored: Record<string, unknown> = {
				id: 'product-uuid',
				wooProductId: 42,
				payload: { id: 42 },
				sync: { revision: 'rev-1' },
				local: { dirty: false, pendingMutationIds: [] },
			};
			mockFindOneExec.mockResolvedValue({
				incrementalModify: async (
					modifier: (old: Record<string, unknown>) => Record<string, unknown>
				) => {
					Object.assign(stored, modifier(stored));
					return stored;
				},
				toJSON: () => JSON.parse(JSON.stringify(stored)),
			});
			const document = {
				uuid: 'product-uuid',
				id: 42,
				collection: { name: 'products' },
				getLatest: () => document,
			};

			const { result } = renderHook(() => useLocalMutation());
			await act(() =>
				result.current.localPatch({
					document: document as never,
					data: { barcode: '  EDITED  ' } as never,
				})
			);

			expect(stored.payload).toMatchObject({ barcode: 'EDITED', ...carrier });
		}
	);

	it('keeps the resident and barcode carrier on one scope through an A→B→A switch', async () => {
		setSelectors('scope-1', 'products', ['sku']);
		const stored: Record<string, unknown> = {
			id: 'product-uuid',
			wooProductId: 42,
			payload: { id: 42 },
			sync: { revision: 'rev-1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		mockFindOneExec.mockImplementationOnce(async () => {
			// The resident came from scope A, then scope B became active while the
			// lookup yielded. The status returns to A during the write below.
			setSelectors('scope-2', 'products', ['global_unique_id']);
			return {
				incrementalModify: async (
					modifier: (old: Record<string, unknown>) => Record<string, unknown>
				) => {
					Object.assign(stored, modifier(stored));
					return stored;
				},
				toJSON: () => JSON.parse(JSON.stringify(stored)),
			};
		});
		mockWrite.mockImplementationOnce(async () => {
			setSelectors('scope-1', 'products', ['sku']);
			return { mutationId: 'mutation-1', recordId: 'product-uuid' };
		});
		const document = {
			uuid: 'product-uuid',
			id: 42,
			collection: { name: 'products' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { barcode: 'EDITED' } as never,
			})
		);

		expect(stored.payload).toMatchObject({ barcode: 'EDITED', sku: 'EDITED' });
		expect(stored.payload).not.toHaveProperty('global_unique_id');
	});

	it.each([
		['sku', { sku: 'OLD' }, { sku: 'NEW' }, { sku: 'NEW' }],
		[
			'global_unique_id',
			{ global_unique_id: 'OLD' },
			{ global_unique_id: 'NEW' },
			{
				global_unique_id: 'NEW',
			},
		],
		[
			'meta_data:_barcode',
			{ meta_data: [{ key: '_barcode', value: 'OLD' }] },
			{ meta_data: [{ key: '_barcode', value: 'NEW' }] },
			{ meta_data: [{ key: '_barcode', value: 'NEW' }] },
		],
	] as const)(
		'a direct %s carrier edit wins over the echoed unchanged barcode',
		async (selector, priorCarrier, carrierEdit, expected) => {
			setSelectors('scope-1', 'products', [selector]);
			const stored: Record<string, unknown> = {
				id: 'product-uuid',
				wooProductId: 42,
				payload: { id: 42, ...priorCarrier, barcode: 'OLD' },
				sync: { revision: 'rev-1' },
				local: { dirty: false, pendingMutationIds: [] },
			};
			mockFindOneExec.mockResolvedValue({
				incrementalModify: async (
					modifier: (old: Record<string, unknown>) => Record<string, unknown>
				) => {
					Object.assign(stored, modifier(stored));
					return stored;
				},
				toJSON: () => JSON.parse(JSON.stringify(stored)),
			});
			const document = {
				uuid: 'product-uuid',
				id: 42,
				collection: { name: 'products' },
				getLatest: () => document,
			};

			const { result } = renderHook(() => useLocalMutation());
			await act(() =>
				result.current.localPatch({
					document: document as never,
					// The full edit form echoes the unchanged derived barcode alongside
					// the direct carrier change.
					data: { ...carrierEdit, barcode: 'OLD' } as never,
				})
			);

			// The carrier edit survives and the materialized field re-derives from it.
			expect(stored.payload).toMatchObject({ barcode: 'NEW', ...expected });
			// The echoed barcode never reaches the mutation queue, so the push
			// adapter cannot map the stale value back over the carrier.
			expect(mockWrite).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.not.objectContaining({ barcode: expect.anything() }),
				})
			);
		}
	);

	it('patches a brand-new temporary order locally without requiring an engine resident', async () => {
		const stored: Record<string, unknown> = {
			uuid: 'temporary-order-uuid',
			status: 'pos-open',
			customer_id: 0,
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		const latest = { incrementalModify };
		const document = {
			uuid: 'temporary-order-uuid',
			id: 0,
			isNew: true,
			collection: {
				name: 'orders',
				schema: {
					jsonSchema: { properties: { date_modified_gmt: { type: 'string' } } },
				},
			},
			getLatest: () => latest,
		};

		const { result } = renderHook(() => useLocalMutation());
		const patchResult = await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { customer_id: 91 } as never,
			})
		);

		expect(stored).toMatchObject({
			customer_id: 91,
			date_modified_gmt: '2026-03-02T00:00:00',
		});
		expect(patchResult?.document).toBe(stored);
		expect(mockFindOneExec).not.toHaveBeenCalled();
		expect(mockWrite).not.toHaveBeenCalled();
	});

	it('ignores undefined values in patch data', async () => {
		const persistedDoc = {
			barcode_scanning_prefix: '',
			barcode_scanning_suffix: '',
		};

		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => unknown) => {
				modifier(persistedDoc);
				return persistedDoc;
			}
		);

		const document = {
			id: 'store_1',
			collection: {
				name: 'stores',
				schema: {
					jsonSchema: {
						properties: {
							date_modified_gmt: { type: 'string' },
						},
					},
				},
			},
			getLatest: () => ({ incrementalModify }),
		};

		const { result } = renderHook(() => useLocalMutation());

		const patchResult = await act(async () => {
			return result.current.localPatch({
				document: document as never,
				data: {
					barcode_scanning_prefix: undefined,
				} as never,
			});
		});

		expect(persistedDoc.barcode_scanning_prefix).toBe('');
		expect(patchResult?.changes).not.toHaveProperty('barcode_scanning_prefix');
		expect(mockConvertLocalDateToUTCString).toHaveBeenCalledTimes(1);
	});

	it('optimistically patches a server-born resident and enqueues syncable fields', async () => {
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
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
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		const patchResult = await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		);

		expect(stored).toMatchObject({
			status: 'processing',
			payload: {
				status: 'processing',
				date_modified_gmt: '2026-03-02T00:00:00',
			},
		});
		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			payload: {
				status: 'processing',
				date_modified_gmt: '2026-03-02T00:00:00',
			},
		});
		expect(patchResult?.changes).toEqual({
			status: 'processing',
			date_modified_gmt: '2026-03-02T00:00:00',
		});
	});

	it('enqueues born-local edits as updates for the write plane to fold into the pending create', async () => {
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: null,
			status: 'pos-open',
			payload: { status: 'pos-open', line_items: [] },
			sync: { revision: '' },
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
		const document = {
			uuid: 'order-uuid',
			id: null,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { line_items: [{ product_id: 7 }] } as never,
			})
		);

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			payload: expect.objectContaining({
				line_items: [{ product_id: 7 }],
			}),
		});
	});

	it('restores the resident snapshot when the write intent cannot be enqueued', async () => {
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
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
	});

	it('keeps an A→B→A mutation: the resident, the carriers and the guard are all scope A', async () => {
		// The reviewed claim: a switch to B and back to A during the write leaves
		// the guard comparing A against A, so nothing rolls back while the write
		// "really" belonged to B. It does not: the scope is captured ONCE, up
		// front, and the resident, the carriers and the rollback baseline all come
		// from that one object — so the write that is kept is the A write it
		// always was, mapped by A's carriers.
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		setSelectors('scope-1', 'products', ['sku']);
		const stored: Record<string, unknown> = {
			id: 'product-uuid',
			wooProductId: 42,
			payload: { id: 42 },
			sync: { revision: 'rev-1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		mockFindOneExec.mockImplementation(async () => {
			// B becomes active while the resident lookup is in flight, and brings
			// its own (different) carriers with it.
			activeScopeId = 'scope-2';
			setSelectors('scope-2', 'products', ['global_unique_id']);
			expect(engineScope('scope-1').barcodeSelectors.products).toEqual(['sku']);
			expect(engineScope('scope-2').barcodeSelectors.products).toEqual(['global_unique_id']);
			return {
				incrementalModify: async (
					modifier: (old: Record<string, unknown>) => Record<string, unknown>
				) => {
					Object.assign(stored, modifier(stored));
					return stored;
				},
				toJSON: () => JSON.parse(JSON.stringify(stored)),
			};
		});
		mockWrite.mockImplementationOnce(async () => {
			// ...and back to A before the guard reads.
			activeScopeId = 'scope-1';
			setSelectors('scope-1', 'products', ['sku']);
			return { mutationId: 'mutation-1', recordId: 'product-uuid' };
		});
		const document = {
			uuid: 'product-uuid',
			id: 42,
			collection: { name: 'products' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { barcode: 'EDITED' } as never,
			})
		);

		// Kept (not rolled back), and mapped by A's carrier — never B's.
		expect(mockWrite).toHaveBeenCalledTimes(1);
		expect(stored.payload).toMatchObject({ barcode: 'EDITED', sku: 'EDITED' });
		expect(stored.payload).not.toHaveProperty('global_unique_id');
	});

	it('rolls back when the CAPTURED scope is not the one still active at the end', async () => {
		// `engine.active()` can answer null while `status()` still names a scope
		// (the engine's own fallback window), and `?? await ready` then hands back
		// the INITIAL scope. Baselining the guard on a second `status()` read
		// would compare scope-2 with scope-2 and keep a write whose resident and
		// carriers came from scope-1; baselining it on the captured scope catches
		// exactly that.
		activeScopeId = 'scope-2';
		activeReturnsNullOnce = true;
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		};
		const makeResident = () => ({
			incrementalModify: jest.fn(
				async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
					Object.assign(stored, modifier(stored));
					return stored;
				}
			),
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockFindOneExec.mockResolvedValue(makeResident());
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		// Attempt 1 rolls back and retries; attempt 2 captures scope-2 and agrees.
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		);

		expect(mockWrite).toHaveBeenCalledTimes(2);
		expect(stored).toMatchObject({ status: 'processing' });
	});

	it('compensates and retries the resident patch once when the active scope changes', async () => {
		// One source of truth for the switch: `engine.active()` and `status()` are
		// the same engine, so a test that moved only one of them would model a
		// state the engine cannot be in.
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const firstStored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
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
			.mockResolvedValueOnce({ mutationId: 'mutation-2', recordId: 'order-uuid' });
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

		expect(firstStored).toMatchObject({
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		});
		expect(secondStored).toMatchObject({
			status: 'processing',
			payload: { id: 42, status: 'processing' },
		});
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('compensates and throws when the active scope changes twice', async () => {
		let activeScopeId = 'scope-1';
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const firstStored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
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
		await expect(
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		).rejects.toThrow('Active engine scope changed twice during orders mutation');

		expect(firstStored).toMatchObject({ status: 'pending', payload: { status: 'pending' } });
		expect(secondStored).toMatchObject({ status: 'pending', payload: { status: 'pending' } });
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});
});
