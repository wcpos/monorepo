/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { VoidButton } from './void';

type MockEngineEvent =
	| {
			type: 'write-rejected';
			collection: string;
			recordId: string;
			mutationId: string;
			status?: number;
			reason?: string;
	  }
	| {
			type: 'write-acknowledged';
			collection: string;
			recordId: string;
			mutationId: string;
			currentRevision: string | null;
	  };

const mockCartLogger = {
	success: jest.fn(),
	error: jest.fn(),
};
const mockRouter = { setParams: jest.fn() };
const mockPatchEngineResident = jest.fn();
const mockFindEngineResident = jest.fn();
const mockInsertEngineResident = jest.fn();
let mockListener: ((event: MockEngineEvent) => void) | undefined;
let mockOutcome: 'acknowledged' | 'rejected' = 'acknowledged';

const mockEngine = {
	write: jest.fn(async ({ operation }: { operation: string }) => ({
		mutationId: operation === 'delete' ? 'delete-1' : 'update-1',
		annihilated: false,
	})),
	status: jest.fn(() => ({ connectivity: 'online' })),
	events: jest.fn((listener: (event: MockEngineEvent) => void) => {
		mockListener = listener;
		return jest.fn();
	}),
	sync: jest.fn(async () => {
		mockListener?.(
			mockOutcome === 'rejected'
				? {
						type: 'write-rejected',
						collection: 'orders',
						recordId: 'order-1',
						mutationId: 'delete-1',
						status: 403,
						reason: 'woocommerce_rest_cannot_delete',
					}
				: {
						type: 'write-acknowledged',
						collection: 'orders',
						recordId: 'order-1',
						mutationId: 'delete-1',
						currentRevision: null,
					}
		);
		return { status: 'ran' };
	}),
};
const mockManager = { engine: mockEngine };
const mockOrderJson = {
	uuid: 'order-1',
	id: 42,
	number: '42',
	status: 'pos-open',
};
const mockCurrentOrder = {
	...mockOrderJson,
	toMutableJSON: () => ({ ...mockOrderJson }),
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

		constructor(event: MockEngineEvent) {
			super(`${event.type} for mutation "${event.mutationId}"`);
			this.name = 'WriteOutcomeError';
			this.eventType = event.type as 'write-rejected';
			this.status = 'status' in event ? event.status : undefined;
			this.reason = 'reason' in event ? event.reason : undefined;
		}
	}

	return {
		useQueryManager: () => mockManager,
		WriteOutcomeError,
		awaitWriteOutcome: (engine: typeof mockEngine, mutationId: string) =>
			new Promise((resolve, reject) => {
				engine.events((event) => {
					if (event.mutationId !== mutationId) return;
					if (event.type === 'write-rejected') reject(new WriteOutcomeError(event));
					else resolve('success');
				});
				void engine.sync();
			}),
	};
});

jest.mock('@wcpos/utils/logger', () => ({
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
}));

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder: mockCurrentOrder }),
}));

describe('VoidButton', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOutcome = 'acknowledged';
		mockListener = undefined;
		mockFindEngineResident.mockResolvedValue({});
		mockPatchEngineResident.mockResolvedValue({
			get: () => ({ status: 'pos-open' }),
		});
	});

	it('deletes a permitted void without enqueueing an update', async () => {
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
		expect(mockEngine.write).not.toHaveBeenCalledWith(
			expect.objectContaining({ operation: 'update' })
		);
	});

	it('keeps a refused void pending locally and enqueues the update', async () => {
		mockOutcome = 'rejected';
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockPatchEngineResident).toHaveBeenCalledWith({
			manager: mockManager,
			collection: 'orders',
			recordId: 'order-1',
			changes: { status: 'pending' },
		});
		expect(mockEngine.write).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-1',
			payload: { status: 'pending' },
		});
	});

	it('undo after fallback restores pos-open and enqueues an update', async () => {
		mockOutcome = 'rejected';
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() => expect(mockCartLogger.success).toHaveBeenCalled());
		const toastOptions = mockCartLogger.success.mock.calls[0][1];
		await toastOptions.toast.action.onClick();

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
