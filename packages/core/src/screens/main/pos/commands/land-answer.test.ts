import type { EngineRecord } from '@wcpos/query';

import { mirrorAnswer, stampCompletionIfMissing } from './land-answer';
import { completionMetaFor } from '../checkout/sale-completion';

jest.mock('../checkout/sale-completion', () => ({
	completionMetaFor: jest.fn(async () => [{ key: '_wcpos_sale_counter', value: '7' }]),
}));
const mockRefresh = jest.fn(async (..._args: unknown[]) => 'refreshed');
jest.mock('../checkout/hooks/reconcile-completed-order', () => ({
	refreshOrderRecord: (...args: unknown[]) => mockRefresh(...args),
}));

let meta: { key: string; value: unknown }[] = [];
const order = {
	uuid: 'order-1',
	getLatest: () => ({ payload: { id: 42, meta_data: meta } }),
} as unknown as EngineRecord<'orders'>;

function setup() {
	const stampCompletion = jest.fn(async () => true);
	const poster = { mirror: jest.fn(async () => undefined) };
	const ctx = { userDB: {}, siteUuid: 'site', storeId: 1, runtime: 'runtime', stampCompletion };
	const facts = { sessionId: 'session' };
	const land = mirrorAnswer({ ctx: ctx as never, order, poster, facts });
	return { stampCompletion, poster, land };
}

beforeEach(() => {
	jest.clearAllMocks();
	meta = [];
});

describe('mirrorAnswer', () => {
	it('mirrors, then stamps the provenance once when the answer completes the sale', async () => {
		const { stampCompletion, poster, land } = setup();
		const answer = { order: { status: 'completed' } as never };
		await expect(land(answer)).resolves.toBeNull();
		expect(poster.mirror).toHaveBeenCalledWith(answer);
		expect(completionMetaFor).toHaveBeenCalledWith(expect.anything(), [], {
			sessionId: 'session',
		});
		expect(stampCompletion).toHaveBeenCalledTimes(1);
		expect(stampCompletion).toHaveBeenCalledWith(order, [
			{ key: '_wcpos_sale_counter', value: '7' },
		]);
		expect(poster.mirror.mock.invocationCallOrder[0]).toBeLessThan(
			stampCompletion.mock.invocationCallOrder[0]
		);
		expect(mockRefresh).not.toHaveBeenCalled();
	});

	it('stamps nothing when the order already holds its provenance', async () => {
		meta = [{ key: '_wcpos_sale_counter', value: '3' }];
		const { stampCompletion, land } = setup();
		await expect(land({ order: { status: 'completed' } as never })).resolves.toBeNull();
		expect(stampCompletion).not.toHaveBeenCalled();
	});

	it('stamps nothing for an open status, or for an answer that is not accepted (a refusal, a cancel)', async () => {
		const { stampCompletion, land } = setup();
		await land({ order: { status: 'pos-partial' } as never });
		await land({ order: { status: 'completed' } as never }, { accepted: false });
		expect(stampCompletion).not.toHaveBeenCalled();
	});

	it('a mirror that throws refreshes the order, then reports { cause }', async () => {
		const { stampCompletion, poster, land } = setup();
		const cause = new Error('write failed');
		poster.mirror.mockRejectedValueOnce(cause);
		await expect(land({ order: { status: 'completed' } as never })).resolves.toEqual({
			cause,
		});
		expect(mockRefresh).toHaveBeenCalledWith('runtime', 42);
		expect(stampCompletion).not.toHaveBeenCalled();
	});

	it('a stamp that does not land refreshes the order, then reports { cause }', async () => {
		const { stampCompletion, land } = setup();
		stampCompletion.mockResolvedValueOnce(false);
		await expect(land({ order: { status: 'completed' } as never })).resolves.toEqual({
			cause: new Error('provenance_save_failed'),
		});
		expect(mockRefresh).toHaveBeenCalledWith('runtime', 42);
	});

	it('a failed refresh still reports the mirror failure, never throws', async () => {
		const { poster, land } = setup();
		poster.mirror.mockRejectedValue(new Error('write failed'));
		mockRefresh.mockRejectedValueOnce(new Error('offline'));
		await expect(land({ order: null })).resolves.toMatchObject({ cause: expect.any(Error) });
		// A refresh that throws before it returns a promise (no engine yet) is caught too.
		mockRefresh.mockImplementationOnce(() => {
			throw new Error('no engine');
		});
		await expect(land({ order: null })).resolves.toMatchObject({ cause: expect.any(Error) });
	});
});

describe('stampCompletionIfMissing', () => {
	it('throws when the stamp does not land', async () => {
		const stampCompletion = jest.fn(async () => false);
		await expect(
			stampCompletionIfMissing({ stampCompletion } as never, order, 'processing')
		).rejects.toThrow('provenance_save_failed');
	});
});
