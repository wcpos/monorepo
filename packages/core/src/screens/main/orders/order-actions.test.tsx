/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { getLogger } from '@wcpos/utils/logger';

import { DeleteOrderDialog, useOrderActions } from './order-actions';

/**
 * #163 ruling R5 reaches the order modal's footer too: re-open is an order save and
 * delete is a void, both writes the device cannot record while the storage worker is
 * dead. `useOrderActions` is the footer's one source of those guards and toasts, so the
 * harness wires its outputs the way `edit/view.tsx` wires its buttons.
 */
const mockEngineWrite = jest.fn(async () => ({
	mutationId: 'delete-1',
	annihilated: true,
}));
const mockLocalPatch = jest.fn();
const mockPush = jest.fn();
const mockHandlers = new Map<string, () => unknown>();
const mockDisabled = new Map<string, boolean>();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockEngineRequire = jest.fn();
const mockAwaitWriteOutcome = jest.fn(async (..._args: unknown[]) => undefined as unknown);
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({
		engine: { write: mockEngineWrite, require: mockEngineRequire },
	}),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
	awaitWriteOutcome: (...args: unknown[]) => mockAwaitWriteOutcome(...args),
	WriteOutcomeError: class WriteOutcomeError extends Error {
		constructor(public reason?: string) {
			super('write-rejected');
		}
	},
}));

jest.mock('@wcpos/sync-core', () => ({
	...jest.requireActual('@wcpos/sync-core'),
	WOO_REST_CANNOT_DELETE: 'woocommerce_rest_cannot_delete',
}));

const recordAction = (testID?: string, onPress?: () => unknown, disabled?: boolean) => {
	if (!testID) return;
	if (onPress) mockHandlers.set(testID, onPress);
	mockDisabled.set(testID, !!disabled);
};

jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogFooter: (props: import('@wcpos/components/alert-dialog').AlertDialogFooterProps) => {
		recordAction(props.confirm.testID, props.confirm.onPress as () => void, props.confirm.disabled);
		const Footer = jest.requireActual('../../../../jest/footer.test-utils').AlertDialogFooter;
		return <Footer {...props} />;
	},
	AlertDialogCancel: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogAction: ({
		children,
		onPress,
		testID,
		disabled,
	}: React.PropsWithChildren<{
		onPress?: () => unknown;
		testID?: string;
		disabled?: boolean;
	}>) => {
		recordAction(testID, onPress, disabled);
		return <div data-testid={testID}>{children}</div>;
	},
}));

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

jest.mock('../../../contexts/app-state', () => {
	const useAppState = () => ({
		store: { id: 1 },
		wpCredentials: { id: 7 },
		site: { uuid: 'site-1' },
	});
	return { useAppState, useStoreSession: useAppState };
});

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

const mockOrder = {
	uuid: 'order-1',
	payload: { id: 42, status: 'completed', meta_data: [] },
};

/** The footer's wiring (`edit/view.tsx`): each button's handler and disabled state. */
function Footer({ order }: { order: typeof mockOrder }) {
	const actions = useOrderActions(order as never);
	recordAction('order-modal-reopen', actions.reopen, actions.storageDegraded || actions.reopening);
	recordAction('order-modal-refund', actions.refund, actions.storageDegraded);
	recordAction('order-modal-sync', actions.sync);
	recordAction('order-modal-delete', actions.requestDelete, actions.storageDegraded);
	return (
		<DeleteOrderDialog
			orderID={actions.orderID}
			open={actions.deleteOpen}
			onOpenChange={actions.setDeleteOpen}
			onConfirm={actions.confirmDelete}
			disabled={actions.storageDegraded}
		/>
	);
}

