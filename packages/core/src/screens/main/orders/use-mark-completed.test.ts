/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { markCompletedTier, useMarkCompleted } from './use-mark-completed';

/**
 * monorepo#3648: Mark completed is a money command beside `close` (`POST orders/{id}/complete`),
 * never a record push. The poster's own envelope (command id, revision, re-adoption) is pinned in
 * query's `money-command.test.ts`; this fake adds the same two keys so the wire is visible here.
 */
const mockHttpPost = jest.fn();
const mockHttp = { post: (...args: unknown[]) => mockHttpPost(...args) };
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
const mockMirror = jest.fn(async (..._args: unknown[]) => undefined);
const mockSettle = jest.fn(async () => undefined);
const mockAbandon = jest.fn(async () => undefined);
const mockPosterInput = jest.fn();
jest.mock('@wcpos/query', () => {
	class MoneyCommandError extends Error {
		constructor(public reason: string) {
			super(reason);
		}
	}
	return {
		MoneyCommandError,
		useQueryRuntime: () => ({ engine: {} }),
		moneyCommandPoster: (input: {
			post: (url: string, body: unknown) => Promise<{ data: unknown }>;
		}) => {
			mockPosterInput(input);
			const poster = async (url: string, body: object) => {
				const sent = { ...body, command_id: 'cmd-1', revision: 'sha256:r1' };
				const { data } = await input.post(url, sent);
				return { data, sentRevision: 'sha256:r1' };
			};
			return Object.assign(poster, {
				mirror: mockMirror,
				settle: mockSettle,
				abandon: mockAbandon,
			});
		},
	};
});
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: { name: 'store-db' } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
let mockDegraded = false;
jest.mock('../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ blockIfDegraded: () => mockDegraded }),
}));

const logger = getLogger(['test']) as unknown as Record<'debug', jest.Mock>;
const order = {
	uuid: 'order-1',
	payload: { id: 42, status: 'processing' },
	getLatest: () => ({ payload: { id: 42, status: 'processing' } }),
} as never;
const summary = { status: 'completed', total: '20.00' };
const refusal = (status: number, code: string, message?: string, data?: object) =>
	Object.assign(new Error(code), { response: { status, data: { code, message, data } } });
const toasts = () =>
	logger.debug.mock.calls
		.map(([, options]) => (options as { toast?: { title: string; text2?: string } }).toast)
		.filter(Boolean);

beforeEach(() => {
	jest.clearAllMocks();
	mockDegraded = false;
});

it('is Pro only, through its one tier predicate', () => {
	expect(markCompletedTier(true)).toBe(true);
	expect(markCompletedTier(false)).toBe(false);
});

it('posts orders/<id>/complete with its command id and revision, and mirrors the answer', async () => {
	mockHttpPost.mockResolvedValueOnce({ data: { order: summary, revision: 'sha256:r2' } });
	const { result } = renderHook(() => useMarkCompleted(order));

	await act(() => result.current.markCompleted());

	expect(mockPosterInput).toHaveBeenCalledWith(
		expect.objectContaining({ orderUuid: 'order-1', storeDB: { name: 'store-db' } })
	);
	expect(mockHttpPost).toHaveBeenCalledWith('orders/42/complete', {
		command_id: 'cmd-1',
		revision: 'sha256:r1',
	});
	expect(mockMirror).toHaveBeenCalledWith({ order: summary, revision: 'sha256:r2' });
	expect(toasts()).toEqual([]);
	expect(result.current.completing).toBe(false);
});

it('ignores a second press while the first awaits the store', async () => {
	let answer!: (value: unknown) => void;
	mockHttpPost.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
	const { result } = renderHook(() => useMarkCompleted(order));

	let first!: Promise<void>;
	act(() => {
		first = result.current.markCompleted();
	});
	expect(result.current.completing).toBe(true);
	await act(() => result.current.markCompleted());
	expect(mockHttpPost).toHaveBeenCalledTimes(1);

	await act(async () => {
		answer({ data: { order: summary, revision: 'sha256:r2' } });
		await first;
	});
	expect(result.current.completing).toBe(false);
});

it('sends nothing while storage is degraded', async () => {
	mockDegraded = true;
	const { result } = renderHook(() => useMarkCompleted(order));
	await act(() => result.current.markCompleted());
	expect(mockHttpPost).not.toHaveBeenCalled();
});

it.each([
	['not_processing', 'orders.mark_completed_not_processing', undefined],
	['payment_in_motion', 'orders.mark_completed_payment_in_motion', undefined],
	['not_paid', 'orders.mark_completed_not_paid', 'This order is not fully paid.'],
])('a %s refusal settles the command and toasts its own title', async (reason, title, text2) => {
	mockHttpPost.mockRejectedValueOnce(
		refusal(422, 'wcpos_order_not_completable', 'This order is not fully paid.', { reason })
	);
	const { result } = renderHook(() => useMarkCompleted(order));

	await act(() => result.current.markCompleted());

	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockMirror).not.toHaveBeenCalled();
	expect(toasts()).toEqual([{ title, ...(text2 ? { text2 } : {}), type: 'error' }]);
});

it.each([
	['an unknown reason', refusal(422, 'wcpos_order_not_completable', 'Nope.', { reason: 'other' })],
	['another named refusal', refusal(404, 'wcpos_order_not_found', 'Nope.')],
])('%s toasts the store’s refusal with its message', async (_, error) => {
	mockHttpPost.mockRejectedValueOnce(error);
	const { result } = renderHook(() => useMarkCompleted(order));

	await act(() => result.current.markCompleted());

	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(toasts()).toEqual([
		{ title: 'pos_checkout.order_refused', text2: 'Nope.', type: 'error' },
	]);
});

it.each([
	['a lost answer', new Error('Network Error')],
	['a 5xx', refusal(503, 'http_service_unavailable')],
	['a locked record', refusal(409, 'woo_rxdb_sync_record_locked')],
	['a malformed answer', new Error('money_command_malformed_answer')],
])('%s is not known yet: no success, no settle', async (_, error) => {
	mockHttpPost.mockRejectedValueOnce(error);
	const { result } = renderHook(() => useMarkCompleted(order));

	await act(() => result.current.markCompleted());

	expect(mockMirror).not.toHaveBeenCalled();
	expect(mockSettle).not.toHaveBeenCalled();
	expect(toasts()).toEqual([{ title: 'orders.mark_completed_unknown', type: 'error' }]);
});

it('a changed order is refused, never sent again from here', async () => {
	const { MoneyCommandError } = jest.requireMock('@wcpos/query');
	mockHttpPost.mockRejectedValueOnce(new MoneyCommandError('order_changed'));
	const { result } = renderHook(() => useMarkCompleted(order));

	await act(() => result.current.markCompleted());

	expect(toasts()).toEqual([
		{ title: 'pos_checkout.order_refused', text2: 'order_changed', type: 'error' },
	]);
});
