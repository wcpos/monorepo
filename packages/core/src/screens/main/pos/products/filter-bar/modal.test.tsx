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

jest.mock('uuid', () => ({ v4: jest.fn(() => 'quick-filter-id') }));
let filterBar: unknown[] = [saved];
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read({ filterBar }),
}));
let params: { edit?: string; capture?: string } = {};
const back = jest.fn();
let retainLeaving = false;
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => params,
	useRouter: () => ({ back }),
}));
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
	}>) => {
		// Match PaneStack retaining the outgoing detail until its pop animation finishes.
		const [staged, setStaged] = React.useState(detail);
		if (detail && detail !== staged) setStaged(detail);
		return (
			<>
				{!detail && children}
				{detail || (retainLeaving && staged) ? renderDetail(detail || staged) : null}
			</>
		);
	},
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
let editorOnDraftChange: (quickFilter: typeof saved) => void;
const flush = jest.fn();
jest.mock('./quick-filter-editor', () => ({
	CONDITION_FIELDS: [
		'categories',
		'tags',
		'brands',
		'price',
		'on_sale',
		'featured',
		'stock_status',
		'type',
		'search',
	],
	KIND_ICONS: {},
	TermSummary: jest.requireActual('./quick-filter-editor').TermSummary,
	QuickFilterEditor: ({
		onChange,
		onDraftChange,
		flushRef,
		initial,
	}: {
		onChange?: (quickFilter: typeof saved) => unknown;
		onDraftChange: typeof editorOnDraftChange;
		flushRef: React.Ref<() => void>;
		initial: typeof saved | null;
	}) => {
		const { DeleteQuickFilterDialog } = jest.requireActual('./delete-quick-filter-dialog');
		const [deleting, setDeleting] = React.useState(false);
		const [name, setName] = React.useState('');
		React.useImperativeHandle(flushRef, () => flush);
		editorOnChange = onChange;
		editorOnDraftChange = onDraftChange;
		return (
			<>
				<div>Editor open</div>
				<input
					data-testid="draft-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
				{initial && (
					<>
						<button
							data-testid={`filter-bar-delete-${initial.id}`}
							onClick={() => setDeleting(true)}
						/>
						<DeleteQuickFilterDialog
							quickFilter={deleting ? initial : null}
							onClose={() => setDeleting(false)}
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
	DialogTitle: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
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
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecordsByWooId: (taxonomy: string, ids: number[]) => ({ taxonomy, ids }),
}));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: ({ taxonomy, ids }: { taxonomy: string; ids: number[] }) =>
		ids.map((id) => ({ payload: { id, name: `${taxonomy} ${id} &amp; more` } })),
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/select', () => ({}));
jest.mock('@wcpos/components/tree-combobox', () => ({}));
jest.mock('../../../components/currency-input', () => ({}));
jest.mock('../../../components/product/category-select', () => ({}));
jest.mock('../../../components/product/tag-select', () => ({}));
jest.mock('../../../components/product/brand-select', () => ({}));
const patchUI = jest.fn();
const modifyUI = jest.fn();
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, patchUI, modifyUI }),
}));

beforeEach(() => {
	filterBar = [saved];
	params = {};
	retainLeaving = false;
	editorOnChange = undefined;
	jest.clearAllMocks();
});

it('pops to the list when the filter being edited is removed', () => {
	const view = render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	expect(screen.getByText('Editor open')).toBeTruthy();

	fireEvent.click(screen.getByTestId('filter-bar-delete-saved'));
	expect(modifyUI).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	filterBar = [];
	view.rerender(<FilterBarModal />);
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
	act(() => editorOnDraftChange(saved));
	fireEvent.click(screen.getByTestId('quick-filter-add'));
	expect(flush).not.toHaveBeenCalled();
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
	act(() => editorOnDraftChange({ ...created, label: ' Replaced ' }));
	fireEvent.click(screen.getByTestId('quick-filter-add'));

	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([saved, ...DEFAULT_FILTER_BAR])).toEqual([created, ...DEFAULT_FILTER_BAR]);
});

it('disables the footer intent until the editor reports a valid draft', () => {
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
	act(() => editorOnDraftChange(saved));
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(false);
	act(() => editorOnDraftChange({ ...saved, label: '' }));
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
});
it.each([{ edit: 'saved' }])('opens the routed editor %j and Back pops to the list', (route) => {
	params = route;
	render(<FilterBarModal />);
	expect(screen.getByText('Editor open')).toBeTruthy();
	fireEvent.click(screen.getByTestId('filter-bar-back'));
	expect(screen.getByText('Add')).toBeTruthy();
});
it('falls back to the list for an unknown edit id', () => {
	params = { edit: 'missing' };
	render(<FilterBarModal />);
	expect(screen.queryByText('Editor open')).toBeNull();
});
it('pops a routed editor after removal without closing the panel', () => {
	params = { edit: 'saved' };
	const view = render(<FilterBarModal />);
	fireEvent.click(screen.getByTestId('filter-bar-delete-saved'));
	expect(modifyUI).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([saved, ...DEFAULT_FILTER_BAR])).toEqual(DEFAULT_FILTER_BAR);
	filterBar = [];
	view.rerender(<FilterBarModal />);
	expect(screen.queryByText('Editor open')).toBeNull();
	expect(screen.getByTestId('filter-bar-modal-close')).toBeTruthy();
});

