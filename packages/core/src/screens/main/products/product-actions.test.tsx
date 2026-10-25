/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import {
	DeleteProductDialog,
	DeleteVariationDialog,
	RecordFooterActions,
	useProductActions,
	useVariationActions,
} from './product-actions';

const mockEngine = { id: 'engine' };
const mockRequestServerDelete = jest.fn(async (..._args: unknown[]) => ({ annihilated: true }));
const mockRefresh = jest.fn(async (..._args: unknown[]) => undefined);
let mockCanDelete = true;

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	refreshRecordByWooId: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('../hooks/mutations/request-server-delete', () => ({
	requestServerDelete: (...args: unknown[]) => mockRequestServerDelete(...args),
}));
jest.mock('../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({
		caps: { canDeleteProducts: mockCanDelete, canDeleteVariations: mockCanDelete },
	}),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/alert-dialog', () => {
	function Pass({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
			open ? <div data-testid="delete-dialog">{children}</div> : null,
		AlertDialogContent: Pass,
		AlertDialogHeader: Pass,
		AlertDialogTitle: Pass,
		AlertDialogDescription: Pass,
		AlertDialogFooter: Pass,
		AlertDialogCancel: Pass,
		AlertDialogAction: ({
			children,
			onPress,
			testID,
		}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
			<button data-testid={testID} onClick={onPress}>
				{children}
			</button>
		),
	};
});

type Kind = 'product' | 'variation';
const record = (id?: number) =>
	({ uuid: 'uuid-1', payload: { id, name: 'Hoodie' } }) as unknown as EngineRecord<'products'> &
		EngineRecord<'variations'>;

// Wired the way the edit forms wire the footer and the dialog.
function Harness({
	kind,
	item,
	onDeleted,
	onSynced,
}: {
	kind: Kind;
	item: ReturnType<typeof record>;
	onDeleted: () => void;
	onSynced?: () => void;
}) {
	const productActions = useProductActions(item, { onDeleted, onSynced });
	const variationActions = useVariationActions(item, { onDeleted, onSynced });
	const actions = kind === 'product' ? productActions : variationActions;
	const Dialog = kind === 'product' ? DeleteProductDialog : DeleteVariationDialog;
	return (
		<>
			<RecordFooterActions actions={actions} testIDPrefix={kind} />
			<Dialog
				record={item}
				open={actions.deleteOpen}
				onOpenChange={actions.setDeleteOpen}
				onConfirm={() => void actions.confirmDelete()}
			/>
		</>
	);
}

beforeEach(() => {
	mockCanDelete = true;
	mockRequestServerDelete.mockClear();
	mockRefresh.mockClear();
});

describe.each([
	['product', 'products'],
	['variation', 'variations'],
] as const)('the %s modal actions', (kind, collection) => {
	it('Delete opens the confirm, which deletes on the server and then closes the modal', async () => {
		const onDeleted = jest.fn();
		render(<Harness kind={kind} item={record(42)} onDeleted={onDeleted} />);
		expect(screen.queryByTestId('delete-dialog')).toBeNull();
		fireEvent.click(screen.getByTestId(`${kind}-modal-delete`));
		expect(screen.getByTestId('delete-dialog').textContent).toContain('products.delete');
		await act(async () => fireEvent.click(screen.getByTestId(`${kind}-delete-confirm-button`)));
		expect(mockRequestServerDelete).toHaveBeenCalledWith(mockEngine, {
			collection,
			recordId: 'uuid-1',
		});
		expect(onDeleted).toHaveBeenCalledTimes(1);
	});

	it('offers no Delete without the delete capability', () => {
		mockCanDelete = false;
		render(<Harness kind={kind} item={record(42)} onDeleted={jest.fn()} />);
		expect(screen.queryByTestId(`${kind}-modal-delete`)).toBeNull();
		expect(screen.getByTestId(`${kind}-modal-sync`)).toBeTruthy();
	});

	it('Sync refreshes by the Woo id, and only a pushed record offers it', () => {
		const { unmount } = render(<Harness kind={kind} item={record()} onDeleted={jest.fn()} />);
		expect(screen.queryByTestId(`${kind}-modal-sync`)).toBeNull();
		unmount();
		render(<Harness kind={kind} item={record(42)} onDeleted={jest.fn()} />);
		fireEvent.click(screen.getByTestId(`${kind}-modal-sync`));
		expect(mockRefresh).toHaveBeenCalledWith(mockEngine, {
			id: `${kind}-actions:refresh:42`,
			collection,
			wooId: 42,
		});
	});

	it('a refresh that lands hands the form the store copy; a failed one does not', async () => {
		const onSynced = jest.fn();
		render(<Harness kind={kind} item={record(42)} onDeleted={jest.fn()} onSynced={onSynced} />);
		await act(async () => fireEvent.click(screen.getByTestId(`${kind}-modal-sync`)));
		expect(onSynced).toHaveBeenCalledTimes(1);
		mockRefresh.mockRejectedValueOnce(new Error('offline'));
		await act(async () => fireEvent.click(screen.getByTestId(`${kind}-modal-sync`)));
		expect(onSynced).toHaveBeenCalledTimes(1);
	});
});

it("a variation's confirm says there is no Trash for variations", () => {
	render(<Harness kind="variation" item={record(42)} onDeleted={jest.fn()} />);
	fireEvent.click(screen.getByTestId('variation-modal-delete'));
	expect(screen.getByTestId('delete-dialog').textContent).toContain(
		'products.are_you_sure_you_want_to_2'
	);
});
