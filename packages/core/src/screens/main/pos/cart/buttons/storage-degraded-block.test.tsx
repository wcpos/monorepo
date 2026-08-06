/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';

import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { PayButton } from './pay';
import { SaveButton } from './save-order';
import { VoidButton } from './void';

/**
 * Ruling R5 (#163): a dead storage worker HARD-BLOCKS the money paths. A payment
 * accepted for an order that cannot persist is cash in the drawer with no local
 * record, so checkout / save / void refuse outright.
 *
 * These drive the real latch through the storage wrapper rather than mocking
 * `useStorageDegraded` — the seam that failed on March 6 is the one under test.
 */
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockPushDocument = jest.fn();
const mockEngineWrite = jest.fn(async () => ({ mutationId: 'delete-1', annihilated: false }));
const mockLogger = getLogger(['test']) as unknown as { error: jest.Mock; success: jest.Mock };

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));

jest.mock('rxdb', () => ({ isRxDocument: () => true }));

/**
 * Handlers are captured as well as rendered: `disabled` stops the DOM click, so
 * the only way to prove the handler ALSO refuses (the latch-fires-after-render
 * race) is to invoke the captured `onPress` directly.
 */
const mockHandlers = new Map<string, () => unknown>();

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string; disabled?: boolean }>) => {
		if (testID && onPress) mockHandlers.set(testID, onPress);
		return (
			<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
				{children}
			</button>
		);
	},
}));

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({
		engine: { write: mockEngineWrite, status: () => ({ connectivity: 'online' }) },
	}),
	awaitWriteOutcome: jest.fn(async () => undefined),
	WriteOutcomeError: class WriteOutcomeError extends Error {},
}));

jest.mock('@wcpos/sync-core', () => ({ WOO_REST_CANNOT_DELETE: 'woocommerce_rest_cannot_delete' }));

jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	findEngineResident: jest.fn(),
	insertEngineResident: jest.fn(),
	patchAndEnqueueEngineResident: jest.fn(),
	patchEngineResident: jest.fn(),
}));

jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => mockPushDocument,
}));

jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));

// Stable identity: `useObservableEagerState` resubscribes on a new observable,
// so a fresh order per render would loop forever.
const mockCurrentOrder = {
	uuid: 'order-1',
	id: 42,
	number: '42',
	line_items: [],
	total$: new BehaviorSubject('10.00'),
	refunds$: new BehaviorSubject([]),
	toMutableJSON: () => ({ uuid: 'order-1', id: 42, number: '42' }),
	getLatest: () => ({ uuid: 'order-1', id: 42, number: '42' }),
};

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder: mockCurrentOrder }),
}));

jest.mock('../../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../../jest/translate')>(
		'../../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

const WORKER_LOSS_MESSAGE =
	'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}';

async function degradeStorage(databaseName: string) {
	const instance = {
		schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
		findDocumentsById: jest.fn(),
		bulkWrite: jest.fn().mockRejectedValue(new Error(WORKER_LOSS_MESSAGE)),
		query: jest.fn(),
		count: jest.fn(),
		getAttachmentData: jest.fn(),
		getChangedDocumentsSince: jest.fn(),
		changeStream: jest.fn(),
		cleanup: jest.fn(),
		close: jest.fn().mockResolvedValue(undefined),
		remove: jest.fn(),
		collectionName: 'orders',
		databaseName,
		internals: {},
		options: {},
	};
	const wrapped = await wrappedErrorHandlerStorage({
		storage: {
			name: 'mock-storage',
			rxdbVersion: '17.4.0',
			createStorageInstance: jest.fn().mockResolvedValue(instance),
		} as never,
	}).createStorageInstance({ databaseName } as never);

	await act(async () => {
		await expect(wrapped.bulkWrite([{ document: { id: '1' } }] as never, 'test')).rejects.toThrow();
	});
}

function expectBlockedLog() {
	expect(mockLogger.error).toHaveBeenCalledWith(
		'Local database unavailable — reload the app before taking payment',
		expect.objectContaining({
			showToast: true,
			context: expect.objectContaining({ errorCode: ERROR_CODES.WORKER_CONNECTION_LOST }),
		})
	);
}

describe('POS money paths while storage is degraded (#163 ruling R5)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockHandlers.clear();
		mockPushDocument.mockResolvedValue({ id: 42, number: '42' });
	});

	afterEach(() => {
		// Still mounted here (RTL's cleanup runs after this hook), so the latch
		// reset re-renders subscribed components.
		act(() => clearStorageDegradation());
	});

	it('leaves checkout, save and void pressable while storage is healthy', () => {
		render(
			<>
				<PayButton />
				<SaveButton />
				<VoidButton />
			</>
		);

		expect(screen.getByTestId('checkout-button')).not.toBeDisabled();
		expect(screen.getByTestId('save-to-server-button')).not.toBeDisabled();
		expect(screen.getByTestId('void-button')).not.toBeDisabled();
	});

	it('disables checkout and refuses to push the order', async () => {
		render(<PayButton />);
		await degradeStorage('degraded-checkout');

		const button = screen.getByTestId('checkout-button');
		expect(button).toBeDisabled();

		fireEvent.click(button);
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(mockPush).not.toHaveBeenCalled();

		// The handler refuses too, so a latch that fires between render and press
		// cannot slip a checkout through.
		await act(async () => {
			await mockHandlers.get('checkout-button')!();
		});
		expectBlockedLog();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(mockPush).not.toHaveBeenCalled();
	});

	it('disables save to server and refuses to push the order', async () => {
		render(<SaveButton />);
		await degradeStorage('degraded-save');

		const button = screen.getByTestId('save-to-server-button');
		expect(button).toBeDisabled();

		fireEvent.click(button);
		expect(mockPushDocument).not.toHaveBeenCalled();

		await act(async () => {
			await mockHandlers.get('save-to-server-button')!();
		});
		expectBlockedLog();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('disables void and refuses to write the delete', async () => {
		render(<VoidButton />);
		await degradeStorage('degraded-void');

		const button = screen.getByTestId('void-button');
		expect(button).toBeDisabled();

		fireEvent.click(button);
		expect(mockEngineWrite).not.toHaveBeenCalled();

		await act(async () => {
			await mockHandlers.get('void-button')!();
		});
		expectBlockedLog();
		expect(mockEngineWrite).not.toHaveBeenCalled();
	});

	/**
	 * The window the ruling is really about: the cashier pressed Checkout while
	 * storage was healthy and the worker died mid-push. The rendered `disabled`
	 * state cannot help here — the guard has to re-read the latch after the await
	 * or the cashier lands in the payment modal for an order that never persisted.
	 */
	it('does not open the payment modal when the worker dies mid-checkout', async () => {
		let resolvePush: (value: unknown) => void = () => undefined;
		mockPushDocument.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolvePush = resolve;
				})
		);

		render(<PayButton />);
		fireEvent.click(screen.getByTestId('checkout-button'));
		await waitFor(() => expect(mockPushDocument).toHaveBeenCalled());

		await degradeStorage('degraded-mid-checkout');
		await act(async () => {
			resolvePush({ id: 42, number: '42' });
		});

		await waitFor(() => expectBlockedLog());
		expect(mockPush).not.toHaveBeenCalled();
	});
});