it('reads an autosaved rename live in the header', () => {
	const view = render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Edit'));
	filterBar = [{ ...saved, label: 'Renamed' }];
	view.rerender(<FilterBarModal />);
	expect(screen.getByRole('heading').textContent).toBe('Renamed');
});

it('starts a fresh draft when Add reopens during the leaving animation', () => {
	const { v4 } = jest.requireMock('uuid');
	v4.mockReturnValueOnce('first').mockReturnValueOnce('second');
	retainLeaving = true;
	render(<FilterBarModal />);
	fireEvent.click(screen.getByText('Add'));
	fireEvent.change(screen.getByTestId('draft-name'), { target: { value: 'Previous draft' } });
	act(() => editorOnDraftChange(saved));
	fireEvent.click(screen.getByTestId('quick-filter-add'));
	fireEvent.click(screen.getByText('Add'));
	expect((screen.getByTestId('draft-name') as HTMLInputElement).value).toBe('');
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
});

jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID: string;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(event) => onChangeText(event.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/chip', () => ({ Chip: () => null }));
jest.mock('@wcpos/components/checkbox', () => ({
	Checkbox: ({ checked }: { checked: boolean }) => (
		<input type="checkbox" checked={checked} readOnly />
	),
}));
jest.mock('@wcpos/components/list-row', () => ({
	ListRow: ({
		testID,
		onPress,
		leading,
		children,
		role,
		'aria-checked': checked,
	}: React.PropsWithChildren<{
		testID: string;
		onPress: () => void;
		leading: React.ReactNode;
		role?: React.AriaRole;
		'aria-checked'?: boolean;
	}>) => (
		<div data-testid={testID} onClick={onPress} role={role} aria-checked={checked}>
			{leading}
			{children}
		</div>
	),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `£${value.toFixed(2)}` }),
}));
jest.mock('./quick-filter-preview', () => ({
	QuickFilterPreview: ({ draft }: { draft: unknown }) => (
		<output data-testid="effective">{JSON.stringify(draft)}</output>
	),
}));
const captured = {
	conditions: [
		{ field: 'categories', value: [1] },
		{ field: 'on_sale', value: true },
		{ field: 'search', value: 'mug' },
	],
	sort: { field: 'sortable_price', direction: 'asc' },
};
it.each(['categories', 'tags', 'brands'])('names the captured %s terms', (field) => {
	params = { capture: JSON.stringify({ conditions: [{ field, value: [1, 2] }] }) };
	render(<FilterBarModal />);
	expect(screen.getByTestId(`quick-filter-capture-${field}`).textContent).toBe(
		`pos_products.kind_${field}: ${field} 1 & more, ${field} 2 & more`
	);
});
it('opens capture with conditions checked except search and sort, and saves only checked lines', () => {
	params = { capture: JSON.stringify(captured) };
	render(<FilterBarModal />);
	expect(screen.getByRole('heading').textContent).toBe('pos_products.save_as_button');
	for (const field of ['categories', 'on_sale', 'search', 'sort']) {
		const row = screen.getByTestId(`quick-filter-capture-${field}`);
		expect(row.getAttribute('role')).toBe('checkbox');
		expect(row.getAttribute('aria-checked')).toBe(String(field !== 'search' && field !== 'sort'));
		expect(
			screen.getByTestId(`quick-filter-capture-${field}`).querySelector('input')!.checked
		).toBe(field !== 'search' && field !== 'sort');
	}
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: ' Sale wine ' } });
	fireEvent.click(screen.getByTestId('quick-filter-capture-on_sale'));
	expect(screen.getByTestId('quick-filter-capture-on_sale').getAttribute('aria-checked')).toBe(
		'false'
	);
	expect(JSON.parse(screen.getByTestId('effective').textContent!).conditions).toEqual([
		captured.conditions[0],
	]);
	expect(modifyUI).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('quick-filter-add'));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([saved, ...DEFAULT_FILTER_BAR])).toEqual([
		saved,
		...DEFAULT_FILTER_BAR,
		{
			id: 'quick-filter-id',
			type: 'quick',
			label: 'Sale wine',
			conditions: [captured.conditions[0]],
		},
	]);
	expect(back).toHaveBeenCalledTimes(1);
});
it('allows explicitly keeping search and sort, and disables an empty capture', () => {
	params = {
		capture: JSON.stringify({
			conditions: [{ field: 'search', value: 'mug' }],
			sort: captured.sort,
		}),
	};
	render(<FilterBarModal />);
	fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: 'Mugs' } });
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByTestId('quick-filter-capture-sort'));
	expect(screen.getByTestId('quick-filter-capture-sort').getAttribute('aria-checked')).toBe('true');
	expect((screen.getByTestId('quick-filter-add') as HTMLButtonElement).disabled).toBe(false);
	fireEvent.click(screen.getByTestId('quick-filter-capture-search'));
	expect(JSON.parse(screen.getByTestId('effective').textContent!)).toMatchObject({
		conditions: [{ field: 'search', value: 'mug' }],
		sort: captured.sort,
	});
});
it.each(['{broken', '{}', 'null'])(
	'shows the home list for an invalid capture param %s',
	(capture) => {
		params = { capture };
		render(<FilterBarModal />);
		expect(screen.getByText('Add')).toBeTruthy();
		expect(screen.queryByTestId('quick-filter-name')).toBeNull();
	}
);
