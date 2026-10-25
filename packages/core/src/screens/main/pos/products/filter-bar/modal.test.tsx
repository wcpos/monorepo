/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DEFAULT_FILTER_BAR } from './filter-bar-layout';
import { FilterBarModal } from './modal';

const saved = {
	id: 'saved',
	type: 'quick' as const,
	label: 'Saved',
	conditions: [{ field: 'featured' as const, value: true }],
};

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
let filterBar: unknown[] = [saved];
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read({ filterBar }),
}));
let params: { edit?: string; new?: string } = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => params }));
jest.mock('../../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID, onPress }: { testID: string; onPress: () => void }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/pane-stack', () => ({
	PaneStack: ({
		detail,
		renderDetail,
		children,
	}: React.PropsWithChildren<{
		detail: unknown;
		renderDetail: (detail: unknown) => React.ReactNode;
	}>) => (detail ? renderDetail(detail) : children),
}));
jest.mock('./filter-bar-list', () => ({
	FilterBarList: ({ onEdit }: { onEdit: (value: typeof saved | null) => void }) => (
		<>
			<button onClick={() => onEdit(saved)}>Edit</button>
			<button onClick={() => onEdit(null)}>Add</button>
		</>
	),
}));
let editorOnChange: ((quickFilter: typeof saved) => unknown) | undefined;
let editorOnDraftChange: (quickFilter: typeof saved, valid: boolean) => void;
const flush = jest.fn();
jest.mock('./quick-filter-editor', () => ({
	QuickFilterEditor: ({
		onChange,
		onDraftChange,
		onDelete,
		flushRef,
		initial,
	}: {
		onChange?: (quickFilter: typeof saved) => unknown;
		onDraftChange: typeof editorOnDraftChange;
		onDelete: () => void;
		flushRef: React.Ref<() => void>;
		initial: typeof saved | null;
	}) => {
		const { DeleteQuickFilterDialog } = jest.requireActual('./delete-quick-filter-dialog');
		const [deleting, setDeleting] = React.useState(false);
		React.useImperativeHandle(flushRef, () => flush);
		editorOnChange = onChange;
		editorOnDraftChange = onDraftChange;
		return (
			<>
				<div>Editor open</div>
				{initial && (
					<>
						<button
							data-testid={`filter-bar-delete-${initial.id}`}
							onClick={() => setDeleting(true)}
						/>
						<DeleteQuickFilterDialog
							quickFilter={deleting ? initial : null}
							onClose={() => setDeleting(false)}
							onDelete={onDelete}
						/>
					</>
				)}
			</>
		);
	},
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? children : null,
	AlertDialogContent: ({ children }: React.PropsWithChildren) => children,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => children,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => children,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => children,
	AlertDialogFooter: ({ confirm }: { confirm: { testID: string; onPress: () => void } }) => (
		<button data-testid={confirm.testID} onClick={confirm.onPress} />
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({
		intent,
		close,
	}: {
		intent?: { testID: string; onPress: () => void; disabled: boolean };
		close?: { testID: string };
	}) => (
		<>
			{close && <button data-testid={close.testID} />}
			{intent && (
				<button data-testid={intent.testID} disabled={intent.disabled} onClick={intent.onPress} />
			)}
		</>
	),
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('react-native', () => ({
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
const patchUI = jest.fn();
const modifyUI = jest.fn();
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, patchUI, modifyUI }),
}));

beforeEach(() => {
	filterBar = [saved];
	params = {};
	editorOnChange = undefined;
	jest.clearAllMocks();
});

it('pops to the list when the filter being edited is removed', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	expect(screen.getByText('Editor open')).toBeTruthy();

	fireEvent.click(screen.getByTestId('filter-bar-delete-saved'));
	expect(modifyUI).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	expect(screen.queryByText('Editor open')).toBeNull();
});

it('edits its item without overwriting a pill toggled off meanwhile', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	editorOnChange!({ ...saved, label: 'Renamed' });

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	const old = [{ id: 'on_sale', type: 'pill', show: false }, saved];
	expect(modifier(old).slice(0, 2)).toEqual([
		{ id: 'on_sale', type: 'pill', show: false },
		{ ...saved, label: 'Renamed' },
	]);
});

it('leaves the current list unchanged when the edited filter has been deleted', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	const onChange = editorOnChange!;
	fireEvent.click(screen.getByTestId('filter-bar-delete-saved'));
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	modifyUI.mockClear();
	onChange({ ...saved, label: 'Renamed' });

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	const old = [...DEFAULT_FILTER_BAR, { ...saved, id: 'another' }];
	expect(modifier(old)).toEqual(old);
});

it('appends a created filter to the current list', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	act(() => editorOnDraftChange(saved, true));
	fireEvent.click(screen.getByTestId('quick-filter-add'));
	expect(flush).toHaveBeenCalled();
	expect(screen.queryByText('Editor open')).toBeNull();

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	const old = [...DEFAULT_FILTER_BAR, { ...saved, id: 'another' }];
	expect(modifier(old)).toEqual([...old, saved]);
});

it('replaces a created filter whose id is already in the current list', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	const created = { ...saved, label: 'Replaced' };
	act(() => editorOnDraftChange({ ...created, label: ' Replaced ' }, true));
	fireEvent.click(screen.getByTestId('quick-filter-add'));

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([saved, ...DEFAULT_FILTER_BAR])).toEqual([created, ...DEFAULT_FILTER_BAR]);
});

it('disables the footer intent until the editor reports a valid draft', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
	act(() => editorOnDraftChange(saved, true));
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(false);
	act(() => editorOnDraftChange(saved, false));
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
});
it.each([{ edit: 'saved' }, { new: '1' }])(
	'opens the routed editor %j and Back pops to the list',
	(route) => {
		params = route;
		render(<FilterBarModal />);
		expect(screen.getByText('Editor open')).toBeTruthy();
		fireEvent.click(screen.getByTestId('filter-bar-back'));
		expect(screen.getByText('Add')).toBeTruthy();
	}
);
it('falls back to the list for an unknown edit id', () => {
	params = { edit: 'missing' };
	render(<FilterBarModal />);
	expect(screen.queryByText('Editor open')).toBeNull();
});
it('pops a routed editor after removal without closing the panel', () => {
	params = { edit: 'saved' };
	render(<FilterBarModal />);
	fireEvent.click(screen.getByTestId('filter-bar-delete-saved'));
	expect(modifyUI).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([saved, ...DEFAULT_FILTER_BAR])).toEqual(DEFAULT_FILTER_BAR);
	expect(screen.queryByText('Editor open')).toBeNull();
	expect(screen.getByTestId('filter-bar-modal-close')).toBeTruthy();
});
