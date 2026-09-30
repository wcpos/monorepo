/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import type { EngineRecord } from '@wcpos/query';

import { OrderActionsMenu } from './order-menu';
const mockDeleted = jest.fn();
function Actions({ row }: { row: { original: { record: EngineRecord<'orders'> } } }) {
	return (
		<OrderActionsMenu
			order={row.original.record}
			trigger={<button data-testid="order-actions-button" />}
			onDeleted={mockDeleted}
		/>
	);
}

/**
 * #163 ruling R5 reaches the Orders list too: re-open is an order save and
 * delete is a void, both writes the device cannot record while the storage
 * worker is dead.
 */
const mockEngineWrite = jest.fn(async () => ({
	mutationId: 'delete-1',
	annihilated: true,
}));
const mockLocalPatch = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockReadOnly = false;
const mockHandlers = new Map<string, () => unknown>();
const mockDisabled = new Map<string, boolean>();

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({
		engine: { write: mockEngineWrite, require: jest.fn() },
	}),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
	awaitWriteOutcome: jest.fn(async () => undefined),
	WriteOutcomeError: class WriteOutcomeError extends Error {},
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

jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DropdownMenuSeparator: () => null,
	DropdownMenuItem: ({
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
		return (
			<button data-testid={testID} disabled={disabled} onClick={onPress}>
				{children}
			</button>
		);
	},
}));

jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
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
		return (
			<button data-testid={testID} disabled={disabled} onClick={onPress}>
				{children}
			</button>
		);
	},
}));

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		store: { id: 1 },
		wpCredentials: { id: 7 },
		site: { uuid: 'site-1' },
	});
	return { useAppState, useStoreSession: useAppState };
});

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../contexts/pro-access', () => ({
	useProAccess: () => ({ readOnly: mockReadOnly }),
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

const mockOrder = {
	uuid: 'order-1',
	payload: { id: 42, status: 'completed', meta_data: [] },
};

const cellProps = {
	row: {
		original: {
			record: mockOrder,
		},
	},
} as unknown as React.ComponentProps<typeof Actions>;

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

describe('Orders list actions while storage is degraded (#163 ruling R5)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockHandlers.clear();
		mockDisabled.clear();
	});

	afterEach(() => {
		act(() => clearStorageDegradation());
	});

	it('allows re-open and delete while storage is healthy', async () => {
		render(<Actions {...cellProps} />);

		expect(mockDisabled.get('order-reopen-menu-item')).toBe(false);
		expect(mockDisabled.get('order-delete-confirm-button')).toBe(false);
		expect(mockDisabled.get('order-refund-menu-item')).toBe(false);

		await act(async () => {
			await mockHandlers.get('order-delete-confirm-button')!();
		});
		expect(mockDeleted).toHaveBeenCalledTimes(1);
		expect(mockEngineWrite).toHaveBeenCalledWith(
			expect.objectContaining({ operation: 'delete', recordId: 'order-1' })
		);
	});

	it('blocks re-open (an order save), delete (a void) and refund', async () => {
		render(<Actions {...cellProps} />);
		await degradeStorage('degraded-orders-list');

		expect(mockDisabled.get('order-reopen-menu-item')).toBe(true);
		expect(mockDisabled.get('order-delete-menu-item')).toBe(true);
		expect(mockDisabled.get('order-delete-confirm-button')).toBe(true);
		// Refunds are a money path under the #163 follow-up ruling: don't let the
		// cashier into a flow that cannot record what it hands back.
		expect(mockDisabled.get('order-refund-menu-item')).toBe(true);

		await act(async () => {
			await mockHandlers.get('order-reopen-menu-item')!();
			await mockHandlers.get('order-delete-confirm-button')!();
			await mockHandlers.get('order-refund-menu-item')!();
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
		render(<Actions {...cellProps} />);

		let openPromise!: Promise<unknown>;
		act(() => {
			openPromise = mockHandlers.get('order-reopen-menu-item')!() as Promise<unknown>;
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

jest.mock('../../../../services/register/use-register', () => ({ useRegister: () => null }));

// A View push here would detach the order from the selected row and pane.
it('View selects the pane instead of pushing a detail route', () => {
	render(<Actions {...cellProps} />);
	fireEvent.click(screen.getByText('common.view'));
	expect(mockSetParams).toHaveBeenCalledWith({ order: 'order-1' });
});
it.each([
	'completed',
	'processing',
	'on-hold',
	'pending',
	'failed',
	'refunded',
	'cancelled',
	'pos-open',
	'pos-partial',
	'trash',
])('preserves refund eligibility for %s', (status) => {
	mockOrder.payload.status = status;
	render(<Actions {...cellProps} />);
	expect(!!screen.queryByTestId('order-refund-menu-item')).toBe(
		['completed', 'processing', 'on-hold'].includes(status)
	);
	mockOrder.payload.status = 'completed';
});
it('omits receipt, sync and refund without a persisted id', () => {
	mockOrder.payload.id = 0;
	render(<Actions {...cellProps} />);
	for (const key of ['common.receipt', 'common.sync', 'orders.refund'])
		expect(screen.queryByText(key)).toBeNull();
	mockOrder.payload.id = 42;
});
it('keeps edit and receipt route targets', () => {
	render(<Actions {...cellProps} />);
	fireEvent.click(screen.getByText('common.edit'));
	expect(mockPush).toHaveBeenLastCalledWith({
		pathname: '/orders/edit/[orderId]',
		params: { orderId: 'order-1' },
	});
	fireEvent.click(screen.getByText('common.receipt'));
	expect(mockPush).toHaveBeenLastCalledWith({
		pathname: '/orders/receipt/[orderId]',
		params: { orderId: 'order-1' },
	});
});
it('hides all actions when read-only', () => {
	mockReadOnly = true;
	render(<Actions {...cellProps} />);
	expect(screen.queryByText('common.edit')).toBeNull();
	mockReadOnly = false;
});
