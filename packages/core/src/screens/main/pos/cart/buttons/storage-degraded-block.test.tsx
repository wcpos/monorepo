/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';

import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import {
	clearStorageDegradation,
	noteStorageWriteDeadlinePassed,
	STORAGE_WRITE_DEADLINE_MS,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { WriteDeferredError, WriteOutcomeTimeoutError } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { PayButton } from './pay';
import { OrderSheet } from '../order-sheet';

/**
 * Ruling R5 (#163): a dead storage worker HARD-BLOCKS the money paths. A payment
 * accepted for an order that cannot persist is cash in the drawer with no local
 * record, so checkout / save / void refuse outright.
 *
 * These drive the real latch through the storage wrapper rather than mocking
 * `useStorageDegraded` — the seam that failed on March 6 is the one under test.
 */
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockPushDocument = jest.fn();
const mockEngineWrite = jest.fn(async () => ({
	mutationId: 'delete-1',
	annihilated: false,
}));
const mockLogger = getLogger(['test']) as unknown as {
	error: jest.Mock;
	warn: jest.Mock;
	debug: jest.Mock;
	success: jest.Mock;
};

jest.mock('../../hooks/use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: jest.fn(),
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: false, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

// The cart's checkout conditions are not under test: every condition is met.
jest.mock('../../conditions/use-cart-conditions', () => ({
	useCartUnmet: () => [],
	scrollToLine: jest.fn(),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../checkout/refusal-toast', () => ({ showOrderRefusedToast: jest.fn() }));
// Pay reads the register session for its hold; an open session here (the real hook drags the
// app-state hydration chain and its ESM uuid into this CommonJS harness).
jest.mock('../../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ session: { status: 'open' } }),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush, replace: mockReplace, setParams: mockSetParams }),
}));

jest.mock('@wcpos/sync-engine', () =>
	jest.requireActual('../../../../../../../sync-engine/src/write-path/local-work-guard')
);

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
	}: React.PropsWithChildren<{
		onPress?: () => void;
		testID?: string;
		disabled?: boolean;
	}>) => {
		if (testID && onPress) mockHandlers.set(testID, onPress);
		return (
			<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
				{children}
			</button>
		);
	},
}));

// Stand-ins for the real error classes: the real module loads the sync engine, which
// collides with the `@wcpos/sync-core` mock below. They carry only what the buttons read.
jest.mock('@wcpos/query', () => {
	class WriteOutcomeError extends Error {}
	class WriteDeferredError extends Error {
		constructor(
			mutationId: string,
			public status?: number
		) {
			super(`write-deferred (${status}) for mutation "${mutationId}"`);
		}
	}
	class WriteOutcomeTimeoutError extends Error {
		constructor(
			mutationId: string,
			public diagnostics: Record<string, unknown>
		) {
			super(`Timed out waiting for mutation "${mutationId}"`);
		}
	}
	return {
		useQueryRuntime: () => ({
			engine: {
				write: mockEngineWrite,
				status: () => ({ connectivity: 'online' }),
			},
		}),
		awaitWriteOutcome: jest.fn(async () => undefined),
		useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
		WriteDeferredError,
		WriteOutcomeError,
		WriteOutcomeTimeoutError,
	};
});

jest.mock('@wcpos/sync-core', () => ({
	WOO_REST_CANNOT_DELETE: 'woocommerce_rest_cannot_delete',
}));

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
	useCurrentOrderCurrencyFormat: () => ({
		format: (value: number) => `$${value.toFixed(2)}`,
	}),
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
const mockCurrentOrderRecord = {
	uuid: 'order-1',
	payload: { id: 42, number: '42', line_items: [], total: '10.00', refunds: [] },
	getLatest: () => mockCurrentOrderRecord,
	toMutableJSON: () => ({ payload: { ...mockCurrentOrderRecord.payload } }),
};

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: mockCurrentOrder,
		currentOrderRecord: mockCurrentOrderRecord,
	}),
	useCurrentOrderRecord: () => mockCurrentOrderRecord,
	useCurrentOrderActions: () => ({
		getCurrentOrderRecord: () => mockCurrentOrderRecord,
		setCurrentOrderID: jest.fn(),
	}),
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
		'Cart action blocked because local storage is unavailable',
		expect.objectContaining({
			code: ERROR_CODES.LOCAL_DB_UNAVAILABLE,
			showToast: true,
			toast: expect.objectContaining({
				title: 'Local database unavailable — reload the app before taking or refunding payment',
			}),
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
				<Sheet />
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

	it('refuses Pay during a real write stall and proceeds after storage answers', async () => {
		let resolveWrite!: (value: { error: [] }) => void;
		const wrapped = await wrappedErrorHandlerStorage({
			storage: {
				name: 'mock-storage',
				createStorageInstance: jest.fn().mockResolvedValue({
					schema: { primaryKey: 'id' },
					bulkWrite: () =>
						new Promise<{ error: [] }>((resolve) => {
							resolveWrite = resolve;
						}),
					findDocumentsById: jest.fn(),
					query: jest.fn(),
					count: jest.fn(),
					getAttachmentData: jest.fn(),
					cleanup: jest.fn(),
					remove: jest.fn(),
					close: jest.fn().mockResolvedValue(undefined),
					collectionName: 'orders',
				}),
			} as never,
		}).createStorageInstance({ databaseName: 'stalled-checkout' } as never);
		const write = wrapped.bulkWrite([], 'test');
		expect(noteStorageWriteDeadlinePassed({ waitedMs: STORAGE_WRITE_DEADLINE_MS })).toBe(true);
		render(<PayButton />);
		const button = screen.getByTestId('checkout-button');
		expect(button).toBeDisabled();
		await act(async () => {
			await mockHandlers.get('checkout-button')!();
		});
		expectBlockedLog();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(mockPush).not.toHaveBeenCalled();
		await act(async () => {
			resolveWrite({ error: [] });
			await write;
		});
		expect(button).not.toBeDisabled();
		mockLogger.error.mockClear();
		await act(async () => {
			fireEvent.click(button);
		});
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(mockPush).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).not.toHaveBeenCalled();
		await wrapped.close();
	});

	it('disables save to server and refuses to push the order', async () => {
		render(<Sheet />);
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
		render(<Sheet />);
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
	 * (This lane has no payment-methods contract, so it still waits for the save.)
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
		expect(mockReplace).not.toHaveBeenCalled();
	});
});

jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => true,
}));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ loaded: false, unsupportedSchema: false }),
}));

describe('checkout failure report', () => {
	beforeEach(() => jest.clearAllMocks());

	it('warns once that a timed-out checkout push is still sending, carrying the push state', async () => {
		const pushState = { connectivity: 'online', queueDepth: 2, writeSessionHeld: false };
		mockPushDocument.mockRejectedValue(new WriteOutcomeTimeoutError('mutation-1', pushState));

		render(<PayButton />);
		fireEvent.click(screen.getByTestId('checkout-button'));

		await waitFor(() => expect(mockLogger.warn).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).not.toHaveBeenCalled();
		expect(mockLogger.warn).toHaveBeenCalledWith(
			'Checkout failed',
			expect.objectContaining({
				showToast: true,
				code: ERROR_CODES.WRITE_STILL_SENDING,
				toast: {
					title: expect.stringContaining('still on its way to your store'),
					// Pay's next step, not SYNC191's "nothing to do".
					text2: expect.stringContaining('pressing Checkout again'),
				},
				context: expect.objectContaining({
					error: 'Timed out waiting for mutation "mutation-1"',
					pushState,
				}),
			})
		);
	});

	it('toasts a refused session as AUTH101 without a second row (the engine wrote it)', async () => {
		mockPushDocument.mockRejectedValue(new WriteDeferredError('mutation-1', 401));

		render(<PayButton />);
		fireEvent.click(screen.getByTestId('checkout-button'));

		await waitFor(() =>
			expect(mockLogger.debug).toHaveBeenCalledWith(
				'Checkout failed',
				expect.objectContaining({
					showToast: true,
					code: ERROR_CODES.SESSION_EXPIRED,
					// AUTH101's own summary is the sentence, so no explicit title.
					toast: { type: 'warning' },
				})
			)
		);
		expect(mockLogger.error).not.toHaveBeenCalled();
		expect(mockLogger.warn).not.toHaveBeenCalled();
	});
});

// The sheet now owns both buttons; keep the real storage guard and captured handlers above.
jest.mock('./edit-order-meta', () => ({ EditOrderMeta: () => null }));
jest.mock('../../contexts/overlay-side', () => ({ usePanelSide: () => 'left' }));
jest.mock('@wcpos/components/dialog', () => {
	function Pass({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	const { Button } = jest.requireMock('@wcpos/components/button');
	return {
		Dialog: Pass,
		DialogContent: Pass,
		DialogHeader: Pass,
		DialogTitle: Pass,
		DialogFooter: ({
			destructive,
			intent,
		}: import('@wcpos/components/dialog').DialogFooterProps) => (
			<>
				{[destructive, intent]
					.flat()
					.filter((action): action is import('@wcpos/components/dialog').FooterButton => !!action)
					.map((action) => (
						<Button key={action.testID} {...action}>
							{action.label}
						</Button>
					))}
			</>
		),
	};
});
function Sheet() {
	return (
		<OrderSheet
			open
			onOpenChange={() => {}}
			order={mockCurrentOrderRecord as unknown as React.ComponentProps<typeof OrderSheet>['order']}
		/>
	);
}

// The record dialog's shell has its own suite; this one drives the form and the footer it carries.
jest.mock('../../../components/record-dialog', () => ({
	RecordDialog: ({
		record,
		form,
		footer,
	}: {
		record: unknown;
		form: (record: unknown) => React.ReactNode;
		footer?: React.ReactNode;
	}) => (
		<>
			{form(record)}
			{footer}
		</>
	),
}));
