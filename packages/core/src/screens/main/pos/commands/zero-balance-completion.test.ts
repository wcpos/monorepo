import type { EngineRecord } from '@wcpos/query';

import { writeZeroBalanceCompletion } from './zero-balance-completion';
import { completionMetaFor } from '../checkout/sale-completion';

jest.mock('../checkout/sale-completion', () => ({
	completionMetaFor: jest.fn(async () => [{ key: '_wcpos_sale_counter', value: '7' }]),
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
	return { input, written, result: writeZeroBalanceCompletion({} as never, input as never) };
}

beforeEach(() => jest.clearAllMocks());

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
