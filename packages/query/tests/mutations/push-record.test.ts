/**
 * @jest-environment jsdom
 */
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { WriteDeferredError, WriteOutcomeError } from '../../src/await-write-outcome';
import { pushFailureCode } from '../../../core/src/screens/main/contexts/push-failure-code';
import { pushRecord } from '../../src/mutations';

import type { QueryManager } from '../../src/mutations/resident';

jest.mock('lodash/isBuffer', () => (value: unknown) => {
	const structuredClone = (input: unknown) => {
		const { MessageChannel } =
			jest.requireActual<typeof import('node:worker_threads')>('node:worker_threads');
		const { port1, port2 } = new MessageChannel();
		try {
			port1.postMessage(input);
		} finally {
			port1.close();
			port2.close();
		}
	};
	structuredClone(value);
	return false;
});

const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
const mockAwaitWriteOutcome = jest.fn();
const mockSync = jest.fn();
const mockEvents = jest.fn();

/** The single source both `active()` and `whenActive()` read, as in the real
 * engine — a mock that let them disagree would model a state it cannot be in. */
const activeScope = () => ({
	database: {
		collections: {
			orders: { findOne: () => ({ exec: mockFindOneExec }) },
		},
	},
});

const runtime = {
	engine: {
		active: activeScope,
		whenActive: async () => activeScope(),
		write: mockWrite,
		sync: mockSync,
		events: mockEvents,
	},
} as unknown as QueryManager;

jest.mock('../../src/await-write-outcome', () => ({
	...jest.requireActual('../../src/await-write-outcome'),
	awaitWriteOutcome: (...args: unknown[]) => mockAwaitWriteOutcome(...args),
}));

