/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { createTestT } from '../../../../../../jest/translate';
import { correctionFailureMessage, useCorrectTender } from './use-correct-tender';

const mockT = createTestT();
const t = mockT as unknown as Parameters<typeof correctionFailureMessage>[1];
const mockPost = jest.fn();
const mockMirror = jest.fn();
const mockSettle = jest.fn();
const mockLog = { warn: jest.fn(), success: jest.fn() };
let mockStatus = 'online-website-available';

jest.mock('@wcpos/utils/logger', () => ({
	// Read at call time: the module under test asks for its logger before this file's consts exist.
	getLogger: () => ({
		warn: (...args: unknown[]) => mockLog.warn(...args),
		success: (...args: unknown[]) => mockLog.success(...args),
	}),
	getErrorMessage: (error: unknown) => String(error),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockPost }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('@wcpos/query', () => ({
	moneyCommandPoster: (input: { post: (url: string, body: unknown) => Promise<unknown> }) =>
		Object.assign((url: string, body: unknown) => input.post(url, body), {
			mirror: mockMirror,
			settle: mockSettle,
		}),
	useQueryRuntime: () => ({}),
}));
jest.mock('../../../../../contexts/app-state', () => {
	const session = { storeDB: {} };
	return { useStoreSession: () => session };
});

const order = (id: number | undefined) =>
	({ uuid: 'order-uuid', payload: { id, meta_data: [] } }) as unknown as EngineRecord<'orders'>;
const cash = { id: 'pos_cash', title: 'Cash' };
const refusal = (
	status: number,
	code: string,
	data?: Record<string, unknown>,
	message?: string
) => ({
	response: { status, data: { code, message, data } },
});

beforeEach(() => {
	jest.clearAllMocks();
	mockStatus = 'online-website-available';
	mockMirror.mockResolvedValue(undefined);
	mockSettle.mockResolvedValue(undefined);
});

describe('useCorrectTender (test 8)', () => {
	it('posts the exact path and { method_id }, mirrors the answer and settles', async () => {
		const answer = { payment: { id: 'r-plus', corrects: 'leg-1' }, order: { status: 'completed' } };
		mockPost.mockResolvedValue({ data: answer });
		const { result } = renderHook(() => useCorrectTender());
		let done = false;
		await act(async () => {
			done = await result.current(order(42), 'leg-1', cash);
		});
		expect(done).toBe(true);
		expect(mockPost).toHaveBeenCalledTimes(1);
		expect(mockPost).toHaveBeenCalledWith('orders/42/payments/leg-1/correct', {
			method_id: 'pos_cash',
		});
		expect(mockMirror).toHaveBeenCalledWith(answer);
		expect(mockSettle).toHaveBeenCalled();
		expect(mockLog.success).toHaveBeenCalledWith('Payment changed to Cash', expect.anything());
	});

	it('sends nothing offline, and nothing for an order the store does not have', async () => {
		const { result } = renderHook(() => useCorrectTender());
		mockStatus = 'online-website-unavailable';
		const { result: offline } = renderHook(() => useCorrectTender());
		await act(async () => {
			expect(await offline.current(order(42), 'leg-1', cash)).toBe(false);
			expect(await result.current(order(undefined), 'leg-1', cash)).toBe(false);
		});
		expect(mockPost).not.toHaveBeenCalled();
		expect(mockMirror).not.toHaveBeenCalled();
	});

	it('a refusal toasts its reason and mirrors nothing', async () => {
		mockPost.mockRejectedValue(
			refusal(422, 'wcpos_payment_not_correctable', { reason: 'already_corrected' })
		);
		const { result } = renderHook(() => useCorrectTender());
		await act(async () => {
			expect(await result.current(order(42), 'leg-1', cash)).toBe(false);
		});
		expect(mockMirror).not.toHaveBeenCalled();
		expect(mockLog.warn).toHaveBeenCalledWith(
			mockT('orders.change_tender_already_corrected'),
			expect.objectContaining({ showToast: true })
		);
	});
});

describe('correctionFailureMessage (test 9)', () => {
	const notCorrectable = (data: Record<string, unknown>) =>
		correctionFailureMessage(
			refusal(422, 'wcpos_payment_not_correctable', data, 'Store says no'),
			t
		);

	it('words every reason with its own string', () => {
		const reasons = [
			'not_captured',
			'voidable',
			'is_reversal',
			'already_corrected',
			'refunded',
			'provider_row',
			'method_invalid',
			'same_method',
			'off_rounding_increment',
		];
		const messages = reasons.map((reason) =>
			notCorrectable({ reason, increment: '0.05', amount: '10.03' })
		);
		expect(messages.every(({ refused }) => refused)).toBe(true);
		expect(new Set(messages.map(({ message }) => message)).size).toBe(reasons.length);
		expect(messages.some(({ message }) => message === 'Store says no')).toBe(false);
		const offIncrement = messages.at(-1)?.message ?? '';
		expect(offIncrement).toContain('0.05');
		expect(offIncrement).toContain('10.03');
	});

	it('names the fiscal refusal, and falls back to the store message for an unknown reason', () => {
		expect(
			correctionFailureMessage(refusal(403, 'wcpos_tender_correction_unavailable'), t)
		).toEqual({ refused: true, message: mockT('orders.change_tender_unavailable') });
		expect(notCorrectable({ reason: 'something_new' })).toEqual({
			refused: true,
			message: 'Store says no',
		});
	});

	it('a failure that is not the store’s decision says the outcome is not known yet', () => {
		const unknown = { refused: false, message: mockT('orders.change_tender_unknown') };
		expect(correctionFailureMessage(new Error('Network Error'), t)).toEqual(unknown);
		expect(correctionFailureMessage(refusal(503, 'internal_server_error'), t)).toEqual(unknown);
	});
});
