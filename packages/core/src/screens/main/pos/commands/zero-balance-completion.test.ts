import type { EngineRecord } from '@wcpos/query';

import { writeZeroBalanceCompletion } from './zero-balance-completion';
import { completionMetaFor } from '../checkout/sale-completion';

jest.mock('../checkout/sale-completion', () => ({
	completionMetaFor: jest.fn(async () => [{ key: '_wcpos_sale_counter', value: '7' }]),
}));
const mockResolve = jest.fn(async (..._args: unknown[]) => undefined);
let mockJournal: { kind: string; sentAt: string | null }[] = [];
jest.mock('@wcpos/query/store-local', () => ({
	resolveCompletionAttempt: (...args: unknown[]) => mockResolve(...args),
	readOrderCommands: async () => ({ entries: mockJournal, chain: null }),
}));

const payload = { id: 42, total: '0.00', status: 'pos-partial', meta_data: [] };
const order = {
	uuid: 'order-1',
	getLatest: () => ({ payload }),
} as unknown as EngineRecord<'orders'>;

function run(online: boolean) {
	const written: Record<string, unknown>[] = [];
	const input = {
		order,
		sessionId: 'session',
		queue: {} as never,
		write: jest.fn(async (changes: (current: typeof payload) => Record<string, unknown>) => {
			written.push(changes(payload));
			return {};
		}),
		complete: jest.fn(async () => undefined),
		online: () => online,
		close: jest.fn(async () => ({ kind: 'completed' as const, order: null, completion: null })),
	};
	const ctx = { storeDB: 'store-db' } as never;
	return { input, written, result: writeZeroBalanceCompletion(ctx, input as never) };
}

beforeEach(() => {
	jest.clearAllMocks();
	mockJournal = [];
});

// ADR 0040 D2: the server completes the sale through close; the till never writes `completed`.
it('completes through close and never writes status', async () => {
	const { input, written, result } = run(true);
	await result;
	expect(written).toEqual([{ meta_data: [{ key: '_wcpos_sale_counter', value: '7' }] }]);
	expect(written[0]).not.toHaveProperty('status');
	expect(input.close).toHaveBeenCalledWith(order);
	expect(input.complete).toHaveBeenCalledTimes(1);
	expect(input.write.mock.invocationCallOrder[0]).toBeLessThan(
		input.close.mock.invocationCallOrder[0]
	);
});

it('a close the store refuses does not complete the sale', async () => {
	const { input, result } = run(true);
	input.close.mockResolvedValueOnce({ kind: 'outstanding', order: null } as never);
	expect(await result).toEqual({ kind: 'outstanding', order: null });
	expect(input.complete).not.toHaveBeenCalled();
});

// The tender reports this outcome as CHECKOUT101 (use-tender-flow.test.tsx); the boundary logs it.
it('offline refuses before writing or allocating a sale counter', async () => {
	const { input, result } = run(false);
	expect(await result).toEqual({ kind: 'offline' });
	expect(completionMetaFor).not.toHaveBeenCalled();
	expect(input.write).not.toHaveBeenCalled();
	expect(input.close).not.toHaveBeenCalled();
});

// The callers journal the completing sale first: a close that cannot finish it resolves that
// attempt, except `outstanding` (a settling leg may still cover it), `unconfirmed` (the store
// closed it; the bridge finishes it, Codex 4341491589 on #2798) and a close with no answer.
it.each([
	['offline', null, true],
	['refused', { kind: 'refused', code: 'wcpos_invalid_transition', message: 'm' }, true],
	['order_changed', { kind: 'order_changed' }, true],
	['reopened', { kind: 'reopened', order: { status: 'completed' } }, true],
	['outstanding', { kind: 'outstanding', order: null }, false],
	['unconfirmed', { kind: 'unconfirmed', order: { status: 'completed' } }, false],
])('a %s close (%j) resolves the completion attempt: %s', async (kind, closed, resolves) => {
	const { input, result } = run(kind !== 'offline');
	if (closed) input.close.mockResolvedValueOnce(closed as never);
	await result;
	expect(mockResolve).toHaveBeenCalledTimes(resolves ? 1 : 0);
	if (resolves) expect(mockResolve).toHaveBeenCalledWith('store-db', 'order-1');
});

// Codex 4343188027 on #2832: a close sent and never answered may have completed the sale; a press
// made offline since must not resolve the attempt the bridge finishes once the paid order lands.
it('offline with a sent, unanswered close keeps the completion attempt', async () => {
	mockJournal = [
		{ kind: 'record', sentAt: null },
		{ kind: 'close', sentAt: '2026-10-22T00:00:00Z' },
	];
	const { input, result } = run(false);
	expect(await result).toEqual({ kind: 'offline' });
	expect(mockResolve).not.toHaveBeenCalled();
	expect(input.write).not.toHaveBeenCalled();
	expect(input.close).not.toHaveBeenCalled();
});

it('a close with no answer keeps the completion attempt for the re-send', async () => {
	const { input, result } = run(true);
	input.close.mockRejectedValueOnce(new Error('Network Error'));
	await expect(result).rejects.toThrow('Network Error');
	expect(mockResolve).not.toHaveBeenCalled();
});
