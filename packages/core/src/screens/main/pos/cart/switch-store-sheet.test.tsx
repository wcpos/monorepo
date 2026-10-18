/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Toast } from '@wcpos/components/toast';

import { SwitchStoreSheet } from './switch-store-sheet';

let mockSwitching = false;
const mockSwitch = jest.fn(async () => {});
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('./use-switch-store', () => ({
	useSwitchStore: () => ({
		...jest.requireActual('./use-switch-store').useSwitchStore(),
		...(mockSwitching ? { isSwitching: true } : {}),
	}),
}));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => [
		{ localID: 'store-1', name: 'One' },
		{ localID: 'store-2', name: 'Two' },
	],
}));
jest.mock('../../hooks/store-list-resource', () => ({ storeListResource: () => ({}) }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		wpCredentials: {},
		store: { localID: 'store-1' },
		switchStore: mockSwitch,
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
// The dialog's dismissal paths (X, scrim, back) all arrive as onOpenChange(false).
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({
		children,
		onOpenChange,
	}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => (
		<div>
			<button data-testid="dismiss" onClick={() => onOpenChange(false)} />
			{children}
		</div>
	),
	DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void; disabled?: boolean }>) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/portal', () => ({
	Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	...jest.requireActual('@wcpos/components/text'),
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	ScrollView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));

beforeEach(() => {
	mockSwitching = false;
	jest.clearAllMocks();
});

it('switches to the chosen store, then closes', async () => {
	const onOpenChange = jest.fn();
	render(<SwitchStoreSheet open onOpenChange={onOpenChange} />);
	expect(screen.queryByTestId('store-switch-overlay')).toBeNull();
	await React.act(async () => {
		fireEvent.click(screen.getByTestId('switch-store-row-store-2'));
	});
	expect(mockSwitch).toHaveBeenCalledWith(expect.objectContaining({ localID: 'store-2' }));
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

// Revert: let the sheet close mid-switch, or drop the overlay the header's store menu kept.
it('blocks the app and refuses dismissal while a switch is hydrating', () => {
	mockSwitching = true;
	const onOpenChange = jest.fn();
	render(<SwitchStoreSheet open onOpenChange={onOpenChange} />);
	expect(screen.getByTestId('store-switch-overlay')).toBeTruthy();
	fireEvent.click(screen.getByTestId('dismiss'));
	expect(onOpenChange).not.toHaveBeenCalled();
	const row = screen.getByTestId('switch-store-row-store-2');
	expect(row.getAttribute('aria-disabled')).toBe('true');
	fireEvent.click(row);
	expect(mockSwitch).not.toHaveBeenCalled();
});

it('keeps the sheet open and shows a toast when hydration fails', async () => {
	mockSwitch.mockRejectedValueOnce(new Error('hydration failed'));
	const onOpenChange = jest.fn();
	render(<SwitchStoreSheet open onOpenChange={onOpenChange} />);
	await React.act(async () => fireEvent.click(screen.getByTestId('switch-store-row-store-2')));
	expect(onOpenChange).not.toHaveBeenCalled();
	expect(mockReplace).not.toHaveBeenCalled();
	expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
});

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
