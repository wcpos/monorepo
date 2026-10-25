/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

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
		onEdit: (value: typeof saved) => void;
		onDelete: (value: typeof saved) => void;
	}) => (
		<>
			<button onClick={() => onEdit(saved)}>Edit</button>
			<button onClick={() => onDelete(saved)}>Delete</button>
		</>
	),
}));
let editorOnChange: ((quickFilter: typeof saved) => unknown) | undefined;
jest.mock('./quick-filter-editor', () => ({
	QuickFilterEditor: ({ onChange }: { onChange?: (quickFilter: typeof saved) => unknown }) => {
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
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, patchUI }),
}));

beforeEach(() => {
	filterBar = [saved];
	editorOnChange = undefined;
	patchUI.mockClear();
});

it('closes the editor when the filter being edited is deleted', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	expect(screen.getByText('Editor open')).toBeTruthy();

	fireEvent.click(screen.getByText('Delete'));
	expect(screen.queryByText('Editor open')).toBeNull();
});

it('applies a delayed edit to the list as it stands, not the list at keystroke time', () => {
	const pill = { id: 'on_sale', type: 'pill' as const, show: true };
	filterBar = [pill, saved];
	const { rerender } = render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	const onChange = editorOnChange!;

	// The pill is hidden while the rename's debounce is still running.
	filterBar = [{ ...pill, show: false }, saved];
	rerender(<FilterBarModal />);
	onChange({ ...saved, label: 'Renamed' });

	// The normalizer appends the built-in pills the list lacks; the first two are the ones asserted.
	const written = patchUI.mock.calls[0][0].filterBar;
	expect(written.slice(0, 2)).toEqual([
		{ ...pill, show: false },
		{ ...saved, label: 'Renamed' },
	]);
});
