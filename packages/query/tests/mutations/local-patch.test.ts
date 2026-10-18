/**
 * @jest-environment jsdom
 */
import { createHash } from 'node:crypto';
import { serialize as structuredSerialize } from 'node:v8';

import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { act, waitFor } from '@testing-library/react';

import { applyLocalPatch } from '../../src/mutations';

import type { LocalPatchProps, MutationDocument } from '../../src/mutations';
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

const manager = {
	engine: {
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
};
const localPatch = <D extends MutationDocument, T extends object>(input: LocalPatchProps<D, T>) =>
	applyLocalPatch(manager as never, input);

jest.mock('../../src/temporary-order', () => ({
	getTemporaryOrder: (uuid: string) => mockGetTemporaryOrder(uuid),
	patchTemporaryOrderPayload: (uuid: string, changes: Record<string, unknown>) =>
		mockPatchTemporaryOrderPayload(uuid, changes),
}));

jest.mock('../../src/mutations/date', () => ({
	convertLocalDateToUTCString: (date: Date) => mockConvertLocalDateToUTCString(date),
}));

beforeEach(() => {
	jest.clearAllMocks();
	scopeSelectorsByScopeId = new Map();
	activeScopeId = 'scope-1';
	activeReturnsNullOnce = false;
	mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
	mockStatus.mockReturnValue({ activeScopeId: 'scope-1' });
});
it('empty resolver preserves the stored revision and timestamp without enqueueing', async () => {
	const db = await createRxDatabase({
		name: 'emptyresolver',
		storage: getRxStorageMemory(),
		multiInstance: false,
		hashFunction: async (value) => createHash('sha256').update(String(value)).digest('hex'),
	});
	try {
		await db.addCollections({
			orders: {
				schema: {
					version: 0,
					primaryKey: 'uuid',
					type: 'object',
					properties: { uuid: { type: 'string', maxLength: 100 }, payload: { type: 'object' } },
					required: ['uuid'],
				},
			},
		});
		const resident = await db.orders.insert({
			uuid: 'order-uuid',
			payload: { date_modified_gmt: 'original' },
		});
		mockFindOneExec.mockResolvedValue(resident);
		const before = resident.toJSON(true);
		await act(async () => {
			const response = await localPatch({
				document: resident as never,
				changes: () => ({}),
			});
			expect(response?.changes).toEqual({});
		});
		await waitFor(() => expect(db.orders.incrementalWriteQueue.isRunning).toBe(false));
		expect((await db.orders.findOne('order-uuid').exec()).toJSON(true)).toEqual(before);
		expect(mockWrite).not.toHaveBeenCalled();
	} finally {
		await db.remove();
	}
});

it('empty temporary-order resolver skips the storage write too', async () => {
	const document = { uuid: 'temp', isNew: true, collection: { name: 'orders' } };
	const resident = { getLatest: () => resident, payload: {} };
	mockGetTemporaryOrder.mockResolvedValue(resident);
	await act(async () => {
		expect(await localPatch({ document: document as never, changes: () => ({}) })).toEqual({
			changes: {},
			document: resident,
		});
	});
	expect(mockPatchTemporaryOrderPayload).not.toHaveBeenCalled();
	expect(mockWrite).not.toHaveBeenCalled();
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
			uuid: 'product-uuid',
			remoteId: '42',
			remoteKey: '42',
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
		await act(() =>
			localPatch({
				document: document as never,
				data: { barcode: '  EDITED  ' } as never,
			})
		);

		expect(stored.payload).toMatchObject({ barcode: 'EDITED', ...carrier });
	}
);

it.each(['proxy', 'record'] as const)(
	'builds dotted-path changes from the resident payload for a %s-face document',
	async (face) => {
		const stored: Record<string, unknown> = {
			uuid: 'order-uuid',
			remoteId: '42',
			remoteKey: '42',
			payload: {
				id: 42,
				billing: { first_name: 'Resident', last_name: 'Customer', city: 'Old City' },
			},
			sync: { revision: 'rev-1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			...stored,
			incrementalModify: async (
				modifier: (old: Record<string, unknown>) => Record<string, unknown>
			) => {
				Object.assign(stored, modifier(stored));
				return stored;
			},
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		};
		mockFindOneExec.mockResolvedValue(resident);
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
			toMutableJSON: () =>
				face === 'proxy'
					? { billing: { first_name: 'Stale proxy' } }
					: { payload: { billing: { first_name: 'Stale record' } } },
		};
		await act(() =>
			localPatch({
				document: document as never,
				data: { 'billing.city': 'New City' } as never,
			})
		);

		expect(mockWrite).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					billing: {
						first_name: 'Resident',
						last_name: 'Customer',
						city: 'New City',
					},
				}),
			})
		);
	}
);

