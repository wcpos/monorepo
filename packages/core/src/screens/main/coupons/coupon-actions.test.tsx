/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { DeleteCouponDialog, useCouponActions } from './coupon-actions';

const mockEngine = { id: 'engine' };
const mockRequestServerDelete = jest.fn(async (..._args: unknown[]) => ({ annihilated: true }));
const mockRefresh = jest.fn(async (..._args: unknown[]) => undefined);
let mockCanDelete = true;

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	refreshCollection: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('../hooks/mutations/request-server-delete', () => ({
	requestServerDelete: (...args: unknown[]) => mockRequestServerDelete(...args),
}));
jest.mock('../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canDeleteCoupons: mockCanDelete } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
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
			disabled,
		}: React.PropsWithChildren<{ onPress: () => void; testID: string; disabled: boolean }>) => (
			<button data-testid={testID} disabled={disabled} onClick={onPress}>
				{children}
			</button>
		),
	};
});
jest.mock('@wcpos/components/checkbox', () => ({ Checkbox: () => null }));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children, onPress }: React.PropsWithChildren<{ onPress: () => void }>) => (
		<span data-testid="force-label" onClick={onPress}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const record = (id?: number) =>
	({ uuid: 'uuid-1', payload: { id, code: 'SAVE10' } }) as EngineRecord<'coupons'>;

// Wired the way `edit/form.tsx` wires the footer and the dialog.
function Harness({
	coupon,
	onDeleted,
	onSynced,
}: {
	coupon: ReturnType<typeof record>;
	onDeleted: () => void;
	onSynced?: () => void;
}) {
	const actions = useCouponActions(coupon, { onDeleted, onSynced });
	return (
		<>
			{actions.canDelete && <button data-testid="delete" onClick={actions.requestDelete} />}
			{actions.canSync && <button data-testid="sync" onClick={actions.sync} />}
			<button data-testid="cancel" onClick={() => actions.setDeleteOpen(false)} />
			<DeleteCouponDialog
				record={coupon}
				open={actions.deleteOpen}
				onOpenChange={actions.setDeleteOpen}
				force={actions.force}
				onForceChange={actions.setForce}
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

it('Delete opens the confirm, which deletes the record on the server and then closes the modal', async () => {
	const onDeleted = jest.fn();
	render(<Harness coupon={record()} onDeleted={onDeleted} />);
	expect(screen.queryByTestId('delete-dialog')).toBeNull();
	fireEvent.click(screen.getByTestId('delete'));
	expect(screen.getByTestId('delete-dialog').textContent).toContain('coupons.delete');
	// Never pushed: force is on, so the confirm is enabled.
	await act(async () => fireEvent.click(screen.getByTestId('coupon-delete-confirm-button')));
	expect(mockRequestServerDelete).toHaveBeenCalledWith(mockEngine, {
		collection: 'coupons',
		recordId: 'uuid-1',
	});
	expect(onDeleted).toHaveBeenCalledTimes(1);
});

it('a pushed coupon needs the force checkbox before Delete', () => {
	render(<Harness coupon={record(42)} onDeleted={jest.fn()} />);
	fireEvent.click(screen.getByTestId('delete'));
	expect((screen.getByTestId('coupon-delete-confirm-button') as HTMLButtonElement).disabled).toBe(
		true
	);
});

it('Sync refreshes the coupons collection, and only a pushed coupon offers it', () => {
	const { unmount } = render(<Harness coupon={record()} onDeleted={jest.fn()} />);
	expect(screen.queryByTestId('sync')).toBeNull();
	unmount();
	render(<Harness coupon={record(42)} onDeleted={jest.fn()} />);
	fireEvent.click(screen.getByTestId('sync'));
	expect(mockRefresh).toHaveBeenCalledWith(mockEngine, {
		id: 'coupon-actions:refresh',
		collection: 'coupons',
	});
});

it('offers no Delete without the delete capability', () => {
	mockCanDelete = false;
	render(<Harness coupon={record(42)} onDeleted={jest.fn()} />);
	expect(screen.queryByTestId('delete')).toBeNull();
});

it('every opening re-arms the confirm: a checked force does not survive Cancel', () => {
	render(<Harness coupon={record(42)} onDeleted={jest.fn()} />);
	const confirm = () => screen.getByTestId('coupon-delete-confirm-button') as HTMLButtonElement;
	fireEvent.click(screen.getByTestId('delete'));
	fireEvent.click(screen.getByTestId('force-label'));
	expect(confirm().disabled).toBe(false);
	fireEvent.click(screen.getByTestId('cancel'));
	fireEvent.click(screen.getByTestId('delete'));
	expect(confirm().disabled).toBe(true);
});

it('a refresh that lands hands the form the store copy; a failed one does not', async () => {
	const onSynced = jest.fn();
	render(<Harness coupon={record(42)} onDeleted={jest.fn()} onSynced={onSynced} />);
	await act(async () => fireEvent.click(screen.getByTestId('sync')));
	expect(onSynced).toHaveBeenCalledTimes(1);
	mockRefresh.mockRejectedValueOnce(new Error('offline'));
	await act(async () => fireEvent.click(screen.getByTestId('sync')));
	expect(onSynced).toHaveBeenCalledTimes(1);
});
