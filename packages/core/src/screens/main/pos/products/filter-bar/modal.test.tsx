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
jest.mock('./filter-bar-list', () => ({
	FilterBarList: ({
		onEdit,
		onDelete,
	}: {
		onEdit: (value: typeof saved | null) => void;
		onDelete: (value: typeof saved) => void;
	}) => (
		<>
			<button onClick={() => onEdit(saved)}>Edit</button>
			<button onClick={() => onEdit(null)}>Add</button>
			<button onClick={() => onDelete(saved)}>Delete</button>
		</>
	),
}));
let editorOnChange: ((quickFilter: typeof saved) => unknown) | undefined;
let editorOnSave: (quickFilter: typeof saved) => void;
jest.mock('./quick-filter-editor', () => ({
	QuickFilterEditor: ({
		onChange,
		onSave,
	}: {
		onChange?: (quickFilter: typeof saved) => unknown;
		onSave: (quickFilter: typeof saved) => void;
	}) => {
		editorOnSave = onSave;
		editorOnChange = onChange;
		return <div>Editor open</div>;
	},
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	editorOnChange = undefined;
	jest.clearAllMocks();
});

it('closes the editor when the filter being edited is deleted', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	expect(screen.getByText('Editor open')).toBeTruthy();

	fireEvent.click(screen.getByText('Delete'));
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
	fireEvent.click(screen.getByText('Delete'));
	onChange({ ...saved, label: 'Renamed' });

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	const old = [...DEFAULT_FILTER_BAR, { ...saved, id: 'another' }];
	expect(modifier(old)).toEqual(old);
});

it('appends a created filter to the current list', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	act(() => editorOnSave(saved));

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	const old = [...DEFAULT_FILTER_BAR, { ...saved, id: 'another' }];
	expect(modifier(old)).toEqual([...old, saved]);
});

it('replaces a created filter whose id is already in the current list', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	const created = { ...saved, label: 'Replaced' };
	act(() => editorOnSave(created));

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([saved, ...DEFAULT_FILTER_BAR])).toEqual([created, ...DEFAULT_FILTER_BAR]);
});
