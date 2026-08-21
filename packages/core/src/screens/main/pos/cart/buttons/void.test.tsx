/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { VoidButton } from './void';

/** Scripted result for one awaitWriteOutcome call, consumed in order. */
type ScriptedOutcome = 'acknowledged' | 'rejected' | 'timeout';

const mockCartLogger = {
	success: jest.fn(),
	error: jest.fn(),
};
const mockRouter = { setParams: jest.fn() };
const mockPatchEngineResident = jest.fn();
const mockPatchAndEnqueueEngineResident = jest.fn();
const mockFindEngineResident = jest.fn();
const mockInsertEngineResident = jest.fn();
let mockOutcomes: ScriptedOutcome[] = [];
let mockConnectivity: 'online' | 'offline' | 'degraded' = 'online';
let mockAwaitCalls: { mutationId: string; timeoutMs?: number }[] = [];

const mockEngine = {
	write: jest.fn(async ({ operation }: { operation: string }) => ({
		mutationId: operation === 'delete' ? 'delete-1' : 'update-1',
		annihilated: false,
	})),
	status: jest.fn(() => ({ connectivity: mockConnectivity })),
};
const mockManager = { engine: mockEngine };
const mockOrderJson = {
	uuid: 'order-1',
	id: 42,
	number: '42',
	status: 'pos-open',
};
const mockCurrentOrder = {
	uuid: 'order-1',
	payload: mockOrderJson,
	getLatest: () => mockCurrentOrder,
	toMutableJSON: () => ({ payload: { ...mockOrderJson } }),
};

jest.mock('expo-router', () => ({
	useRouter: () => mockRouter,
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));

jest.mock('@wcpos/query', () => {
	class WriteOutcomeError extends Error {
		eventType: 'write-rejected' | 'write-conflict';
		status?: number;
		reason?: string;

		constructor(reason?: string, status?: number) {
			super(`write-rejected for mutation "delete-1"`);
			this.name = 'WriteOutcomeError';
			this.eventType = 'write-rejected';
			this.status = status;
			this.reason = reason;
		}
	}

	return {
		useQueryRuntime: () => mockManager,
		WriteOutcomeError,
		awaitWriteOutcome: (
			_engine: typeof mockEngine,
			mutationId: string,
			options?: { timeoutMs?: number }
		) => {
			mockAwaitCalls.push({ mutationId, timeoutMs: options?.timeoutMs });
			const next = mockOutcomes.shift() ?? 'acknowledged';
			if (next === 'rejected') {
				return Promise.reject(new WriteOutcomeError('woocommerce_rest_cannot_delete', 403));
			}
			if (next === 'timeout') {
				return Promise.reject(new Error(`Timed out waiting for mutation "${mutationId}"`));
			}
			return Promise.resolve('success');
		},
	};
});

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		success: (...args: unknown[]) => mockCartLogger.success(...args),
		error: (...args: unknown[]) => mockCartLogger.error(...args),
	}),
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	findEngineResident: (...args: unknown[]) => mockFindEngineResident(...args),
	insertEngineResident: (...args: unknown[]) => mockInsertEngineResident(...args),
	patchEngineResident: (...args: unknown[]) => mockPatchEngineResident(...args),
	patchAndEnqueueEngineResident: (...args: unknown[]) => mockPatchAndEnqueueEngineResident(...args),
}));

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrderRecord: () => mockCurrentOrder,
}));

describe('VoidButton', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOutcomes = [];
		mockAwaitCalls = [];
		mockConnectivity = 'online';
		mockFindEngineResident.mockResolvedValue({});
		mockPatchEngineResident.mockResolvedValue({
			get: () => ({ status: 'pos-open' }),
		});
		mockPatchAndEnqueueEngineResident.mockResolvedValue(undefined);
	});

	it('deletes a permitted void without enqueueing an update', async () => {
		mockOutcomes = ['acknowledged'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		expect(mockEngine.write).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'delete',
			recordId: 'order-1',
		});
		expect(mockPatchAndEnqueueEngineResident).not.toHaveBeenCalled();
	});

	it('keeps a refused void pending locally and enqueues the update', async () => {
		mockOutcomes = ['rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockPatchAndEnqueueEngineResident).toHaveBeenCalledWith({
			manager: mockManager,
			collection: 'orders',
			recordId: 'order-1',
			changes: { status: 'pending' },
		});
	});

	it('converts a refused void while connectivity is degraded — the drain still pushes', async () => {
		mockConnectivity = 'degraded';
		mockOutcomes = ['rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockPatchAndEnqueueEngineResident).toHaveBeenCalled();
	});

	it('skips the outcome watch entirely when offline (accepted gap)', async () => {
		mockConnectivity = 'offline';
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		expect(mockAwaitCalls).toHaveLength(0);
	});

	it('converts on a refusal that arrives after the helper timeout', async () => {
		mockOutcomes = ['timeout', 'rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		// Optimistic toast fires at the timeout, then the late refusal converts.
		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockCartLogger.success).toHaveBeenNthCalledWith(
			1,
			'pos_cart.order_removed',
			expect.any(Object)
		);
		expect(mockAwaitCalls).toHaveLength(2);
		expect(mockAwaitCalls[1]?.timeoutMs).toBeGreaterThan(15_000);
		expect(mockPatchAndEnqueueEngineResident).toHaveBeenCalledWith(
			expect.objectContaining({ changes: { status: 'pending' } })
		);
	});

	it('does not convert on a late refusal after the cashier already undid the void', async () => {
		let releaseLateWatch: (() => void) | undefined;
		mockOutcomes = ['timeout'];
		const lateRejection = new Promise<never>((_resolve, reject) => {
			releaseLateWatch = () => {
				const { WriteOutcomeError } = jest.requireMock('@wcpos/query');
				reject(new WriteOutcomeError('woocommerce_rest_cannot_delete', 403));
			};
		});
		// Second call hangs until the undo has run, then rejects with the refusal.
		const query = jest.requireMock('@wcpos/query');
		const original = query.awaitWriteOutcome;
		query.awaitWriteOutcome = jest
			.fn()
			.mockImplementationOnce(original)
			.mockImplementationOnce(() => lateRejection);

		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		const toastOptions = mockCartLogger.success.mock.calls[0][1];
		await toastOptions.toast.action.onClick(); // undo
		releaseLateWatch?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(mockPatchAndEnqueueEngineResident).not.toHaveBeenCalled();
		query.awaitWriteOutcome = original;
	});

	it('surfaces an error toast and no success toast when the fallback enqueue fails', async () => {
		mockOutcomes = ['rejected'];
		mockPatchAndEnqueueEngineResident.mockRejectedValue(new Error('enqueue failed'));
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.error).toHaveBeenCalledWith('Failed to void order', expect.any(Object))
		);
		expect(mockCartLogger.success).not.toHaveBeenCalled();
	});

	it('undo after fallback restores pos-open and enqueues an update', async () => {
		mockOutcomes = ['rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() => expect(mockCartLogger.success).toHaveBeenCalled());
		const toastOptions = mockCartLogger.success.mock.calls[0][1];
		toastOptions.toast.action.onClick();
		await waitFor(() => expect(mockEngine.write).toHaveBeenCalledTimes(2));

		expect(mockPatchEngineResident).toHaveBeenLastCalledWith({
			manager: mockManager,
			collection: 'orders',
			recordId: 'order-1',
			changes: mockOrderJson,
		});
		expect(mockEngine.write).toHaveBeenLastCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-1',
			payload: { status: 'pos-open' },
		});
	});
});
