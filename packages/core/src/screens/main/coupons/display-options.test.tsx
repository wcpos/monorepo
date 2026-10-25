/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DisplayOptions } from './display-options';
jest.mock('expo-haptics', () => ({}));
const mockPatch = jest.fn();
const mockReset = jest.fn();
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
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => children,
	DialogContent: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogHeader: ({ children }: React.PropsWithChildren) => children,
	DialogTitle: ({ children }: React.PropsWithChildren) => children,
	DialogBody: ({ children }: React.PropsWithChildren) => children,
	DialogFooter: jest.requireActual('../../../../jest/footer.test-utils').DialogFooter,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => children,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => children,
	TooltipContent: () => null,
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
it('opens the columns in the settings panel, patches immediately and restores from its footer', async () => {
	render(<DisplayOptions />);
	expect(screen.getByTestId('coupons-display-options')).toBeTruthy();
	fireEvent.click(screen.getAllByRole('switch')[0]);
	await waitFor(() => expect(mockPatch).toHaveBeenCalledWith({ 'columns.0.show': false }));
	fireEvent.click(screen.getByTestId('coupons-display-restore'));
	expect(mockReset).toHaveBeenCalledTimes(1);
	// Per-page footer ids: the POS panels' generic ids stay unique to them.
	expect(screen.getByTestId('coupons-display-close')).toBeTruthy();
	expect(screen.queryByTestId('ui-settings-close')).toBeNull();
	expect(screen.queryByTestId('ui-settings-restore-defaults')).toBeNull();
});

jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
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
