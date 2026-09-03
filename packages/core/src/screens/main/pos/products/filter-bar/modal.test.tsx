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
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read({ filterBar: [saved] }),
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
jest.mock('./quick-filter-editor', () => ({
	QuickFilterEditor: () => <div>Editor open</div>,
}));
jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, patchUI: jest.fn() }),
}));

it('closes the editor when the filter being edited is deleted', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	expect(screen.getByText('Editor open')).toBeTruthy();

	fireEvent.click(screen.getByText('Delete'));
	expect(screen.queryByText('Editor open')).toBeNull();
});