describe('pushRecord', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
		mockAwaitWriteOutcome.mockResolvedValue('success');
	});

	it('enqueues the current resident payload instead of stale legacy document fields', async () => {
		const staleJson = {
			uuid: 'order-uuid',
			id: 123,
			status: 'pending',
			line_items: [{ id: 1, product_id: 42, quantity: 1 }],
		};
		const resident: Record<string, unknown> = {
			remoteId: '123',
			payload: {
				id: 123,
				status: 'processing',
				line_items: [{ id: 1, product_id: 42, quantity: 2 }],
			},
		};
		resident.get = (field: string) => resident[field];
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 123,
			collection: { name: 'orders' },
			getLatest: () => ({ ...doc, toJSON: () => staleJson }),
		};

		await pushRecord(runtime, doc as never);

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			explicit: true,
			payload: expect.objectContaining({
				status: 'processing',
				line_items: [{ id: 1, product_id: 42, quantity: 2 }],
			}),
		});
	});

	it('enqueues a create when the resident document was born locally', async () => {
		const json = { uuid: 'order-uuid', id: 0, status: 'pos-open', line_items: [] };
		const resident: Record<string, unknown> = {
			remoteId: null,
			payload: json,
		};
		resident.get = (field: string) => resident[field];
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 0,
			collection: { name: 'orders' },
			getLatest: () => ({ ...doc, toJSON: () => json }),
		};

		await pushRecord(runtime, doc as never);

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'create',
			recordId: 'order-uuid',
			explicit: true,
			payload: expect.objectContaining({
				status: 'pos-open',
				line_items: [],
			}),
		});
	});

	it('detaches a proxy-backed resident payload before the worker write', async () => {
		const plainPayload = { status: 'pos-open', billing: { email: '' }, line_items: [] };
		const payload = new Proxy(
			{ ...plainPayload, billing: new Proxy(plainPayload.billing, {}) },
			{}
		);
		const resident: Record<string, unknown> = {
			remoteId: null,
		};
		resident.get = (field: string) => (field === 'payload' ? payload : resident[field]);
		resident.toMutableJSON = () => ({ payload: plainPayload });
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 0,
			collection: { name: 'orders' },
			getLatest: () => doc,
		};

		await expect(pushRecord(runtime, doc as never)).resolves.toBeDefined();

		const queuedPayload = mockWrite.mock.calls[0][0].payload;
		expect(queuedPayload).toEqual(plainPayload);
		expect(queuedPayload).toBe(plainPayload);
	});

	it('preserves a non-empty order billing email', async () => {
		const payload = { status: 'pos-open', billing: { email: 'shopper@example.com' } };
		const resident: Record<string, unknown> = { remoteId: null, payload };
		resident.get = (field: string) => resident[field];
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 0,
			collection: { name: 'orders' },
			getLatest: () => doc,
		};

		await pushRecord(runtime, doc as never);

		expect(mockWrite.mock.calls[0][0].payload.billing.email).toBe('shopper@example.com');
	});

	it('waits for an order acknowledgement and returns the rematerialized record id', async () => {
		const resident: Record<string, unknown> = {
			remoteId: null,
			payload: { status: 'pos-open' },
			collection: { name: 'orders' },
		};
		resident.get = (field: string) => resident[field];
		resident.getLatest = () => resident;
		mockFindOneExec.mockResolvedValue(resident);
		mockAwaitWriteOutcome.mockImplementationOnce(async () => {
			resident.remoteId = '987';
			resident.payload = { id: 987, number: '987', status: 'pending' };
			return 'success';
		});
		const doc = {
			uuid: 'order-uuid',
			id: null,
			collection: { name: 'orders' },
			getLatest: () => doc,
		};

		const saved = await pushRecord(runtime, doc as never);

		expect(mockAwaitWriteOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ write: mockWrite }),
			'mutation-1',
			{ timeoutMs: 45_000 }
		);
		expect((saved as unknown as { payload: { id: number } }).payload.id).toBe(987);
		expect(mockFindOneExec).toHaveBeenCalledTimes(2);
	});

	it.each([
		[
			'rejected',
			new Error('write-rejected for mutation "mutation-1"'),
			ERROR_CODES.SYNC_UNEXPECTED,
		],
		[
			'timed out',
			new Error('Timed out waiting for mutation "mutation-1"'),
			ERROR_CODES.SYNC_UNEXPECTED,
		],
		['deferred 401', new WriteDeferredError('mutation-1', 401), ERROR_CODES.SESSION_EXPIRED],
		[
			'rejected 401',
			new WriteOutcomeError('write-rejected', 'mutation-1', 401),
			ERROR_CODES.SESSION_EXPIRED,
		],
		[
			'rejected 403',
			new WriteOutcomeError('write-rejected', 'mutation-1', 403),
			ERROR_CODES.INSUFFICIENT_ROLE,
		],
	])(
		'throws without reporting, and maps the failure code, when an order write outcome is %s',
		async (_label, error, code) => {
			const resident: Record<string, unknown> = {
				remoteId: null,
				payload: { status: 'pos-open' },
			};
			resident.get = (field: string) => resident[field];
			mockFindOneExec.mockResolvedValue(resident);
			mockAwaitWriteOutcome.mockRejectedValueOnce(error);
			const doc = {
				uuid: 'order-uuid',
				id: null,
				collection: { name: 'orders' },
				getLatest: () => doc,
			};

			await expect(pushRecord(runtime, doc as never)).rejects.toThrow(error.message);
			// The caller owns the one report (log + toast); a second here doubled both.
			expect(getLogger(['wcpos', 'sync', 'push']).error).not.toHaveBeenCalled();
			expect(pushFailureCode(error)).toBe(code);
		}
	);

	it('keeps the auth codes and falls back to the caller code for any other failure', () => {
		const fallback = ERROR_CODES.CHECKOUT_FAILED_CART_SAFE;
		expect(pushFailureCode(new WriteDeferredError('mutation-1', 401), fallback)).toBe(
			ERROR_CODES.SESSION_EXPIRED
		);
		expect(pushFailureCode(new Error('Timed out waiting for mutation'), fallback)).toBe(fallback);
	});
});
