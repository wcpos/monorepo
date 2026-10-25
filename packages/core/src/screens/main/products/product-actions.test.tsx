/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { EditProductForm } from './edit/product/form';
import { EditVariationForm } from './edit/variation/form';

const mockEngine = { id: 'engine' };
const mockRequestServerDelete = jest.fn(async (..._args: unknown[]) => ({ annihilated: true }));
// The engine's answer: true when the store's copy was applied.
const mockRefresh = jest.fn(async (..._args: unknown[]) => true);
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
		AlertDialogFooter: jest.requireActual('../../../../jest/footer.test-utils').AlertDialogFooter,
	};
});

type Kind = 'product' | 'variation';
const record = (id?: number) => {
	const item = {
		uuid: 'uuid-1',
		payload: { id, name: 'Hoodie', categories: [], meta_data: [] },
		toMutableJSON: () => item,
		getLatest: () => item,
	};
	return item as unknown as EngineRecord<'products'> & EngineRecord<'variations'>;
};
const mockCallbacksContext = React.createContext<{
	onDeleted: () => void;
	onSynced?: () => void;
	beforeSync?: () => Promise<boolean>;
}>({ onDeleted: () => {} });
jest.mock('react-hook-form', () => ({
	useForm: () => {
		const { onSynced } = React.useContext(mockCallbacksContext);
		return { reset: () => onSynced?.() };
	},
}));
jest.mock('./edit/use-catalogue-autosave', () => ({
	useCatalogueAutosave: () => {
		const { beforeSync } = React.useContext(mockCallbacksContext);
		return { flush: async () => (beforeSync ? beforeSync() : true) };
	},
}));
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormField: () => null,
	SavedMark: () => null,
}));
jest.mock('@wcpos/components/dialog', () => ({
	useDialog: () => ({ close: React.useContext(mockCallbacksContext).onDeleted }),
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({
		destructive,
		record,
		close,
	}: import('@wcpos/components/dialog').DialogFooterProps) => (
		<>
			{[destructive, record, typeof close === 'object' ? { ...close, label: 'Close' } : undefined]
				.flat()
				.filter((action): action is import('@wcpos/components/dialog').FooterButton => !!action)
				.map((action) => (
					<button
						key={action.testID}
						data-testid={action.testID}
						onClick={action.onPress as unknown as React.MouseEventHandler}
					>
						{action.label}
					</button>
				))}
		</>
	),
}));
jest.mock('../components/currency-input', () => ({ CurrencyInput: () => null }));
jest.mock('../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../components/meta-data-form', () => ({ MetaDataForm: () => null, metaDataSchema: {} }));
jest.mock('../components/number-input', () => ({ NumberInput: () => null }));
jest.mock('../components/product/status-select', () => ({ ProductStatusSelect: () => null }));
jest.mock('../components/tax-class-select', () => ({ TaxClassSelect: () => null }));
jest.mock('../components/tax-status-radio-group', () => ({ TaxStatusRadioGroup: () => null }));
jest.mock('../components/product/category-select', () => ({ CategoryTreeLoader: () => null }));

// Render the migrated forms with their real action hooks and confirmation dialogs.
function Harness({
	kind,
	item,
	onDeleted,
	onSynced,
	beforeSync,
}: {
	kind: Kind;
	item: ReturnType<typeof record>;
	onDeleted: () => void;
	onSynced?: () => void;
	beforeSync?: () => Promise<boolean>;
}) {
	return (
		<mockCallbacksContext.Provider value={{ onDeleted, onSynced, beforeSync }}>
			{kind === 'product' ? (
				<EditProductForm product={item} />
			) : (
				<EditVariationForm variation={item} />
			)}
		</mockCallbacksContext.Provider>
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

	it('Sync refreshes by the Woo id, and only a pushed record offers it', async () => {
		const { unmount } = render(<Harness kind={kind} item={record()} onDeleted={jest.fn()} />);
		expect(screen.queryByTestId(`${kind}-modal-sync`)).toBeNull();
		unmount();
		render(<Harness kind={kind} item={record(42)} onDeleted={jest.fn()} />);
		await act(async () => fireEvent.click(screen.getByTestId(`${kind}-modal-sync`)));
		expect(mockRefresh).toHaveBeenCalledWith(mockEngine, {
			id: `${kind}-actions:refresh:42`,
			collection,
			wooId: 42,
		});
	});

	it('Sync waits for autosave and only pulls when it succeeds', async () => {
		const beforeSync = jest.fn().mockResolvedValue(false);
		render(<Harness kind={kind} item={record(42)} onDeleted={jest.fn()} beforeSync={beforeSync} />);
		fireEvent.click(screen.getByTestId(`${kind}-modal-sync`));
		await act(async () => {});
		expect(mockRefresh).not.toHaveBeenCalled();

		beforeSync.mockResolvedValue(true);
		fireEvent.click(screen.getByTestId(`${kind}-modal-sync`));
		expect(mockRefresh).not.toHaveBeenCalled();
		await act(async () => {});
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

	it('a refresh that settles without applying the row keeps what the cashier typed', async () => {
		const onSynced = jest.fn();
		mockRefresh.mockResolvedValueOnce(false);
		render(<Harness kind={kind} item={record(42)} onDeleted={jest.fn()} onSynced={onSynced} />);
		await act(async () => fireEvent.click(screen.getByTestId(`${kind}-modal-sync`)));
		expect(onSynced).not.toHaveBeenCalled();
	});
});

it("a variation's confirm says there is no Trash for variations", () => {
	render(<Harness kind="variation" item={record(42)} onDeleted={jest.fn()} />);
	fireEvent.click(screen.getByTestId('variation-modal-delete'));
	expect(screen.getByTestId('delete-dialog').textContent).toContain(
		'products.are_you_sure_you_want_to_2'
	);
});
