/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DisplayOptions } from './display-options';
jest.mock('expo-haptics', () => ({}));
const mockPatch = jest.fn();
const mockReset = jest.fn();
let mockOpenAutoFocus: (event: { preventDefault: () => void }) => void;
const mockSettings = {
	columns: [
		{ key: 'number', show: true },
		{ key: 'total', show: true },
	],
};
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: mockSettings,
		getUILabel: (key: string) => key,
		patchUI: mockPatch,
		resetUI: mockReset,
	}),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query', () => ({
	useDocField: (v: unknown, select: (v: unknown) => unknown) => select(v),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ children }: React.PropsWithChildren) => children,
	PopoverTrigger: ({ children }: React.PropsWithChildren) => children,
	PopoverContent: ({
		children,
		testID,
		onOpenAutoFocus,
	}: React.PropsWithChildren<{ testID: string; onOpenAutoFocus: typeof mockOpenAutoFocus }>) => {
		mockOpenAutoFocus = onOpenAutoFocus;
		return <div data-testid={testID}>{children}</div>;
	},
}));
jest.mock('@wcpos/components/dnd', () => ({
	DragHandle: ({ children }: React.PropsWithChildren) => children,
	SortableList: ({
		items,
		renderItem,
	}: {
		items: { id: string }[];
		renderItem: (item: { id: string }, index: number) => React.ReactNode;
	}) => items.map(renderItem),
}));
jest.mock('../pos/contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
it('patches a column immediately and restores defaults without a dialog footer', async () => {
	render(<DisplayOptions />);
	fireEvent.click(screen.getAllByRole('switch')[0]);
	await waitFor(() => expect(mockPatch).toHaveBeenCalledWith({ 'columns.0.show': false }));
	fireEvent.click(screen.getByTestId('coupons-display-restore'));
	expect(mockReset).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('ui-settings-close')).toBeNull();
});

jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/dialog', () => ({}));
jest.mock('@wcpos/components/tooltip', () => ({}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: React.PropsWithChildren) => children,
	CollapsibleContent: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	const { useFormChangeHandler } = jest.requireActual(
		'@wcpos/components/form/use-form-change-handler'
	);
	return {
		Form: FormProvider,
		FormField: Controller,
		useFormChangeHandler,
		FormSwitch: ({
			value,
			onChange,
			label,
		}: {
			value: boolean;
			onChange: (v: boolean) => void;
			label: string;
		}) => (
			<input
				type="checkbox"
				role="switch"
				aria-label={label}
				checked={value}
				onChange={(event) => onChange(event.currentTarget.checked)}
			/>
		),
	};
});

it('focuses the first column switch on opening rather than Restore defaults', () => {
	render(<DisplayOptions />);
	mockOpenAutoFocus({ preventDefault: jest.fn() });
	expect(document.activeElement).toBe(screen.getAllByRole('switch')[0]);
});