async function degradeStorage(databaseName: string) {
	const instance = {
		schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
		findDocumentsById: jest.fn(),
		bulkWrite: jest
			.fn()
			.mockRejectedValue(
				new Error(
					'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
				)
			),
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

describe('Order actions while storage is degraded (#163 ruling R5)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockHandlers.clear();
		mockDisabled.clear();
	});

	afterEach(() => {
		act(() => clearStorageDegradation());
	});

	it('allows re-open and delete while storage is healthy', async () => {
		render(<Footer order={mockOrder} />);

		expect(mockDisabled.get('order-modal-reopen')).toBe(false);
		expect(mockDisabled.get('order-delete-confirm-button')).toBe(false);
		expect(mockDisabled.get('order-modal-refund')).toBe(false);

		await act(async () => {
			await mockHandlers.get('order-delete-confirm-button')!();
		});
		expect(mockEngineWrite).toHaveBeenCalledWith(
			expect.objectContaining({ operation: 'delete', recordId: 'order-1' })
		);
	});

	it('blocks re-open (an order save), delete (a void) and refund', async () => {
		render(<Footer order={mockOrder} />);
		await degradeStorage('degraded-orders-list');

		expect(mockDisabled.get('order-modal-reopen')).toBe(true);
		expect(mockDisabled.get('order-modal-delete')).toBe(true);
		expect(mockDisabled.get('order-delete-confirm-button')).toBe(true);
		// Refunds are a money path under the #163 follow-up ruling: don't let the
		// cashier into a flow that cannot record what it hands back.
		expect(mockDisabled.get('order-modal-refund')).toBe(true);

		await act(async () => {
			await mockHandlers.get('order-modal-reopen')!();
			await mockHandlers.get('order-delete-confirm-button')!();
			await mockHandlers.get('order-modal-refund')!();
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPush).not.toHaveBeenCalled();
		expect(mockEngineWrite).not.toHaveBeenCalled();
	});

	it('stops before navigation when storage degrades during the re-open patch', async () => {
		let resolveLocalPatch!: () => void;
		mockLocalPatch.mockImplementation(
			() => new Promise<void>((resolve) => (resolveLocalPatch = resolve))
		);
		render(<Footer order={mockOrder} />);

		let openPromise!: Promise<unknown>;
		act(() => {
			openPromise = mockHandlers.get('order-modal-reopen')!() as Promise<unknown>;
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);

		await degradeStorage('degraded-orders-list-during-reopen');
		await act(async () => {
			resolveLocalPatch();
			await openPromise;
		});

		expect(mockPush).not.toHaveBeenCalled();
	});
});

jest.mock('../../../services/register/use-register', () => ({ useRegister: () => null }));
describe('Order action reports', () => {
	const logger = getLogger(['test']) as unknown as Record<'debug' | 'warn' | 'error', jest.Mock>;

	beforeEach(() => {
		jest.clearAllMocks();
		mockHandlers.clear();
		mockDisabled.clear();
	});

	it('toasts a failed refresh without a second row (the engine logged the require)', async () => {
		mockEngineRequire.mockReturnValue({
			ready: Promise.reject(new Error('require: unreachable')),
			release: jest.fn(),
		});
		render(<Footer order={mockOrder} />);

		await act(async () => {
			await mockHandlers.get('order-modal-sync')!();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(
			'Failed to refresh order',
			expect.objectContaining({
				showToast: true,
				toast: { title: 'orders.refresh_failed', type: 'warning' },
			})
		);
	});

	it('toasts a store delete refusal with the role hint, without a second row', async () => {
		const { WriteOutcomeError } = jest.requireMock('@wcpos/query') as {
			WriteOutcomeError: new (reason?: string) => Error;
		};
		mockEngineWrite.mockResolvedValueOnce({ mutationId: 'delete-1', annihilated: false });
		mockAwaitWriteOutcome.mockRejectedValueOnce(
			new WriteOutcomeError('woocommerce_rest_cannot_delete')
		);
		render(<Footer order={mockOrder} />);

		await act(async () => {
			await mockHandlers.get('order-delete-confirm-button')!();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(
			'Server refused to delete order',
			expect.objectContaining({
				showToast: true,
				code: 'AUTH201',
				toast: { title: 'orders.delete_not_permitted', type: 'error' },
			})
		);
	});
});