it('keeps the resident and barcode carrier on one scope through an A→B→A switch', async () => {
	setSelectors('scope-1', 'products', ['sku']);
	const stored: Record<string, unknown> = {
		uuid: 'product-uuid',
		remoteId: '42',
		remoteKey: '42',
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
	await act(() =>
		localPatch({
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
			uuid: 'product-uuid',
			remoteId: '42',
			remoteKey: '42',
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
		await act(() =>
			localPatch({
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

it('patches a brand-new temporary order through the temp-order repository payload merge', async () => {
	// Engine-shaped template (ADR 0028 stage I): the write goes through
	// patchTemporaryOrderPayload, never through the passed document face.
	const stored: Record<string, unknown> = {
		uuid: 'temporary-order-uuid',
		payload: { status: 'pos-open', customer_id: 0 },
	};
	mockPatchTemporaryOrderPayload.mockImplementation(
		async (_uuid: string, changes: Record<string, unknown>) => {
			stored.payload = { ...(stored.payload as Record<string, unknown>), ...changes };
			return stored;
		}
	);
	mockGetTemporaryOrder.mockResolvedValue({
		...stored,
		toMutableJSON: () => JSON.parse(JSON.stringify(stored)),
	});
	const document = {
		uuid: 'temporary-order-uuid',
		id: 0,
		isNew: true,
		collection: { name: 'orders' },
		getLatest: () => ({ uuid: 'temporary-order-uuid' }),
	};
	const patchResult = await act(() =>
		localPatch({
			document: document as never,
			data: { customer_id: 91 } as never,
		})
	);

	expect(mockPatchTemporaryOrderPayload).toHaveBeenCalledWith('temporary-order-uuid', {
		customer_id: 91,
		date_modified_gmt: '2026-03-02T00:00:00',
	});
	expect(stored.payload).toMatchObject({
		status: 'pos-open',
		customer_id: 91,
		date_modified_gmt: '2026-03-02T00:00:00',
	});
	expect(patchResult?.document).toBe(stored);
	expect(mockFindOneExec).not.toHaveBeenCalled();
	expect(mockWrite).not.toHaveBeenCalled();
	// A customer does not START a cart (owner ruling 2026-10-12, #2183): the creation time
	// is stamped by the first line (saveNewOrder), never by a patch on the template.
	expect(stored.payload).not.toHaveProperty('date_created_gmt');
});

it('ignores undefined values in patch data', async () => {
	const persistedDoc = {
		barcode_scanning_prefix: '',
		barcode_scanning_suffix: '',
	};

	const incrementalModify = jest.fn(async (modifier: (old: Record<string, unknown>) => unknown) => {
		modifier(persistedDoc);
		return persistedDoc;
	});

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

	const patchResult = await act(async () => {
		return localPatch({
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
		uuid: 'order-uuid',
		remoteId: '42',
		remoteKey: 'stale',
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
	const patchResult = await act(() =>
		localPatch({
			document: document as never,
			data: { status: 'processing' } as never,
		})
	);

	expect(stored).toMatchObject({
		remoteKey: '42',
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

it('stores a plain patch when the caller hands over an RxDB proxy', async () => {
	// RxDB serves object-valued document fields as Proxies, nested ones included.
	// A caller reading `customer.payload.billing` off a record and patching it
	// onto the order — which is exactly what the cart's add-customer flow does —
	// would otherwise kill the optimistic write at the storage boundary with
	// "#<Object> could not be cloned": on web that write is a `postMessage` into
	// the storage worker.
	const stored: Record<string, unknown> = {
		uuid: 'order-uuid',
		remoteId: '42',
		remoteKey: '42',
		payload: { id: 42 },
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
	await act(() =>
		localPatch({
			document: document as never,
			data: { billing: new Proxy({ email: 'ada@example.com' }, {}) } as never,
		})
	);

	// jsdom omits `structuredClone`; `v8.serialize` runs the same algorithm the
	// storage worker's `postMessage` does, and raises the same DataCloneError.
	expect(() => structuredSerialize(stored)).not.toThrow();
	expect(() => structuredSerialize(mockWrite.mock.calls[0][0])).not.toThrow();
	expect(stored.payload).toMatchObject({ billing: { email: 'ada@example.com' } });
});

it('enqueues born-local edits as updates for the write plane to fold into the pending create', async () => {
	const stored: Record<string, unknown> = {
		uuid: 'order-uuid',
		remoteId: null,
		remoteKey: '',
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
	await act(() =>
		localPatch({
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
		uuid: 'product-uuid',
		remoteId: '42',
		remoteKey: '42',
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
	await act(() =>
		localPatch({
			document: document as never,
			data: { barcode: 'EDITED' } as never,
		})
	);

	// Kept (not rolled back), and mapped by A's carrier — never B's.
	expect(mockWrite).toHaveBeenCalledTimes(1);
	expect(stored.payload).toMatchObject({ barcode: 'EDITED', sku: 'EDITED' });
	expect(stored.payload).not.toHaveProperty('global_unique_id');
});

it('compensates and retries the resident patch once when the active scope changes', async () => {
	// One source of truth for the switch: `engine.active()` and `status()` are
	// the same engine, so a test that moved only one of them would model a
	// state the engine cannot be in.
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
		.mockResolvedValueOnce({ mutationId: 'mutation-2', recordId: 'order-uuid' });
	const document = {
		uuid: 'order-uuid',
		id: 42,
		collection: { name: 'orders' },
		getLatest: () => document,
	};
	await act(() =>
		localPatch({
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

/**
 * #1507 / ADR 0032. WooCommerce owns the order aggregate: those fields are
 * `readonly` in the wc/v3 schema and dropped before anything is set, so a
 * settlement that writes only money has nothing to say to the server — but
 * the cart still has to display it, and an offline till still has to run on
 * it.
 */
it('register attribution starts with resident metadata and retains a simultaneous ledger edit', async () => {
	const { patchAndEnqueueEngineResident } = await import('../../src/mutations');
	activeScopeId = 'scope-1';
	mockStatus.mockReturnValue({ activeScopeId });
	mockWrite.mockResolvedValue({ mutationId: 'register-write' });
	const meta = [
		{ id: 1, key: 'custom', value: 'keep' },
		{ key: '_pos_user', value: 'original' },
		{ key: '_wcpos_payments', value: 'old' },
	];
	const stored = { payload: { meta_data: meta } };
	const resident = {
		toJSON: () => stored,
		incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
			Object.assign(stored, modify(stored)),
	};
	mockFindOneExec.mockResolvedValue(resident);
	const input = {
		manager: manager as never,
		collection: 'orders' as const,
		recordId: 'order',
		registerId: 'register',
		tillId: 'installation',
		changes: { meta_data: [{ key: '_wcpos_payments', value: 'new' }] },
	};
	await patchAndEnqueueEngineResident(input);
	expect(mockWrite).toHaveBeenLastCalledWith(
		expect.objectContaining({
			payload: {
				// Protected resident entries survive replacement; the caller's ledger edit
				// still lands, while unprotected resident entries are not carried through.
				meta_data: [
					{ key: '_wcpos_payments', value: 'new' },
					{ key: '_pos_user', value: 'original' },
					{ key: '_wcpos_register', value: 'register' },
					{ key: '_wcpos_till', value: 'installation' },
				],
			},
		})
	);
	await patchAndEnqueueEngineResident({
		...input,
		registerId: 'other',
		tillId: 'other-till',
		changes: { status: 'processing' },
	});
	expect(stored.payload.meta_data).toContainEqual({ key: '_wcpos_register', value: 'register' });
	expect(stored.payload.meta_data).toContainEqual({ key: '_wcpos_till', value: 'installation' });
});

describe('register metadata per attempt', () => {
	it.each([false, true])(
		'preserves duplicate entries with caller metadata=%s',
		async (supplied) => {
			const { patchAndEnqueueEngineResident } = await import('../../src/mutations');
			const meta = [
				{ id: 1, key: 'same', value: 'a' },
				{ id: 2, key: 'same', value: 'b' },
			];
			const incoming = [{ id: 3, key: 'caller', value: 'c' }];
			const stored = { payload: { meta_data: meta } };
			mockFindOneExec.mockResolvedValue({
				toJSON: () => stored,
				incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
					Object.assign(stored, modify(stored)),
			});
			activeScopeId = 'scope-1';
			mockStatus.mockReturnValue({ activeScopeId });
			mockWrite.mockResolvedValue({});
			await patchAndEnqueueEngineResident({
				manager: manager as never,
				collection: 'orders',
				recordId: 'o',
				registerId: 'r',
				changes: supplied ? { meta_data: incoming } : { status: 'pending' },
			});
			expect(stored.payload.meta_data).toEqual([
				...(supplied ? incoming : meta),
				{ key: '_wcpos_register', value: 'r' },
			]);
		}
	);

	it('recomputes the retry from original changes rather than the first stamped array', async () => {
		const { patchAndEnqueueEngineResident } = await import('../../src/mutations');
		const resident = (value: string) => {
			const stored = { payload: { meta_data: [{ key: 'scope', value }] } };
			return {
				toJSON: () => stored,
				incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
					Object.assign(stored, modify(stored)),
			};
		};
		activeScopeId = 'scope-1';
		mockFindOneExec
			.mockResolvedValueOnce(resident('first'))
			.mockResolvedValueOnce(resident('second'));
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		mockWrite
			.mockClear()
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-2';
			})
			.mockResolvedValueOnce({});
		const changes = Object.freeze({ status: 'pending' });
		await patchAndEnqueueEngineResident({
			manager: manager as never,
			collection: 'orders',
			recordId: 'o',
			registerId: 'r',
			changes,
		});
		const first = mockWrite.mock.calls[0][0].payload.meta_data;
		const second = mockWrite.mock.calls[1][0].payload.meta_data;
		expect(second).not.toBe(first);
		expect(second).toEqual([
			{ key: 'scope', value: 'second' },
			{ key: '_wcpos_register', value: 'r' },
		]);
		expect(changes).toEqual({ status: 'pending' });
	});
});

it.each([undefined, 17])(
	'carries only the resident register into replacement metadata (id=%s)',
	async (id) => {
		const { patchAndEnqueueEngineResident } = await import('../../src/mutations');
		const register = {
			...(id === undefined ? {} : { id }),
			key: '_wcpos_register',
			value: 'original',
		};
		const stored = { payload: { meta_data: [register, { key: 'resident-only', value: 'drop' }] } };
		mockFindOneExec.mockResolvedValue({
			toJSON: () => stored,
			incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
				Object.assign(stored, modify(stored)),
		});
		activeScopeId = 'scope-1';
		mockStatus.mockReturnValue({ activeScopeId });
		mockWrite.mockResolvedValue({});
		await patchAndEnqueueEngineResident({
			manager: manager as never,
			collection: 'orders',
			recordId: 'o',
			registerId: 'different',
			changes: { meta_data: [{ key: 'caller', value: 'keep' }] },
		});
		expect(stored.payload.meta_data).toEqual([register, { key: 'caller', value: 'keep' }]);
		expect(mockWrite).toHaveBeenLastCalledWith(
			expect.objectContaining({
				payload: { meta_data: [register, { key: 'caller', value: 'keep' }] },
			})
		);
	}
);
